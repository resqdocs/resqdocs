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
  buildTransferLink,
  parseTransferInput,
  TransferError,
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
