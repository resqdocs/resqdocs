// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPicoClient, isValidSsidId, TYPE_CHUNK_LIMIT, OTA_CHUNK_FALLBACK } from './picoClient.ts'
import type { HttpAdapter, HttpResponse } from './picoTypes.ts'

interface Call { method: string; url: string; body?: unknown }

/** Fake-HTTP-Adapter: zeichnet Aufrufe auf, antwortet über einen Handler. Keine Netzwerkaufrufe. */
function createFakeHttpAdapter(handler: (c: Call) => HttpResponse): HttpAdapter & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    async get(url) {
      const c = { method: 'GET', url }
      calls.push(c)
      return handler(c)
    },
    async post(url, body) {
      const c = { method: 'POST', url, body }
      calls.push(c)
      return handler(c)
    },
  }
}

const BASE = 'http://10.10.10.1'
const validStatus = { name: 'ResQDocs-7F3A91', fwVersion: '0.1.0', apiVersion: '0.1.0', ready: true, defaultOs: 'win_de' }

test('health() = true bei 2xx', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: 'ok' })), BASE)
  assert.equal(await client.health(), true)
})

test('health() = false bei Nicht-2xx', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 404, data: '' })), BASE)
  assert.equal(await client.health(), false)
})

test('health() = false bei Netzfehler (Adapter wirft)', async () => {
  const client = createPicoClient({ async get() { throw new Error('ECONN') }, async post() { throw new Error('ECONN') } }, BASE)
  assert.equal(await client.health(), false)
})

test('status() parst gültigen Status', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: validStatus })), BASE)
  assert.deepEqual(await client.status(), validStatus)
})

test('status() parst auch JSON-String-Antwort', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: JSON.stringify(validStatus) })), BASE)
  assert.equal((await client.status()).name, 'ResQDocs-7F3A91')
})

test('status() lehnt ungültigen/unvollständigen Status ab', async () => {
  const c1 = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: { ready: true } })), BASE)
  await assert.rejects(() => c1.status(), /unvollständig/)
  const c2 = createPicoClient(createFakeHttpAdapter(() => ({ status: 500, data: null })), BASE)
  await assert.rejects(() => c2.status(), /HTTP 500/)
})

test('typeText() sendet Body { text, os } und NICHT in der URL', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { typed: 14 } }))
  const client = createPicoClient(adapter, BASE)
  const r = await client.typeText({ text: 'Max Mustermann', os: 'ios' })
  assert.equal(r.typed, 14)
  const call = adapter.calls[0]
  assert.equal(call.method, 'POST')
  assert.equal(call.url, `${BASE}/type`)
  assert.ok(!call.url.includes('Mustermann'), 'Text darf nicht in der URL stehen')
  assert.deepEqual(call.body, { text: 'Max Mustermann', os: 'ios' })
})

test('typeText() schickt delayMs im Body mit, wenn gesetzt (Tippgeschwindigkeit)', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { typed: 3 } }))
  const client = createPicoClient(adapter, BASE)
  await client.typeText({ text: 'abc', os: 'win_de', delayMs: 30 })
  assert.deepEqual(adapter.calls[0].body, { text: 'abc', os: 'win_de', delayMs: 30 })
})

test('typeText() ohne delayMs schickt KEIN delayMs (abwärtskompatibel → Firmware-Default 60)', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { typed: 3 } }))
  const client = createPicoClient(adapter, BASE)
  await client.typeText({ text: 'abc', os: 'win_de' })
  assert.ok(!('delayMs' in (adapter.calls[0].body as object)), 'fehlendes delayMs darf nicht im Body landen')
})

test('typeText() Fehler ohne Payload (kein Text in der Fehlermeldung)', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 400, data: { error: 'invalid_body' } })), BASE)
  await assert.rejects(
    () => client.typeText({ text: 'Geheimer Patientenname', os: 'win_de' }),
    (e: Error) => /HTTP 400/.test(e.message) && !/Patientenname/.test(e.message),
  )
})

// --- Chunking (#18): Firmware-Grenze 16384 Zeichen pro /type-Request ---

/** Antwortet pro Request mit typed = Code-Point-Anzahl des empfangenen Chunks. */
function createCountingAdapter() {
  return createFakeHttpAdapter((c) => {
    const text = (c.body as { text: string }).text
    return { status: 200, data: { typed: Array.from(text).length } }
  })
}

test('typeText() mit genau 16384 Zeichen → genau 1 Request', async () => {
  const adapter = createCountingAdapter()
  const client = createPicoClient(adapter, BASE)
  const r = await client.typeText({ text: 'a'.repeat(TYPE_CHUNK_LIMIT), os: 'win_de' })
  assert.equal(adapter.calls.length, 1)
  assert.equal(r.typed, TYPE_CHUNK_LIMIT)
})

