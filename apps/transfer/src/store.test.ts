import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createStore, clampTtl, BlobTooLargeError, StoreFullError, MAX_BLOB_BYTES, TTL_STAGES } from './store.ts'

function mkStore(nowRef: { t: number }) {
  return createStore(new DatabaseSync(':memory:'), () => nowRef.t)
}
const bytes = (s: string) => new TextEncoder().encode(s)

test('clampTtl: auf erlaubte Stufe (naechstniedrig), min 1h', () => {
  assert.equal(clampTtl(0), 3600)
  assert.equal(clampTtl(3599), 3600)
  assert.equal(clampTtl(3600), 3600)
  assert.equal(clampTtl(90000), 86400)
  assert.equal(clampTtl(999999999), 604800)
  assert.equal(clampTtl(NaN), 3600)
})

test('put + get: Round-Trip, id == code, Ablauf gesetzt', () => {
  const now = { t: 10_000_000 }
  const store = mkStore(now)
  const meta = store.put(bytes('CHIFFRAT'), 3600, false)
  assert.equal(meta.id, meta.code)
  assert.equal(meta.expiresAt, Math.floor(now.t / 1000) + 3600)
  assert.deepEqual(store.get(meta.id), bytes('CHIFFRAT'))
  assert.deepEqual(store.get(meta.id), bytes('CHIFFRAT'), 'ohne Burn beliebig oft lesbar')
})

test('Burn: nach dem ersten GET verbrannt -> zweiter GET null', () => {
  const store = mkStore({ t: 0 })
  const meta = store.put(bytes('EINMAL'), 3600, true)
  assert.deepEqual(store.get(meta.id), bytes('EINMAL'))
  assert.equal(store.get(meta.id), null, 'burn: zweiter Abruf leer')
  assert.equal(store.count(), 0)
})

test('TTL: abgelaufener Blob -> get null + aufgeraeumt', () => {
  const now = { t: 0 }
  const store = mkStore(now)
  const meta = store.put(bytes('X'), 3600, false)
  now.t = (3600 + 1) * 1000
  assert.equal(store.get(meta.id), null)
  assert.equal(store.count(), 0)
})

test('sweep: entfernt nur abgelaufene (auch nie abgerufene) Blobs', () => {
  const now = { t: 0 }
  const store = mkStore(now)
  store.put(bytes('alt'), 3600, false)
  now.t = 4000 * 1000 // erster abgelaufen
  const fresh = store.put(bytes('neu'), 3600, false)
  assert.equal(store.sweep(), 1)
  assert.equal(store.count(), 1)
  assert.deepEqual(store.get(fresh.id), bytes('neu'))
})

test('remove: nur mit korrektem Token', () => {
  const store = mkStore({ t: 0 })
  const meta = store.put(bytes('X'), 3600, false)
  assert.equal(store.remove(meta.id, 'falsch'), false)
  assert.equal(store.count(), 1)
  assert.equal(store.remove(meta.id, meta.deleteToken), true)
  assert.equal(store.count(), 0)
})

test('put: Blob > 512 KB -> BlobTooLargeError', () => {
  const store = mkStore({ t: 0 })
  assert.throws(() => store.put(new Uint8Array(MAX_BLOB_BYTES + 1), 3600, false), BlobTooLargeError)
  store.put(new Uint8Array(MAX_BLOB_BYTES), 3600, false) // exakt an der Grenze ok
  assert.equal(store.count(), 1)
})

test('get: unbekannte id -> null', () => {
  assert.equal(mkStore({ t: 0 }).get('gibtsnicht'), null)
})

test('TTL_STAGES sind exakt 1h/24h/7d', () => {
  assert.deepEqual([...TTL_STAGES], [3600, 86400, 604800])
})

test('Cap: an der Grenze -> StoreFullError, wenn nichts Abgelaufenes frei wird', () => {
  const now = { t: 10_000_000 }
  const store = createStore(new DatabaseSync(':memory:'), () => now.t, 2)
  store.put(bytes('A'), 3600, false)
  store.put(bytes('B'), 3600, false)
  assert.throws(() => store.put(bytes('C'), 3600, false), StoreFullError)
  assert.equal(store.count(), 2)
})

test('Cap: Abgelaufenes wird zuerst weggeraeumt -> put gelingt wieder', () => {
  const now = { t: 0 }
  const store = createStore(new DatabaseSync(':memory:'), () => now.t, 2)
  store.put(bytes('A'), 3600, false)
  store.put(bytes('B'), 3600, false)
  now.t = (3600 + 1) * 1000 // beide abgelaufen
  const meta = store.put(bytes('C'), 3600, false) // Cap raeumt A+B weg -> C passt
  assert.ok(meta.id)
  assert.equal(store.count(), 1)
})

test('put: Gesamt-Byte-Cap (unabhaengig von der Anzahl) -> StoreFullError', () => {
  const store = createStore(new DatabaseSync(':memory:'), () => 1_000_000, 10000, 10) // 10 Bytes Gesamt-Budget
  store.put(bytes('12345678'), 3600, false) // 8 Bytes <= 10 -> ok
  assert.throws(() => store.put(bytes('12345678'), 3600, false), StoreFullError) // 8+8 > 10 -> voll
})

test('sweep gibt beim Ablauf frei -> Byte-Cap nimmt danach wieder auf', () => {
  const nowRef = { t: 1_000_000 }
  const store = createStore(new DatabaseSync(':memory:'), () => nowRef.t, 10000, 10)
  store.put(bytes('12345678'), 3600, false)
  nowRef.t += 3601 * 1000 // erster Blob abgelaufen
  store.put(bytes('12345678'), 3600, false) // put raeumt Abgelaufenes weg -> passt wieder
  assert.equal(store.count(), 1)
})
