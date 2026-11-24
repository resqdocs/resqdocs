// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPicoClient, isValidSsidId, parseTyping, parseStoredInfo, ButtonRequiredError, TextNotAllowedError, TYPE_CHUNK_LIMIT, OTA_CHUNK_FALLBACK, TYPE_BUSY_RETRY_MS, TYPE_BUSY_MAX_RETRIES } from './picoClient.ts'
import type { HttpAdapter, HttpResponse } from './picoTypes.ts'

interface Call { method: string; url: string; body?: unknown; opts?: { connectTimeout?: number; readTimeout?: number } }

/** Fake-HTTP-Adapter: zeichnet Aufrufe auf, antwortet über einen Handler. Keine Netzwerkaufrufe. */
function createFakeHttpAdapter(handler: (c: Call) => HttpResponse): HttpAdapter & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    async get(url, opts) {
      const c = { method: 'GET', url, opts }
      calls.push(c)
      return handler(c)
    },
    async post(url, body, opts) {
      const c = { method: 'POST', url, body, opts }
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

test('typeText() sendet mit vollem Timeout-Budget (nicht auf connectTimeout gekuerzt)', async () => {
  // CapacitorHttp-iOS nimmt connectTimeout ?? readTimeout als EINZIGES timeoutInterval -> ein kleiner
  // connectTimeout wuerde readTimeout aushebeln (real 5 s statt 20 s). Der Sendeweg muss beide gleich
  // und grosszuegig setzen, sonst reisst bei niedrigem Akku (traeger Funk) das Fenster.
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { typed: 3 } }))
  await createPicoClient(adapter, BASE).typeText({ text: 'abc', os: 'win_de' })
  const o = adapter.calls[0].opts
  assert.ok(o && o.connectTimeout && o.readTimeout, 'Timeouts gesetzt')
  assert.equal(o!.connectTimeout, o!.readTimeout, 'connectTimeout darf readTimeout nicht unterbieten')
  assert.ok(o!.connectTimeout! >= 20000, 'volles Sendebudget (>= 20 s)')
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

// --- Chunking: Firmware-Grenze 16384 Zeichen pro /type-Request ---

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

test('typeText() zerreißt an der Chunk-Grenze keine Surrogate-Paare (Zeichen außerhalb der Grundebene/Umlaute)', async () => {
  const adapter = createCountingAdapter()
  const client = createPicoClient(adapter, BASE)
  // 16383 ASCII + ein Zeichen aus zwei Code-Einheiten (Surrogate-Paar) direkt an der Grenze + Umlaut-Rest.
  // Kein Emoji: Die entfernt typeText() vorher (siehe unten), sie kämen an der Grenze gar nicht an.
  const text = 'a'.repeat(TYPE_CHUNK_LIMIT - 1) + '𝒳' + 'äöü'
  await client.typeText({ text, os: 'win_de' })
  assert.equal(adapter.calls.length, 2)
  const first = (adapter.calls[0].body as { text: string }).text
  const second = (adapter.calls[1].body as { text: string }).text
  assert.ok(first.endsWith('𝒳'), 'das Zeichen muss vollständig im ersten Chunk bleiben')
  assert.equal(second, 'äöü')
  assert.equal(first + second, text, 'kein Zeichenverlust an der Grenze')
})

test('typeText() schickt den Text in der getippten Form: gleichwertige Zeichen ersetzt, Emojis entfernt', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { typed: 1 } }))
  await createPicoClient(adapter, BASE).typeText({ text: '„Test“ – 1…2 😀 ç ©\r\nZeile', os: 'win_de' })
  assert.deepEqual(adapter.calls[0].body, { text: '"Test" - 1...2 ç \nZeile', os: 'win_de' })
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
  await assert.rejects(() => client.setConfig({ ssidId: 'kein leerzeichen!' }), /Ungültige Bridge-ID/)
  assert.equal(adapter.calls.length, 0, 'ungültige ID darf keinen Request erzeugen')
})

test('setConfig() Fehler bei Nicht-2xx (ohne Payload in der Meldung)', async () => {
  const client = createPicoClient(createFakeHttpAdapter(() => ({ status: 400, data: { error: 'invalid_id' } })), BASE)
  await assert.rejects(() => client.setConfig({ ssidId: 'RTW-1' }), /HTTP 400/)
})

// --- OTA: Low-Level-Endpunkte (Orchestrierung: firmwareUpdate.test.ts) ---

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

// --- Tipp-Fortschritt und Steuerung (Firmware ab 0.4.0) ---------------------------------------

const typing = { state: 'typing', done: 12, total: 340, delayMs: 10, jobId: 3, lastEnd: 'none' }

test('status() uebernimmt den Tipp-Fortschritt, wenn die Firmware ihn meldet', async () => {
  const mit = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: { ...validStatus, typing } })), BASE)
  assert.deepEqual((await mit.status()).typing, typing)
  const ohne = createPicoClient(createFakeHttpAdapter(() => ({ status: 200, data: validStatus })), BASE)
  assert.equal((await ohne.status()).typing, undefined, 'aeltere Firmware: kein Feld, kein Fehler')
})