test('typeText() mit 16385 Zeichen → 2 Requests (16384 + 1), Summe korrekt', async () => {
  const adapter = createCountingAdapter()
  const client = createPicoClient(adapter, BASE)
  const r = await client.typeText({ text: 'a'.repeat(TYPE_CHUNK_LIMIT + 1), os: 'win_de' })
  assert.equal(adapter.calls.length, 2)
  assert.equal(Array.from((adapter.calls[0].body as { text: string }).text).length, TYPE_CHUNK_LIMIT)
  assert.equal(Array.from((adapter.calls[1].body as { text: string }).text).length, 1)
  assert.equal(r.typed, TYPE_CHUNK_LIMIT + 1)
})

test('typeText() Multi-Chunk: kein Request über der Grenze, Reihenfolge erhalten', async () => {
  const adapter = createCountingAdapter()
  const client = createPicoClient(adapter, BASE)
  const text = 'x'.repeat(TYPE_CHUNK_LIMIT * 2 + 7)
  const r = await client.typeText({ text, os: 'win_de' })
  assert.equal(adapter.calls.length, 3)
  for (const c of adapter.calls) {
    assert.ok(Array.from((c.body as { text: string }).text).length <= TYPE_CHUNK_LIMIT, 'Chunk über der Firmware-Grenze')
  }
  assert.equal(adapter.calls.map((c) => (c.body as { text: string }).text).join(''), text)
  assert.equal(r.typed, TYPE_CHUNK_LIMIT * 2 + 7)
})

test('typeText() zerreißt an der Chunk-Grenze keine Surrogate-Paare (Emoji/Umlaute)', async () => {
  const adapter = createCountingAdapter()
  const client = createPicoClient(adapter, BASE)
  // 16383 ASCII + Emoji (Surrogate-Paar) direkt an der Grenze + Umlaut-Rest
  const text = 'a'.repeat(TYPE_CHUNK_LIMIT - 1) + '😀' + 'äöü'
  await client.typeText({ text, os: 'win_de' })
  assert.equal(adapter.calls.length, 2)
  const first = (adapter.calls[0].body as { text: string }).text
  const second = (adapter.calls[1].body as { text: string }).text
  assert.ok(first.endsWith('😀'), 'Emoji muss vollständig im ersten Chunk bleiben')
  assert.equal(second, 'äöü')
  assert.equal(first + second, text, 'kein Zeichenverlust an der Grenze')
})

test('typeText() Fehler im 2. Chunk: wirft mit bereits getippter Menge, ohne Payload', async () => {
  let n = 0
  const adapter = createFakeHttpAdapter((c) => {
    n++
    if (n === 2) return { status: 500, data: { error: 'typing_failed' } }
    return { status: 200, data: { typed: Array.from((c.body as { text: string }).text).length } }
  })
  const client = createPicoClient(adapter, BASE)
  await assert.rejects(
    () => client.typeText({ text: 'g'.repeat(TYPE_CHUNK_LIMIT + 5), os: 'win_de' }),
    (e: Error) => /HTTP 500/.test(e.message) && new RegExp(`${TYPE_CHUNK_LIMIT} Zeichen bereits getippt`).test(e.message) && !/ggg/.test(e.message),
  )
  assert.equal(adapter.calls.length, 2, 'nach dem Fehler keine weiteren Requests')
})

test('Base-URL als Getter wird live ausgewertet; trailing slash normalisiert', async () => {
  let url = 'http://host-a/'
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: 'ok' }))
  const client = createPicoClient(adapter, () => url)
  await client.health()
  url = 'http://host-b'
  await client.health()
  assert.equal(adapter.calls[0].url, 'http://host-a/health')
  assert.equal(adapter.calls[1].url, 'http://host-b/health')
})

test('isValidSsidId spiegelt die Server-Regel ^[A-Za-z0-9_-]{1,23}$', () => {
  for (const ok of ['RTW-1', 'F80EA8', 'a', 'A_b-9', 'x'.repeat(23)]) assert.equal(isValidSsidId(ok), true, ok)
  for (const bad of ['', 'x'.repeat(24), 'RTW 1', 'üäö', 'a.b', 'a/b']) assert.equal(isValidSsidId(bad), false, bad)
})

