// HTTP-Ende-zu-Ende: echter Server auf Ephemeral-Port. Der „Client" verschluesselt mit dem echten
// Krypto-Wrapper der App/des Editors -> beweist, dass der Server nur opake Bytes transportiert und der
// Round-Trip Sender->Server->Empfaenger den Klartext exakt zurueckliefert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createStore } from './store.ts'
import { createTransferServer, clientKey } from './server.ts'
import { createRateLimiter } from './rateLimiter.ts'
import { RECEIVER_CORE } from './receiverPage.ts'
import { encryptTransfer, decryptTransfer } from '../../../packages/shared/transferCrypto.ts'

async function withServer(fn: (base: string) => Promise<void>) {
  const store = createStore(new DatabaseSync(':memory:'))
  const server = createTransferServer({ store })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

async function postBlob(base: string, blob: Uint8Array, expire = 3600, burn = false) {
  const res = await fetch(`${base}/v1/blob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Expire': String(expire), ...(burn ? { 'X-Burn': '1' } : {}) },
    body: blob,
  })
  return res
}

test('healthz', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/healthz`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
  })
})

test('E2E: verschluesseln -> POST -> GET -> entschluesseln == Klartext', async () => {
  await withServer(async (base) => {
    const plain = JSON.stringify({ schema: 'resqdocs-block', version: 1, tree: { title: 'Anamnese µ €' } })
    const { blob, keyB64url } = await encryptTransfer(plain)

    const post = await postBlob(base, blob)
    assert.equal(post.status, 201)
    const { id, code } = (await post.json()) as { id: string; code: string }
    assert.equal(id, code)

    const get = await fetch(`${base}/v1/blob/${id}`)
    assert.equal(get.status, 200)
    assert.equal(get.headers.get('cache-control'), 'no-store') // kein Proxy-Cache haelt das Chiffrat vor
    const received = new Uint8Array(await get.arrayBuffer())
    assert.equal(await decryptTransfer(received, keyB64url), plain)
  })
})

test('CORS-Header + OPTIONS-Preflight', async () => {
  await withServer(async (base) => {
    const pre = await fetch(`${base}/v1/blob`, { method: 'OPTIONS' })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers.get('access-control-allow-origin'), '*')
    assert.ok(pre.headers.get('access-control-allow-headers')?.includes('X-Expire'))
  })
})

test('Burn: zweiter GET liefert 404', async () => {
  await withServer(async (base) => {
    const { blob } = await encryptTransfer('einmal')
    const { id } = (await (await postBlob(base, blob, 3600, true)).json()) as { id: string }
    assert.equal((await fetch(`${base}/v1/blob/${id}`)).status, 200)
    assert.equal((await fetch(`${base}/v1/blob/${id}`)).status, 404)
  })
})

test('Blob > 512 KB -> 413', async () => {
  await withServer(async (base) => {
    // gueltiger Umschlag (RQD1) + Ueberlaenge, damit wirklich die Groesse (nicht die Kennung) 413 ausloest
    const big = new Uint8Array(512 * 1024 + 1)
    big.set([0x52, 0x51, 0x44, 0x31], 0)
    assert.equal((await postBlob(base, big)).status, 413)
  })
})

test('Nicht-ResQDocs-Blob (ohne RQD1) -> 415', async () => {
  await withServer(async (base) => {
    const junk = new TextEncoder().encode('irgendeine fremde Datei ohne Kennung')
    assert.equal((await postBlob(base, junk)).status, 415)
  })
})

