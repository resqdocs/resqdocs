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
import { createTransferServer, clientKey, limitKeyOf } from './server.ts'
import { createRateLimiter } from './rateLimiter.ts'
import { RECEIVER_CORE } from './receiverPage.ts'
import { encryptTransfer, decryptTransfer } from '../../../packages/shared/transferCrypto.ts'

// Beispiel-Fingerabdruck (32 Byte, kein echtes Zertifikat).
const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':')

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
  assert.equal(clientKey(mk('192.0.2.9', { 'x-forwarded-for': '203.0.113.4' }), '192.0.2.9'), 'xff:203.0.113.4')
  assert.equal(clientKey(mk('192.0.2.9', { 'x-forwarded-for': '203.0.113.9, 203.0.113.4' }), '192.0.2.9'), 'xff:203.0.113.4')
  // X-Real-IP hat VORRANG vor XFF (robuster, vom Proxy gesetzt) — nur vom trusted Peer
  assert.equal(clientKey(mk('192.0.2.9', { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.4' }), '192.0.2.9'), 'ip:198.51.100.7')
  // Untrusted Peer -> weder XFF noch X-Real-IP geglaubt (Spoofing-Schutz) -> Socket
  assert.equal(clientKey(mk('198.51.100.5', { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.4' }), '192.0.2.9'), 'ip:198.51.100.5')
  // kein trustedProxy -> immer Socket
  assert.equal(clientKey(mk('198.51.100.5', { 'x-forwarded-for': '203.0.113.4' }), null), 'ip:198.51.100.5')
  // trusted Peer aber keine Proxy-Header -> Socket
  assert.equal(clientKey(mk('192.0.2.9'), '192.0.2.9'), 'ip:192.0.2.9')
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
    assert.match(html, /resqdocs:\/\/receive/) // Übergabe an die App über das eigene Schema
    const head = await fetch(`${base}/`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal((await head.text()).length, 0)
  })
})

test('Link-Vorschau: Empfangsseite trägt allgemeine Open-Graph-Angaben, Bild liegt beim Dienst', async () => {
  await withServer(async (base) => {
    const html = await (await fetch(`${base}/`)).text()
    assert.match(html, /<meta property="og:title" content="Vorlage für ResQDocs empfangen" \/>/)
    assert.match(html, /<meta property="og:description" content="[^"]+" \/>/)
    assert.match(html, /<meta property="og:image" content="https:\/\/transfer\.resqdocs\.app\/og-transfer\.png" \/>/)
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/)
    const img = await fetch(`${base}/og-transfer.png`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    const bytes = new Uint8Array(await img.arrayBuffer())
    assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47]) // PNG
    assert.equal(new DataView(bytes.buffer).getUint32(16), 1200)
    assert.equal(new DataView(bytes.buffer).getUint32(20), 630)
  })
})

test('Angaben zum Link: „1× lesen“ und Restlaufzeit, ohne den Inhalt zu verbrauchen', async () => {
  await withServer(async (base) => {
    const { blob } = await encryptTransfer('{"a":1}')
    const { id } = (await (await postBlob(base, blob, 3600, true)).json()) as { id: string }
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${base}/v1/blob/${id}/info`)
      assert.equal(r.status, 200)
      const info = (await r.json()) as { burn: boolean; expiresIn: number }
      assert.equal(info.burn, true)
      assert.ok(info.expiresIn > 3500 && info.expiresIn <= 3600)
    }
    assert.equal((await fetch(`${base}/v1/blob/${id}`)).status, 200, 'Inhalt nach den Abfragen noch da')
    assert.equal((await fetch(`${base}/v1/blob/${id}/info`)).status, 404, 'verbraucht -> keine Angaben mehr')
    assert.equal((await fetch(`${base}/v1/blob/Unbekannt123/info`)).status, 404)
  })
})

test('Empfangsseite ruft beim Laden nur die Angaben ab, nie den Inhalt (Vorschau-Dienste verbrauchen nichts)', async () => {
  await withServer(async (base) => {
    const html = await (await fetch(`${base}/`)).text()
    const start = html.slice(html.indexOf('// Beim Laden NICHT automatisch abrufen'))
    assert.match(start, /loadInfo\(start\.id\)/)
    assert.doesNotMatch(start, /run\(\)/)
  })
})

test('App-Zuordnung: ohne Konfiguration 404, mit Konfiguration JSON ohne Umleitung', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/.well-known/apple-app-site-association`)).status, 404)
    assert.equal((await fetch(`${base}/.well-known/assetlinks.json`)).status, 404)
  })
  const store = createStore(new DatabaseSync(':memory:'))
  const appLinks = { iosAppIds: ['ABCDE12345.com.example.app'], android: [{ packageName: 'com.example.app', fingerprints: [FP] }] }
  const server = createTransferServer({ store, appLinks })
  await new Promise<void>((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const aasa = await fetch(`${base}/.well-known/apple-app-site-association`, { redirect: 'manual' })
    assert.equal(aasa.status, 200)
    assert.match(aasa.headers.get('content-type') || '', /^application\/json/)
    assert.deepEqual(await aasa.json(), {
      applinks: { details: [{ appIDs: ['ABCDE12345.com.example.app'], components: [{ '/': '/', '#': '?*' }] }] },
    })
    const links = await fetch(`${base}/.well-known/assetlinks.json`, { redirect: 'manual' })
    assert.equal(links.status, 200)
    assert.match(links.headers.get('content-type') || '', /^application\/json/)
    assert.deepEqual(await links.json(), [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'com.example.app', sha256_cert_fingerprints: [FP] },
      },
    ])
    const head = await fetch(`${base}/.well-known/assetlinks.json`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal((await head.text()).length, 0)
    assert.equal((await fetch(`${base}/.well-known/anderes`)).status, 404)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
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

test('Empfangsseite: der Editor-Kanal aus dem Link wählt nur aus der festen Liste', () => {
  const core = (eval(RECEIVER_CORE) as () => { editorFor(search: string): { url: string; label: string } })()
  const prod = 'https://editor.resqdocs.app'
  assert.equal(core.editorFor('').url, prod)
  assert.equal(core.editorFor('?e=dev').url, 'https://editor.dev.resqdocs.app')
  assert.equal(core.editorFor('?x=1&e=dev&y=2').url, 'https://editor.dev.resqdocs.app')
  assert.match(core.editorFor('?e=dev').label, /Test-Editor/)
  // Unbekanntes, Adressen und Eigenschaften des Objekt-Prototyps fallen auf den normalen Editor zurück.
  for (const bad of ['?e=', '?e=xyz', '?e=https://evil.example', '?e=constructor', '?e=__proto__', '?e=toString', '?e=DEV', '?other=dev']) {
    assert.equal(core.editorFor(bad).url, prod, bad)
  }
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

test('„1× lesen“ über HTTP: X-Claim reserviert, consume verbraucht, release gibt frei, Header sind für Browser sichtbar', async () => {
  await withServer(async (base) => {
    const { blob } = await encryptTransfer('{"x":1}')
    const { id } = (await (await postBlob(base, blob, 3600, true)).json()) as { id: string }
    const a = await fetch(`${base}/v1/blob/${id}`, { headers: { 'X-Claim': '1' } })
    assert.equal(a.status, 200)
    const token = a.headers.get('x-claim-token')
    assert.ok(token)
    assert.equal(a.headers.get('x-prior-opens'), '0')
    assert.match(a.headers.get('access-control-expose-headers') ?? '', /X-Claim-Token/)
    await a.arrayBuffer()
    assert.equal((await fetch(`${base}/v1/blob/${id}`)).status, 409, 'reserviert: Empfangsseite bekommt 409')
    const opt = await fetch(`${base}/v1/blob/${id}`, { method: 'OPTIONS' })
    assert.match(opt.headers.get('access-control-allow-headers') ?? '', /X-Claim-Token/)
    assert.equal((await fetch(`${base}/v1/blob/${id}/release`, { method: 'POST', headers: { 'X-Claim-Token': 'falsch' } })).status, 404)
    assert.equal((await fetch(`${base}/v1/blob/${id}/release`, { method: 'POST', headers: { 'X-Claim-Token': token! } })).status, 204)
    const b = await fetch(`${base}/v1/blob/${id}`, { headers: { 'X-Claim': '1' } })
    assert.equal(b.headers.get('x-prior-opens'), '1')
    await b.arrayBuffer()
    assert.equal((await fetch(`${base}/v1/blob/${id}/consume`, { method: 'POST', headers: { 'X-Claim-Token': b.headers.get('x-claim-token')! } })).status, 204)
    assert.equal((await fetch(`${base}/v1/blob/${id}`, { headers: { 'X-Claim': '1' } })).status, 404)
  })
})

async function withShortServer(fn: (base: string, get: (path: string) => Promise<Response>) => Promise<void>, missLimit = 0) {
  const store = createStore(new DatabaseSync(':memory:'))
  const server = createTransferServer({ store, shortHost: 'resq.li', publicBase: 'https://transfer.resqdocs.app', shortMissLimiter: missLimit ? createRateLimiter(missLimit, 60_000) : null })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}`
  // fetch setzt den Host selbst; für die Kurzlink-Domain einen rohen Request mit Host resq.li schicken.
  const { request } = await import('node:http')
  const get = (path: string) =>
    new Promise<Response>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: { Host: 'resq.li' } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(new Response(res.statusCode === 302 ? null : Buffer.concat(chunks), { status: res.statusCode, headers: res.headers as Record<string, string> })))
      })
      req.on('error', reject)
      req.end()
    })
  try {
    await fn(base, get)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

test('Kurzlink: anlegen, über resq.li weiterleiten, per API auflösen; fremde Ziele abgelehnt', async () => {
  await withShortServer(async (base, getShort) => {
    const { blob, keyB64url } = await encryptTransfer('{"a":1}')
    const { id } = (await (await postBlob(base, blob)).json()) as { id: string }
    const link = `https://transfer.resqdocs.app/?e=dev#${id}.${keyB64url}`
    const made = await fetch(`${base}/v1/short`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) })
    assert.equal(made.status, 201)
    const { code, url } = (await made.json()) as { code: string; url: string }
    assert.equal(url, `https://resq.li/${code}`)

    const redirect = await getShort(`/${code}`)
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), link)
    assert.equal(redirect.headers.get('cache-control'), 'no-store')

    const api = await fetch(`${base}/v1/short/${code}`)
    assert.equal(api.status, 200)
    assert.deepEqual(await api.json(), { link })

    const foreign = await fetch(`${base}/v1/short`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: `https://evil.example/#${id}.${keyB64url}` }) })
    assert.equal(foreign.status, 400)
    const unknown = await fetch(`${base}/v1/short`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: `https://transfer.resqdocs.app/#Unbekannt123.${keyB64url}` }) })
    assert.equal(unknown.status, 404)
  })
})