test('typeStatus(): GET /type/status, kurzer Timeout, liefert den Fortschritt', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: typing }))
  assert.deepEqual(await createPicoClient(adapter, BASE).typeStatus(), typing)
  assert.equal(adapter.calls[0].method, 'GET')
  assert.equal(adapter.calls[0].url, `${BASE}/type/status`)
  assert.ok((adapter.calls[0].opts?.connectTimeout ?? 0) <= 3000, 'verlassenes WLAN wird schnell erkannt')
})

test('typeStatus(): aeltere Firmware (404) → null statt Fehler; andere Fehler werfen', async () => {
  const alt = createPicoClient(createFakeHttpAdapter(() => ({ status: 404, data: { error: 'not_found' } })), BASE)
  assert.equal(await alt.typeStatus(), null)
  const kaputt = createPicoClient(createFakeHttpAdapter(() => ({ status: 500, data: null })), BASE)
  await assert.rejects(() => kaputt.typeStatus(), /HTTP 500/)
})

test('typeControl(): POST /type/pause|resume|cancel mit leerem Body, liefert den neuen Zustand', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ...typing, state: 'paused' } }))
  const client = createPicoClient(adapter, BASE)
  for (const action of ['pause', 'resume', 'cancel'] as const) {
    const r = await client.typeControl(action)
    assert.equal(r?.state, 'paused')
  }
  assert.deepEqual(adapter.calls.map((c) => `${c.method} ${c.url}`), [`POST ${BASE}/type/pause`, `POST ${BASE}/type/resume`, `POST ${BASE}/type/cancel`])
  assert.deepEqual(adapter.calls[0].body, {}, 'kein Inhalt in der Steuerung')
})

test('typeControl(): kein Auftrag (409) oder aeltere Firmware (404) → null', async () => {
  for (const status of [409, 404]) {
    const client = createPicoClient(createFakeHttpAdapter(() => ({ status, data: { error: 'no_job' } })), BASE)
    assert.equal(await client.typeControl('cancel'), null)
  }
})

test('parseTyping(): nur vollstaendige, plausible Angaben; alles andere → null', () => {
  assert.deepEqual(parseTyping(typing), typing)
  assert.deepEqual(parseTyping(JSON.stringify(typing)), typing)
  assert.equal(parseTyping({ ...typing, done: 999 })?.done, 340, 'done nie groesser als total')
  for (const kaputt of [null, 'kein json', 42, { ...typing, state: 'los' }, { ...typing, done: -1 }, { ...typing, total: '340' }, { ...typing, lastEnd: 'x' }, { state: 'idle' }]) {
    assert.equal(parseTyping(kaputt), null)
  }
})

test('typeText(): bei 503 busy wartet die App und schickt DENSELBEN Teil erneut', async () => {
  const warten: number[] = []
  let n = 0
  const adapter = createFakeHttpAdapter(() => (++n <= 2 ? { status: 503, data: { error: 'busy' } } : { status: 200, data: { typed: 3 } }))
  const client = createPicoClient(adapter, BASE, { sleep: async (ms) => { warten.push(ms) } })
  assert.deepEqual(await client.typeText({ text: 'abc', os: 'win_de' }), { typed: 3 })
  assert.equal(adapter.calls.length, 3)
  assert.deepEqual(warten, [TYPE_BUSY_RETRY_MS, TYPE_BUSY_RETRY_MS])
  assert.deepEqual(adapter.calls.map((c) => (c.body as { text: string }).text), ['abc', 'abc', 'abc'])
})

test('typeText(): bleibt die Bridge dauerhaft busy, endet es mit einem Fehler statt endlos', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 503, data: { error: 'busy' } }))
  const client = createPicoClient(adapter, BASE, { sleep: async () => {} })
  await assert.rejects(() => client.typeText({ text: 'abc', os: 'win_de' }), /HTTP 503/)
  assert.equal(adapter.calls.length, TYPE_BUSY_MAX_RETRIES + 1)
})

// --- Text fuer den Knopf an der Bridge (Firmware ab 0.5.0) -----------------------------------

const stored = { present: true, name: '', chars: 420, os: 'win_de', delayMs: 45, savedAt: 1794000000, buttonHeld: false, blocked: false }

test('storedInfo(): Angaben ohne Inhalt; aeltere Firmware (404) → null', async () => {
  const neu = createFakeHttpAdapter(() => ({ status: 200, data: stored }))
  assert.deepEqual(await createPicoClient(neu, BASE).storedInfo(), stored)
  assert.equal(neu.calls[0].url, `${BASE}/stored`)
  const alt = createPicoClient(createFakeHttpAdapter(() => ({ status: 404, data: { error: 'not_found' } })), BASE)
  assert.equal(await alt.storedInfo(), null)
})