test('setConfig() sendet { ssidId } an /config und parst { ok, restartRequired }', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, restartRequired: true } }))
  const client = createPicoClient(adapter, BASE)
  const r = await client.setConfig({ ssidId: 'RTW-1' })
  assert.deepEqual(r, { ok: true, restartRequired: true })
  const call = adapter.calls[0]
  assert.equal(call.method, 'POST')
  assert.equal(call.url, `${BASE}/config`)
  assert.deepEqual(call.body, { ssidId: 'RTW-1' })
})

test('setConfig() parst auch JSON-String-Antwort', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: JSON.stringify({ ok: true, restartRequired: true }) }))
  const client = createPicoClient(adapter, BASE)
  assert.deepEqual(await client.setConfig({ ssidId: 'RTW-1' }), { ok: true, restartRequired: true })
})

test('setConfig() mit ungültiger ID wirft OHNE Request', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, restartRequired: true } }))
  const client = createPicoClient(adapter, BASE)
  await assert.rejects(() => client.setConfig({ ssidId: 'kein leerzeichen!' }), /Ungültige Geräte-ID/)
  assert.equal(adapter.calls.length, 0, 'ungültige ID darf keinen Request erzeugen')
})

test('setConfig() Fehler bei Nicht-2xx (ohne Payload in der Meldung)', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 400, data: { error: 'invalid_id' } })), BASE)
  await assert.rejects(() => client.setConfig({ ssidId: 'RTW-1' }), /HTTP 400/)
})

// --- OTA (#130): Low-Level-Endpunkte (Orchestrierung: firmwareUpdate.test.ts) ---

const otaManifest = { version: '0.3.0', size: 430152, sha256: 'ab'.repeat(32), sigB64: Buffer.alloc(64).toString('base64') }

test('otaBegin() sendet { size, sha256, sig } und uebernimmt chunkMax', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, chunkMax: 4096 } }))
  const client = createPicoClient(adapter, BASE)
  const r = await client.otaBegin(otaManifest)
  assert.deepEqual(r, { ok: true, chunkMax: 4096 })
  const call = adapter.calls[0]
  assert.equal(call.url, `${BASE}/ota/begin`)
  assert.deepEqual(call.body, { size: otaManifest.size, sha256: otaManifest.sha256, sig: otaManifest.sigB64 })
})

test('otaBegin() nutzt Fallback-chunkMax bei fehlendem/kaputtem Feld', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: { ok: true } })), BASE)
  assert.equal((await client.otaBegin(otaManifest)).chunkMax, OTA_CHUNK_FALLBACK)
})

test('otaBegin() Fehler ohne Payload in der Meldung', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 507, data: { error: 'insufficient_storage' } })), BASE)
  await assert.rejects(() => client.otaBegin(otaManifest), (e: Error) => /HTTP 507/.test(e.message) && !/sha256|sig/.test(e.message))
})

test('otaChunk() sendet { offset, dataB64 } und parst received', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { received: 8192 } }))
  const client = createPicoClient(adapter, BASE)
  const r = await client.otaChunk({ offset: 0, dataB64: 'QUJD' })
  assert.equal(r.received, 8192)
  assert.equal(adapter.calls[0].url, `${BASE}/ota/chunk`)
  assert.deepEqual(adapter.calls[0].body, { offset: 0, dataB64: 'QUJD' })
})

test('otaCommit() parst rebooting; Fehler bei Nicht-2xx', async () => {
  const ok = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, rebooting: true } })), BASE)
  assert.deepEqual(await ok.otaCommit(), { rebooting: true })
  const bad = createPicoClient(createFakeHttpAdapter(() => ({ status: 422, data: { error: 'signature_invalid' } })), BASE)
  await assert.rejects(() => bad.otaCommit(), /HTTP 422/)
})

test('status() uebernimmt otaSupported nur als Boolean (alte Firmware: undefined)', async () => {
  const withOta = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: { ...validStatus, otaSupported: true } })), BASE)
  assert.equal((await withOta.status()).otaSupported, true)
  const legacy = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: validStatus })), BASE)
  assert.equal((await legacy.status()).otaSupported, undefined)
})

test('Pico-Schicht loggt nicht und nutzt keinen Browser-Storage (Quelltext)', () => {
  for (const f of ['picoClient.ts', 'httpAdapter.ts', 'usePicoDevice.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), `${f}`)
  }
})

test('usePicoDevice persistiert den Testtext NICHT (Quelltext)', () => {
  const src = readFileSync(new URL('./usePicoDevice.ts', import.meta.url), 'utf8')
  // testText wird nie an saveSettings/Repository übergeben (nur als POST-Body via client)
  assert.ok(!/saveSettings\([^)]*testText/.test(src))
  assert.ok(/testText: ref\('/.test(src) || /testText = ref\('/.test(src), 'testText ist nur ein RAM-ref')
})