test('DELETE nur mit korrektem Token', async () => {
  await withServer(async (base) => {
    const { blob } = await encryptTransfer('x')
    const { id, deleteToken } = (await (await postBlob(base, blob)).json()) as { id: string; deleteToken: string }
    assert.equal((await fetch(`${base}/v1/blob/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': 'falsch' } })).status, 404)
    assert.equal((await fetch(`${base}/v1/blob/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': deleteToken } })).status, 204)
    assert.equal((await fetch(`${base}/v1/blob/${id}`)).status, 404)
  })
})

test('unbekannte id -> 404, unbekannter Pfad -> 404', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/v1/blob/doesnotexist`)).status, 404)
    assert.equal((await fetch(`${base}/v1/nonsense`)).status, 404)
  })
})

test('gefaelschte X-Forwarded-For umgehen den Rate-Limiter NICHT (Key = Verbindungs-Peer)', async () => {
  const store = createStore(new DatabaseSync(':memory:'))
  const server = createTransferServer({ store, postLimiter: createRateLimiter(2, 60_000) })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  try {
    const { blob } = await encryptTransfer('x')
    const post = (xff: string) =>
      fetch(`${base}/v1/blob`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Expire': '3600', 'X-Forwarded-For': xff },
        body: blob,
      })
    // Jeder Request mit ANDERER gefaelschter XFF — frueher haette das den Limiter umgangen.
    assert.equal((await post('1.1.1.1')).status, 201)
    assert.equal((await post('2.2.2.2')).status, 201)
    assert.equal((await post('3.3.3.3')).status, 429, 'trotz neuer XFF: gleicher Peer, Limit greift')
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('POST: Speicher voll (Cap) -> 507', async () => {
  const store = createStore(new DatabaseSync(':memory:'), undefined, 1) // Cap = 1
  const server = createTransferServer({ store })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  try {
    const blob = Uint8Array.from([0x52, 0x51, 0x44, 0x31, 1, 2, 3]) // RQD1 + Payload
    assert.equal((await postBlob(base, blob)).status, 201)
    assert.equal((await postBlob(base, blob)).status, 507) // Cap voll, nichts abgelaufen
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('clientKey: nur der vertrauenswürdige Proxy darf X-Forwarded-For/X-Real-IP setzen (spoofsicher, Per-IP)', () => {
  const mk = (peer: string, h: Record<string, string> = {}) =>
    ({ socket: { remoteAddress: peer }, headers: h }) as unknown as Parameters<typeof clientKey>[0]
  // Peer == trustedProxy -> echte Client-IP = LETZTER XFF-Hop
  assert.equal(clientKey(mk('10.0.0.9', { 'x-forwarded-for': '1.2.3.4' }), '10.0.0.9'), 'xff:1.2.3.4')
  assert.equal(clientKey(mk('10.0.0.9', { 'x-forwarded-for': '9.9.9.9, 1.2.3.4' }), '10.0.0.9'), 'xff:1.2.3.4')
  // X-Real-IP hat VORRANG vor XFF (robuster, vom Proxy gesetzt) — nur vom trusted Peer
  assert.equal(clientKey(mk('10.0.0.9', { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '1.2.3.4' }), '10.0.0.9'), 'ip:7.7.7.7')
  // Untrusted Peer -> weder XFF noch X-Real-IP geglaubt (Spoofing-Schutz) -> Socket
  assert.equal(clientKey(mk('5.5.5.5', { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '1.2.3.4' }), '10.0.0.9'), 'ip:5.5.5.5')
  // kein trustedProxy -> immer Socket
  assert.equal(clientKey(mk('5.5.5.5', { 'x-forwarded-for': '1.2.3.4' }), null), 'ip:5.5.5.5')
  // trusted Peer aber keine Proxy-Header -> Socket
  assert.equal(clientKey(mk('10.0.0.9'), '10.0.0.9'), 'ip:10.0.0.9')
})

test('DELETE: eigener Rate-Limiter -> 429 nach Limit', async () => {
  const store = createStore(new DatabaseSync(':memory:'))
  const server = createTransferServer({ store, deleteLimiter: createRateLimiter(1, 60_000) })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  try {
    assert.equal((await fetch(`${base}/v1/blob/none`, { method: 'DELETE', headers: { 'X-Delete-Token': 'x' } })).status, 404)
    assert.equal((await fetch(`${base}/v1/blob/none`, { method: 'DELETE', headers: { 'X-Delete-Token': 'x' } })).status, 429)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})

test('Empfänger-Seite: GET / liefert die Seite (kein 404 für Browser-Öffner), HEAD ohne Body, strenge Header', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/`)
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type') || '', /text\/html/)
    assert.match(r.headers.get('content-security-policy') || '', /connect-src 'self'/)
    assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/) // Clickjacking-Schutz (nur als Header wirksam)
    assert.equal(r.headers.get('x-frame-options'), 'DENY')
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
    const html = await r.text()
    assert.match(html, /Vorlage empfangen/)
    assert.match(html, /\/v1\/blob\//) // Abruf nur auf den id-Pfad, nie mit Schlüssel
    const head = await fetch(`${base}/`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal((await head.text()).length, 0)
  })
})