test('storedText(): holt den Text als Rohtext; ohne gedrueckten Knopf ButtonRequiredError', async () => {
  const ok = createFakeHttpAdapter(() => ({ status: 200, data: 'Zeile 1\nZeile 2 „äöü“' }))
  assert.equal(await createPicoClient(ok, BASE).storedText(), 'Zeile 1\nZeile 2 „äöü“')
  assert.equal(ok.calls[0].url, `${BASE}/stored/text`)
  assert.equal((ok.calls[0].opts as { responseType?: string }).responseType, 'text')
  const zu = createPicoClient(createFakeHttpAdapter(() => ({ status: 403, data: { error: 'button_required' } })), BASE)
  await assert.rejects(() => zu.storedText(), ButtonRequiredError)
  const leer = createPicoClient(createFakeHttpAdapter(() => ({ status: 404, data: { error: 'not_found' } })), BASE)
  assert.equal(await leer.storedText(), '')
})

test('storeText(): Text nur im Body, mit Tastatur und Tippgeschwindigkeit; 403 → ButtonRequiredError', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, chars: 5 } }))
  const r = await createPicoClient(adapter, BASE).storeText({ text: 'Hallo', os: 'ios', delayMs: 45, savedAt: 1794000000 })
  assert.deepEqual(r, { chars: 5 })
  assert.equal(adapter.calls[0].url, `${BASE}/stored`)
  assert.ok(!adapter.calls[0].url.includes('Hallo'), 'Text nie in der URL')
  assert.deepEqual(adapter.calls[0].body, { text: 'Hallo', os: 'ios', delayMs: 45, savedAt: 1794000000 })
  const zu = createPicoClient(createFakeHttpAdapter(() => ({ status: 403, data: { error: 'button_required' } })), BASE)
  await assert.rejects(() => zu.storeText({ text: 'x', os: 'ios', delayMs: 45, savedAt: 1 }), ButtonRequiredError)
  // 422: die Bridge lehnt den Inhalt ab; die Meldung nennt die Art, nie den Text.
  for (const reason of ['control', 'command'] as const) {
    const nein = createPicoClient(createFakeHttpAdapter(() => ({ status: 422, data: { error: 'not_allowed', reason } })), BASE)
    await assert.rejects(
      () => nein.storeText({ text: 'geheim', os: 'ios', delayMs: 45, savedAt: 1 }),
      (e: unknown) => e instanceof TextNotAllowedError && e.reason === reason && !e.message.includes('geheim'),
    )
  }
})

test('storeText(): der Text geht in der getippten Form auf die Bridge, die Länge zählt danach', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true, chars: 9 } }))
  const client = createPicoClient(adapter, BASE)
  await client.storeText({ text: '„RTW“ – ok… 👍', os: 'ios', delayMs: 45, savedAt: 1 })
  assert.equal((adapter.calls[0].body as { text: string }).text, '"RTW" - ok... ')
  // Aus einem Auslassungszeichen werden drei Punkte: Die Grenze gilt für den Text, der ankommt.
  await assert.rejects(() => client.storeText({ text: '…'.repeat(TYPE_CHUNK_LIMIT / 2), os: 'ios', delayMs: 45, savedAt: 1 }), /zu lang/)
  assert.equal(adapter.calls.length, 1)
})

test('storeText(): zu langer Text wird ohne Request abgelehnt; Fehler nennen den Text nicht', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true } }))
  const client = createPicoClient(adapter, BASE)
  await assert.rejects(() => client.storeText({ text: 'a'.repeat(TYPE_CHUNK_LIMIT + 1), os: 'ios', delayMs: 45, savedAt: 1 }), /zu lang/)
  assert.equal(adapter.calls.length, 0)
  const kaputt = createPicoClient(createFakeHttpAdapter(() => ({ status: 507, data: null })), BASE)
  await assert.rejects(
    () => kaputt.storeText({ text: 'Geheimer Patientenname', os: 'ios', delayMs: 45, savedAt: 1 }),
    (e: Error) => /HTTP 507/.test(e.message) && !e.message.includes('Geheimer'),
  )
})

test('clearStored(): leerer Body; 403 → ButtonRequiredError', async () => {
  const adapter = createFakeHttpAdapter(() => ({ status: 200, data: { ok: true } }))
  await createPicoClient(adapter, BASE).clearStored()
  assert.equal(adapter.calls[0].url, `${BASE}/stored/clear`)
  assert.deepEqual(adapter.calls[0].body, {})
  const zu = createPicoClient(createFakeHttpAdapter(() => ({ status: 403, data: { error: 'button_required' } })), BASE)
  await assert.rejects(() => zu.clearStored(), ButtonRequiredError)
})

test('parseStoredInfo(): Unerwartetes → null, fehlende Zahlen → 0', () => {
  assert.deepEqual(parseStoredInfo(JSON.stringify(stored)), stored)
  assert.equal(parseStoredInfo({ name: 'x' }), null)
  assert.equal(parseStoredInfo('kein json'), null)
  assert.deepEqual(parseStoredInfo({ present: false }), { present: false, name: '', chars: 0, os: 'win_de', delayMs: 0, savedAt: 0, buttonHeld: false, blocked: false })
})
