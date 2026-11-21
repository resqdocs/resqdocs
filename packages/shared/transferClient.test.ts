// node --test des Transfer-Clients gegen den ECHTEN Dienst (Ephemeral-Port). Beweist den vollen
// Rundweg Teilen -> Server -> Empfangen == Klartext, ohne dass der Server je Klartext/Schlüssel sieht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { createStore } from '../../apps/transfer/src/store.ts'
import { createTransferServer } from '../../apps/transfer/src/server.ts'
import {
  shareTransfer,
  receiveTransfer,
  openTransfer,
  buildTransferLink,
  parseTransferInput,
  TransferError,
  shortCodeOf,
  shortenTransferLink,
  removeShortLink,
} from './transferClient.ts'

async function withService(fn: (cfg: { baseUrl: string }) => Promise<void>) {
  const server = createTransferServer({ store: createStore(new DatabaseSync(':memory:')) })
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  try {
    await fn({ baseUrl: `http://127.0.0.1:${port}` })
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

test('Rundweg: shareTransfer -> receiveTransfer == Klartext', async () => {
  await withService(async (cfg) => {
    const plain = JSON.stringify({ schema: 'resqdocs-protocol', version: 1, tree: { title: 'µg € ≈' } })
    const share = await shareTransfer(plain, '24h', cfg)
    assert.match(share.link, /\/#[A-Za-z0-9]+\./)
    assert.equal(share.id, share.code)
    assert.equal(await receiveTransfer(share.link, cfg), plain)
  })
})

test('Empfangen akzeptiert vollen Link UND nacktes id.key', async () => {
  await withService(async (cfg) => {
    const share = await shareTransfer('daten', '1h', cfg)
    assert.equal(await receiveTransfer(`${share.id}.${share.keyB64url}`, cfg), 'daten')
  })
})

test('Burn (1× lesen): zweites Empfangen scheitert mit klarer Meldung', async () => {
  await withService(async (cfg) => {
    const share = await shareTransfer('einmal', 'burn', cfg)
    assert.equal(await receiveTransfer(share.link, cfg), 'einmal')
    await assert.rejects(() => receiveTransfer(share.link, cfg), /abgelaufen oder wurde bereits geöffnet/)
  })
})

test('falscher/kaputter Schlüssel im Link -> klarer Fehler statt Klartext', async () => {
  await withService(async (cfg) => {
    const share = await shareTransfer('geheim', '1h', cfg)
    const brokenKey = share.keyB64url.slice(0, -2) + (share.keyB64url.endsWith('A') ? 'BB' : 'AA')
    await assert.rejects(() => receiveTransfer(`${share.id}.${brokenKey}`, cfg), TransferError)
  })
})

test('ungültige Eingaben', async () => {
  await withService(async (cfg) => {
    await assert.rejects(() => receiveTransfer('kein-link', cfg), /Kein gültiger Transfer-Link/)
    await assert.rejects(() => receiveTransfer('', cfg), /Kein gültiger Transfer-Link/)
  })
})

test('Dienst nicht erreichbar -> TransferError (kein roher Netzfehler)', async () => {
  await assert.rejects(
    () => shareTransfer('x', '1h', { baseUrl: 'http://127.0.0.1:1' }),
    /nicht erreichbar/,
  )
})

test('200 mit Nicht-JSON-Body -> TransferError (kein roher SyntaxError)', async () => {
  const fetchImpl = (async () => new Response('<html>keine JSON</html>', { status: 201 })) as unknown as typeof fetch
  await assert.rejects(
    () => shareTransfer('x', '1h', { baseUrl: 'http://x', fetchImpl }),
    /Unerwartete Antwort/,
  )
})

test('Empfangen: Body-Lesefehler (Mid-Stream) -> TransferError statt rohem Fehler', async () => {
  const fetchImpl = (async () =>
    ({ ok: true, status: 200, arrayBuffer: () => Promise.reject(new TypeError('boom')) }) as unknown as Response) as unknown as typeof fetch
  await assert.rejects(
    () => receiveTransfer('abc.AAAA', { baseUrl: 'http://x', fetchImpl }),
    /nicht geladen werden/,
  )
})

test('buildTransferLink / parseTransferInput Round-Trip', () => {
  const link = buildTransferLink('https://transfer.resqdocs.app/', 'aB3xQ7', 'KEY-_123')
  assert.equal(link, 'https://transfer.resqdocs.app/#aB3xQ7.KEY-_123')
  assert.deepEqual(parseTransferInput(link), { id: 'aB3xQ7', keyB64url: 'KEY-_123' })
  assert.deepEqual(parseTransferInput('aB3xQ7.KEY-_123'), { id: 'aB3xQ7', keyB64url: 'KEY-_123' })
})

test('buildTransferLink: Editor-Kanal steht vor dem Fragment, der Link bleibt für jeden Empfänger lesbar', () => {
  const link = buildTransferLink('https://transfer.resqdocs.app', 'aB3xQ7', 'KEY-_123', 'dev')
  assert.equal(link, 'https://transfer.resqdocs.app/?e=dev#aB3xQ7.KEY-_123')
  assert.deepEqual(parseTransferInput(link), { id: 'aB3xQ7', keyB64url: 'KEY-_123' })
  // ohne Kanal: Zeichen für Zeichen wie bisher
  assert.equal(buildTransferLink('https://transfer.resqdocs.app', 'aB3xQ7', 'KEY-_123', undefined), 'https://transfer.resqdocs.app/#aB3xQ7.KEY-_123')
  // der Kanal ist ein kurzer Schlüssel, nie eine Adresse oder freier Text
  for (const bad of ['https://evil.example', 'DEV', 'a b', '', 'x'.repeat(17), '../x', 'e=1&x']) {
    assert.equal(buildTransferLink('https://transfer.resqdocs.app', 'aB3xQ7', 'KEY-_123', bad), 'https://transfer.resqdocs.app/#aB3xQ7.KEY-_123', bad)
  }
})

test('SICHERHEIT: der Schlüssel steht in KEINEM an den Server gesendeten Request (Pfad/Query/Header) — nur im Fragment', async () => {
  await withService(async (base) => {
    const calls: { url: string; init?: RequestInit }[] = []
    const recordingFetch = ((url: unknown, init?: unknown) => {
      calls.push({ url: String(url), init: init as RequestInit | undefined })
      return (globalThis.fetch as typeof fetch)(url as string, init as RequestInit)
    }) as typeof fetch
    const cfg = { baseUrl: base.baseUrl, fetchImpl: recordingFetch }
    const share = await shareTransfer('streng geheime Vorlage', 'burn', cfg)
    await receiveTransfer(share.link, cfg) // verbraucht den Burn-Blob; auch hier darf der Key nicht in die URL
    assert.ok(calls.length >= 2, 'POST + GET erwartet')
    for (const c of calls) {
      assert.ok(!c.url.includes(share.keyB64url), `Schlüssel in URL geleakt: ${c.url}`)
      const h = c.init?.headers as Record<string, string> | undefined
      for (const v of Object.values(h ?? {})) assert.ok(!String(v).includes(share.keyB64url), 'Schlüssel in Header geleakt')
    }
    // Positiv-Beleg: der GET-Pfad enthält NUR die inhaltsleere id
    assert.ok(calls.some((c) => c.url.endsWith(`/v1/blob/${share.id}`)), 'GET auf /v1/blob/{id} erwartet')
  })
})

test('openTransfer: „1× lesen“ gilt erst nach consume als geöffnet; release macht den Link wieder nutzbar', async () => {
  await withService(async (cfg) => {
    const { link } = await shareTransfer('{"a":1}', 'burn', cfg)
    const first = await openTransfer(link, cfg)
    assert.equal(first.text, '{"a":1}')
    assert.equal(first.priorOpens, 0)
    await assert.rejects(() => openTransfer(link, cfg), (e: unknown) => e instanceof TransferError && /anderen Gerät/.test(e.message))
    assert.equal(await first.release(), true)
    const second = await openTransfer(link, cfg)
    assert.equal(second.priorOpens, 1, 'früheres Öffnen ohne Übernehmen wird gemeldet')
    assert.equal(await second.consume(), true)
    assert.equal(await second.release(), true, 'nur das erste Abschließen zählt')
    await assert.rejects(() => receiveTransfer(link, cfg), /bereits geöffnet/)
  })
})

test('openTransfer ohne „1× lesen“ oder gegen älteren Dienst: kein Token, consume/release tun nichts', async () => {
  await withService(async (cfg) => {
    const { link } = await shareTransfer('{"b":2}', '1h', cfg)
    const t = await openTransfer(link, cfg)
    assert.equal(await t.consume(), true)
    assert.equal(await receiveTransfer(link, cfg), '{"b":2}', 'ohne Burn weiter lesbar')
  })
})

/** Dienst, dessen lange Links auf ihn selbst zeigen (für Kurzlinks muss der Dienst die eigene Adresse kennen). */
async function withShortService(fn: (cfg: { baseUrl: string }) => Promise<void>) {
  const probe = createTransferServer({ store: createStore(new DatabaseSync(':memory:')) })
  await new Promise<void>((r) => probe.listen(0, r))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((r) => probe.close(() => r()))
  const baseUrl = `http://127.0.0.1:${port}`
  const server = createTransferServer({ store: createStore(new DatabaseSync(':memory:')), publicBase: baseUrl })
  await new Promise<void>((r) => server.listen(port, r))
  try {
    await fn({ baseUrl })
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
}

test('Kurzlink erkennen: resq.li/<5 Zeichen>, mit oder ohne https://', () => {
  assert.equal(shortCodeOf('https://resq.li/Ab3k9'), 'Ab3k9')
  assert.equal(shortCodeOf(' resq.li/Ab3k9/ '), 'Ab3k9')
  assert.equal(shortCodeOf('https://resq.li/editor'), null)
  assert.equal(shortCodeOf('https://transfer.resqdocs.app/#abc.def'), null)
})

test('Kurzlink: anlegen, dann mit dem Kurzlink öffnen und übernehmen; danach abgelaufen', async () => {
  await withShortService(async (cfg) => {
    const shared = await shareTransfer('{"x":"Kurz"}', 'burn', cfg)
    const short = await shortenTransferLink(shared.link, cfg)
    assert.match(short.url, /^https:\/\/resq\.li\/[A-Za-z0-9]{5}$/)
    const opened = await openTransfer(short.url, cfg)
    assert.equal(opened.text, '{"x":"Kurz"}')
    assert.equal(opened.reserved, true)
    assert.equal(await opened.consume(), true)
    await assert.rejects(receiveTransfer(short.url, cfg), (e: unknown) => e instanceof TransferError && /abgelaufen oder wurde schon übernommen/.test(e.message))
  })
})

test('Angezeigte Links ohne https:// lassen sich wieder einfügen (lang und kurz)', () => {
  const lang = buildTransferLink('https://transfer.resqdocs.app', 'AbCdEfGh1234', 'k'.repeat(43))
  assert.deepEqual(parseTransferInput(lang.replace(/^https:\/\//, '')), parseTransferInput(lang))
  assert.equal(shortCodeOf('resq.li/Ab3k9'), 'Ab3k9')
})

test('„1× lesen“ mit falschem Schlüssel: Reservierung wird aufgehoben, der richtige Link geht sofort wieder', async () => {
  await withService(async (cfg) => {
    const shared = await shareTransfer('{"x":1}', 'burn', cfg)
    const falsch = buildTransferLink(cfg.baseUrl, shared.id, 'A'.repeat(43))
    await assert.rejects(openTransfer(falsch, cfg), TransferError)
    const opened = await openTransfer(shared.link, cfg)
    assert.equal(opened.text, '{"x":1}')
  })
})

test('Kurzlink zurücknehmen: danach gilt er nicht mehr, der lange Link schon; nur mit dem Lösch-Token', async () => {
  await withShortService(async (cfg) => {
    const shared = await shareTransfer('{"x":"bleibt"}', '1h', cfg)
    const short = await shortenTransferLink(shared.link, cfg)
    assert.equal(await removeShortLink(shared.link, 'falsch', cfg), false)
    assert.equal(await receiveTransfer(short.url, cfg), '{"x":"bleibt"}')
    assert.equal(await removeShortLink(shared.link, shared.deleteToken, cfg), true)
    await assert.rejects(receiveTransfer(short.url, cfg), TransferError)
    assert.equal(await receiveTransfer(shared.link, cfg), '{"x":"bleibt"}')
    // Erneut gesetzt: derselbe Code gilt wieder.
    assert.equal((await shortenTransferLink(shared.link, cfg)).url, short.url)
  })
})