test('Kurzlink-Domain: unbekannter Code -> Seite „Link abgelaufen“; /, /editor, /ai leiten weiter; Empfangsseite nur auf dem Transfer-Host', async () => {
  await withShortServer(async (base, getShort) => {
    const gone = await getShort('/ZZZZZ')
    assert.equal(gone.status, 404)
    const goneHtml = await gone.text()
    assert.match(goneHtml, /Link abgelaufen/)
    assert.match(goneHtml, /<meta property="og:image" content="https:\/\/transfer\.resqdocs\.app\/og-transfer\.png" \/>/)
    assert.match(gone.headers.get('content-security-policy') || '', /img-src data:/) // Signet als data:-Bild
    assert.equal((await getShort('/')).headers.get('location'), 'https://resqdocs.app/')
    assert.equal((await getShort('/editor')).headers.get('location'), 'https://editor.resqdocs.app/')
    assert.equal((await getShort('/ai')).headers.get('location'), 'https://ai.resqdocs.app/')
    assert.equal((await fetch(`${base}/`)).status, 200)
    assert.equal((await fetch(`${base}/v1/short/ZZZZZ`)).status, 404)
  })
})

test('Kurzlink-Domain: abschließender Schrägstrich wird angenommen', async () => {
  await withShortServer(async (base, getShort) => {
    const { blob, keyB64url } = await encryptTransfer('{"a":1}')
    const { id } = (await (await postBlob(base, blob)).json()) as { id: string }
    const link = `https://transfer.resqdocs.app/#${id}.${keyB64url}`
    const { code } = (await (await fetch(`${base}/v1/short`, { method: 'POST', body: JSON.stringify({ link }) })).json()) as { code: string }
    assert.equal((await getShort(`/${code}/`)).headers.get('location'), link)
  })
})

test('Kurzlinks: zu viele Fehlversuche sperren das Auflösen für diesen Anschluss bis zum Ende des Fensters', async () => {
  await withShortServer(async (base) => {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/v1/short/ZZZZ${i}`)).status, 404)
    assert.equal((await fetch(`${base}/v1/short/ZZZZ9`)).status, 429)
  }, 3)
})

test('Rate-Limit-Schlüssel: IPv6 je /64, IPv4 unverändert', () => {
  assert.equal(limitKeyOf('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64')
  assert.equal(limitKeyOf('2001:db8:1:2:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64')
  assert.equal(limitKeyOf('2001:db8::1'), '2001:db8:0:0::/64')
  assert.equal(limitKeyOf('203.0.113.7'), '203.0.113.7')
  assert.equal(limitKeyOf('::ffff:203.0.113.7'), '::ffff:203.0.113.7')
})