test('Empfänger-Seite: der AUSGELIEFERTE Entschlüssel-Kern (RECEIVER_CORE) entschlüsselt echtes encryptTransfer', async () => {
  // eval den EXAKT ausgelieferten Kern (kein Nachbau). crypto.subtle/atob/TextDecoder existieren in Node 24.
  const core = (eval(RECEIVER_CORE) as () => {
    parseFragment(h: string): { id: string; key: string } | null
    decrypt(b: Uint8Array, k: string): Promise<string>
  })()
  const plain = JSON.stringify({ schema: 'resqdocs-snippet', version: 1, snippet: { title: 'Übergabe µ €', text: 'x' } })
  const { blob, keyB64url } = await encryptTransfer(plain)
  // Fragment-Parsing wie im Browser (id.key)
  const frag = core.parseFragment('#ABC123.' + keyB64url)
  assert.equal(frag?.id, 'ABC123')
  assert.equal(frag?.key, keyB64url)
  // Kernbeweis: die Seite entschlüsselt den echten Blob exakt zum Klartext
  assert.equal(await core.decrypt(blob, keyB64url), plain)
  // falscher Schlüssel -> GCM-Tag scheitert
  const wrongKey = (await encryptTransfer('y')).keyB64url
  await assert.rejects(() => core.decrypt(blob, wrongKey))
  // fremdes Blob ohne RQD1 -> abgelehnt
  await assert.rejects(() => core.decrypt(new Uint8Array(17), keyB64url))
  // ungültiges Fragment -> null; nicht-alphanum id -> null (kein Pfad-Unfug)
  assert.equal(core.parseFragment('#nurdas'), null)
  assert.equal(core.parseFragment('#bad/id.KEY'), null)
})

test('Smoke: der Dienst startet als eigener Prozess mit DEFAULT-Config und antwortet auf /healthz', async () => {
  // Faengt genau die Klasse Fehler, die die Unit-Tests NICHT sehen: der isMain-Startblock (Env-Verdrahtung,
  // fehlende Imports) laeuft nur beim direkten Ausfuehren. TRANSFER_MAX_TOTAL_BYTES bewusst NICHT gesetzt ->
  // testet den Default-Fallback-Pfad (der zuvor mit ReferenceError crashte).
  const serverPath = fileURLToPath(new URL('./server.ts', import.meta.url))
  const port = 8137
  const child = spawn(process.execPath, ['--experimental-strip-types', '--experimental-sqlite', serverPath], {
    env: { ...process.env, PORT: String(port), TRANSFER_DB: ':memory:', RATE_LIMIT: 'off', TRANSFER_MAX_TOTAL_BYTES: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => { out += String(d) })
  child.stderr.on('data', (d) => { out += String(d) })
  try {
    const started = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 5000)
      const iv = setInterval(() => { if (/transfer service on/.test(out)) { clearTimeout(t); clearInterval(iv); resolve(true) } }, 100)
      child.on('exit', () => { clearTimeout(t); clearInterval(iv); resolve(false) })
    })
    assert.ok(started, `Dienst nicht gestartet (isMain-Crash?). Ausgabe:\n${out}`)
    const res = await fetch(`http://127.0.0.1:${port}/healthz`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
  } finally {
    child.kill('SIGKILL')
  }
})
