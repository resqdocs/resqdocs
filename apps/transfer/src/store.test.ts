import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createStore, clampTtl, BlobTooLargeError, StoreFullError, MAX_BLOB_BYTES, TTL_STAGES, CLAIM_SECONDS } from './store.ts'

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

test('„1× lesen“ mit Reservierung: erst consume verbraucht, release gibt frei, andere warten', () => {
  const now = { t: 10_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('X'), 3600, true)
  const a = store.fetch(id, { claim: true })
  assert.equal(a.kind, 'ok')
  if (a.kind !== 'ok') return
  assert.ok(a.claimToken && a.priorOpens === 0)
  assert.equal(store.fetch(id, { claim: true }).kind, 'busy', 'zweites Gerät wartet')
  assert.equal(store.fetch(id).kind, 'busy', 'auch die Empfangsseite/ältere App verbraucht ihn nicht')
  assert.equal(store.release(id, 'falsch'), false)
  assert.equal(store.release(id, a.claimToken), true)
  const b = store.fetch(id, { claim: true })
  assert.ok(b.kind === 'ok' && b.claimToken && b.priorOpens === 1, 'wieder abrufbar, früheres Öffnen gezählt')
  if (b.kind !== 'ok' || !b.claimToken) return
  assert.equal(store.consume(id, a.claimToken), false, 'altes Token gilt nicht mehr')
  assert.equal(store.consume(id, b.claimToken), true)
  assert.equal(store.fetch(id, { claim: true }).kind, 'missing')
})

test('Reservierung läuft ab: ohne Rückmeldung gilt der Link danach wieder', () => {
  const now = { t: 10_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('X'), 3600, true)
  assert.equal(store.fetch(id, { claim: true }).kind, 'ok')
  now.t += (CLAIM_SECONDS - 1) * 1000
  assert.equal(store.fetch(id, { claim: true }).kind, 'busy')
  now.t += 2000
  assert.equal(store.fetch(id).kind, 'ok', 'nach Ablauf: ohne claim wie bisher sofort verbraucht')
  assert.equal(store.fetch(id).kind, 'missing')
})

test('Ohne „1× lesen“ ändert claim nichts: kein Token, beliebig oft lesbar', () => {
  const store = mkStore({ t: 10_000_000 })
  const { id } = store.put(bytes('X'), 3600, false)
  const r = store.fetch(id, { claim: true })
  assert.ok(r.kind === 'ok' && !r.claimToken)
  assert.equal(store.fetch(id, { claim: true }).kind, 'ok')
})

test('Bestehende Datenbank ohne Reservierungs-Spalten wird beim Start nachgerüstet', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, ciphertext BLOB NOT NULL, expires_at INTEGER NOT NULL, burn INTEGER NOT NULL, delete_token TEXT NOT NULL)')
  db.prepare('INSERT INTO blobs VALUES (?, ?, ?, 1, ?)').run('alt1', bytes('A'), 99_999_999_999, 'tok')
  const store = createStore(db, () => 10_000_000)
  const r = store.fetch('alt1', { claim: true })
  assert.ok(r.kind === 'ok' && r.claimToken && r.priorOpens === 0)
})

const LONG = (id: string) => `https://transfer.resqdocs.app/#${id}.${'k'.repeat(43)}`

test('Kurzlink: anlegen und auflösen; je Inhalt derselbe Code; 5 Zeichen', () => {
  const now = { t: 1_000_000_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('x'), 3600, false)
  const a = store.shorten(id, LONG(id))
  assert.ok(a)
  assert.match(a.code, /^[A-Za-z0-9]{5}$/)
  assert.deepEqual(store.shorten(id, LONG(id))?.code, a.code)
  assert.deepEqual(store.resolve(a.code), { kind: 'ok', target: LONG(id) })
  assert.deepEqual(store.resolve('ZZZZZ'), { kind: 'missing' })
  assert.equal(store.shorten('gibtsnicht', LONG('gibtsnicht')), null)
})

test('Kurzlink: übernommener „1× lesen“-Inhalt löscht das Ziel sofort, der Code bleibt 30 Tage gesperrt', () => {
  const now = { t: 1_000_000_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('x'), 3600, true)
  const s = store.shorten(id, LONG(id))!
  const r = store.fetch(id, { claim: true })
  assert.equal(r.kind, 'ok')
  assert.equal(store.resolve(s.code).kind, 'ok') // nur reserviert, noch nicht übernommen
  assert.ok(r.kind === 'ok' && store.consume(id, r.claimToken!))
  assert.deepEqual(store.resolve(s.code), { kind: 'expired' })
  now.t += (3600 + 29 * 86400) * 1000
  store.sweep()
  assert.deepEqual(store.resolve(s.code), { kind: 'expired' }) // noch gesperrt
  now.t += 2 * 86400 * 1000
  store.sweep()
  assert.deepEqual(store.resolve(s.code), { kind: 'missing' }) // frei
})

test('Kurzlink: abgelaufener Inhalt -> expired, Ziel gelöscht (auch ohne sweep)', () => {
  const now = { t: 1_000_000_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('x'), 3600, false)
  const s = store.shorten(id, LONG(id))!
  now.t += 3601 * 1000
  assert.deepEqual(store.resolve(s.code), { kind: 'expired' })
})

test('Kurzlink: ein Code je Inhalt, auch bei anderem Ziel (Tabelle wächst nicht mit Fantasie-Schlüsseln)', () => {
  const now = { t: 1_000_000_000_000 }
  const store = mkStore(now)
  const { id } = store.put(bytes('x'), 3600, false)
  const a = store.shorten(id, LONG(id))!
  const other = `https://transfer.resqdocs.app/#${id}.${'z'.repeat(43)}`
  assert.equal(store.shorten(id, other)?.code, a.code)
  assert.deepEqual(store.resolve(a.code), { kind: 'ok', target: other })
})

test('Kurzlink: volle Tabelle verdrängt die ältesten nur noch gesperrten Codes statt das Anlegen zu blockieren', () => {
  const now = { t: 1_000_000_000_000 }
  const store = createStore(new DatabaseSync(':memory:'), () => now.t, 1) // maxBlobs 1 -> höchstens 4 Kurzlink-Zeilen
  for (let i = 0; i < 4; i++) {
    const { id } = store.put(bytes('x'), 3600, false)
    assert.ok(store.shorten(id, LONG(id)))
    assert.equal(store.get(id) !== null, true)
    now.t += 3601 * 1000
    store.sweep() // Inhalt weg, Code bleibt gesperrt
  }
  const { id } = store.put(bytes('x'), 3600, false)
  assert.ok(store.shorten(id, LONG(id)))
})
