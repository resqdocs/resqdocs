// Läuft mit:  node --test --experimental-strip-types --experimental-sqlite
//
// Testet das PZN-SQLite-Repo gegen ECHTES In-Memory-SQLite (node:sqlite) — verlässlicher
// als ein Regex-Fake (ORDER BY/LIMIT/COUNT/LIKE/UPDATE/Transaktionen real geprüft).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import type { SqlClient, SqlRow } from '../storage/sqlite/sqlClient.ts'
import { runMigrations } from '../storage/sqlite/sqliteMigrations.ts'
import { createPznLibrarySqliteRepository } from './pznLibrarySqliteRepository.ts'

function nodeSqlClient(): SqlClient {
  const db = new DatabaseSync(':memory:')
  return {
    async execute(statement: string): Promise<void> {
      db.exec(statement)
    },
    async run(statement: string, values: unknown[] = []): Promise<void> {
      db.prepare(statement).run(...(values as never[]))
    },
    async query(statement: string, values: unknown[] = []): Promise<SqlRow[]> {
      return db.prepare(statement).all(...(values as never[])) as SqlRow[]
    },
    async transaction(work: () => Promise<void>): Promise<void> {
      db.exec('BEGIN')
      try {
        await work()
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
  }
}

async function freshRepo() {
  const client = nodeSqlClient()
  await runMigrations(client)
  return createPznLibrarySqliteRepository(client)
}

test('Migration v3: pzn_entries existiert und ist leer', async () => {
  const repo = await freshRepo()
  assert.equal(await repo.count(), 0)
  assert.equal(await repo.getEntry('12345678'), null)
})

test('setEntry/getEntry + Sanitizing (PZN normalisiert, Kategorie gegen feste Liste)', async () => {
  const repo = await freshRepo()
  await repo.setEntry('524306', { label: 'Ibu', category: 'Analgetikum (Nicht-Opioid)', note: 'Schmerz' }) // 6-stellig → 8
  const e = await repo.getEntry('00524306')
  assert.ok(e)
  assert.deepEqual([e!.pzn, e!.label, e!.category, e!.note], ['00524306', 'Ibu', 'Analgetikum (Nicht-Opioid)', 'Schmerz'])
  // ungültige Kategorie (nicht in der Admin-Liste) → ''
  await repo.setEntry('12345678', { label: 'X', category: 'Phantasiegruppe', note: '' })
  assert.equal((await repo.getEntry('12345678'))!.category, '')
})

test('granulare Setter ändern nur ihr Feld; UPDATE ist No-Op bei fehlender PZN', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { label: 'Alt', category: '', note: '' })
  await repo.setLabel('12345678', 'Neu')
  await repo.setCategory('12345678', 'Antidot')
  await repo.setNote('12345678', 'Hinweis')
  const e = await repo.getEntry('12345678')
  assert.deepEqual([e!.label, e!.category, e!.note], ['Neu', 'Antidot', 'Hinweis'])
  await repo.setLabel('99999999', 'Geist') // fehlende PZN → kein Insert
  assert.equal(await repo.getEntry('99999999'), null)
})

test('page: ORDER BY pzn, LIMIT/OFFSET, asc/desc', async () => {
  const repo = await freshRepo()
  for (const p of ['00000003', '00000001', '00000002']) await repo.setEntry(p, { label: '', category: '', note: '' })
  assert.deepEqual((await repo.page({ offset: 0, limit: 2 })).map((e) => e.pzn), ['00000001', '00000002'])
  assert.deepEqual((await repo.page({ offset: 2, limit: 2 })).map((e) => e.pzn), ['00000003'])
  assert.deepEqual((await repo.page({ offset: 0, limit: 1, dir: 'desc' })).map((e) => e.pzn), ['00000003'])
})

test('search (FTS + pzn-LIKE): Treffer über alle Felder; leerer Query = Seite', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { label: 'Ibuprofen', category: 'Analgetikum (Nicht-Opioid)', note: 'Schmerz' })
  await repo.setEntry('00524306', { label: 'Aspirin', category: 'Antidot', note: 'ACS' })
  const ids = (rs: { pzn: string }[]) => rs.map((e) => e.pzn)
  assert.deepEqual(ids(await repo.search('ibu', { offset: 0, limit: 10 })), ['12345678'])
  assert.deepEqual(ids(await repo.search('Antidot', { offset: 0, limit: 10 })), ['00524306'])
  assert.deepEqual(ids(await repo.search('ACS', { offset: 0, limit: 10 })), ['00524306'])
  assert.deepEqual(ids(await repo.search('5243', { offset: 0, limit: 10 })), ['00524306'])
  assert.equal((await repo.search('', { offset: 0, limit: 10 })).length, 2)
})

test('FTS5: Präfix-Token-Suche; Trigger halten den Index bei Upsert/Delete konsistent', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { wirkstoff: 'Buprenorphin', label: 'Temgesic', category: 'Opioid', note: '' })
  const ids = (rs: { pzn: string }[]) => rs.map((e) => e.pzn)
  assert.deepEqual(ids(await repo.search('bupre', { offset: 0, limit: 10 })), ['12345678']) // Präfix
  // Upsert (ON CONFLICT DO UPDATE) → AU-Trigger: alter Treffer weg, neuer da (kein stale FTS)
  await repo.setEntry('12345678', { wirkstoff: 'Naloxon', label: 'Narcanti', category: 'Antidot', note: '' })
  assert.equal((await repo.search('bupre', { offset: 0, limit: 10 })).length, 0)
  assert.deepEqual(ids(await repo.search('nalox', { offset: 0, limit: 10 })), ['12345678'])
  // setWirkstoff (UPDATE) → AU-Trigger
  await repo.setWirkstoff('12345678', 'Flumazenil')
  assert.deepEqual(ids(await repo.search('fluma', { offset: 0, limit: 10 })), ['12345678'])
  // Delete → AD-Trigger
  await repo.remove('12345678')
  assert.equal((await repo.search('fluma', { offset: 0, limit: 10 })).length, 0)
})

test('remove/clear', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { label: 'A', category: '', note: '' })
  await repo.setEntry('00524306', { label: 'B', category: '', note: '' })
  await repo.remove('12345678')
  assert.equal(await repo.count(), 1)
  await repo.clear()
  assert.equal(await repo.count(), 0)
})

test('bulkPut: skip überspringt Duplikate, overwrite lässt Import gewinnen; keine Löschung; Chunking', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { label: 'Lokal', category: 'Analgetikum (Nicht-Opioid)', note: 'alt' })
  const incoming = [
    { pzn: '12345678', label: 'Import', category: 'Antidot', note: 'neu' }, // Duplikat
    { pzn: '00524306', label: 'Frisch', category: '', note: '' }, // nur im Import
  ]
  await repo.bulkPut(incoming, 'skip', 1) // chunkSize 1 erzwingt mehrere Transaktionen
  assert.equal((await repo.getEntry('12345678'))!.label, 'Lokal') // übersprungen
  assert.equal((await repo.getEntry('00524306'))!.label, 'Frisch') // ergänzt
  await repo.bulkPut(incoming, 'overwrite', 1)
  const e = await repo.getEntry('12345678')
  assert.deepEqual([e!.label, e!.category, e!.note], ['Import', 'Antidot', 'neu']) // Import gewinnt
  assert.equal(await repo.count(), 2) // nichts gelöscht
})

test('bulkPut: mehrere Chunks (je eine Transaktion) — alle Einträge landen', async () => {
  const repo = await freshRepo()
  const entries = Array.from({ length: 12 }, (_, i) => ({
    pzn: String(i + 1).padStart(8, '0'), wirkstoff: '', label: `M${i + 1}`, category: '', note: '',
  }))
  await repo.bulkPut(entries, 'overwrite', 5) // chunkSize 5 → 3 Transaktionen
  assert.equal(await repo.count(), 12)
  assert.equal((await repo.getEntry('00000007'))!.label, 'M7')
})

test('Wirkstoff (Migration v4): setEntry/getEntry/setWirkstoff + Suche matcht Wirkstoff', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { wirkstoff: 'Ibuprofen', label: 'Ibu 600', category: 'Analgetikum (Nicht-Opioid)', note: '' })
  assert.equal((await repo.getEntry('12345678'))!.wirkstoff, 'Ibuprofen')
  await repo.setWirkstoff('12345678', 'Ibuprofen-Lysinat')
  assert.equal((await repo.getEntry('12345678'))!.wirkstoff, 'Ibuprofen-Lysinat')
  assert.deepEqual((await repo.search('lysinat', { offset: 0, limit: 10 })).map((e) => e.pzn), ['12345678'])
})

test('getEntry normalisiert: 6-stellige Scan-Eingabe matcht 8-stelligen Key in der DB', async () => {
  const repo = await freshRepo()
  await repo.setEntry('00524306', { wirkstoff: 'Atorvastatin', label: 'Ator 40', category: '', note: '' })
  assert.equal((await repo.getEntry('524306'))!.wirkstoff, 'Atorvastatin') // 6-stellig → 00524306
  assert.equal((await repo.getEntry('00524306'))!.label, 'Ator 40')
})

test('allSorted: vollständige Liste nach pzn (für Export)', async () => {
  const repo = await freshRepo()
  for (const p of ['00000002', '00000001']) await repo.setEntry(p, { label: '', category: '', note: '' })
  assert.deepEqual((await repo.allSorted()).map((e) => e.pzn), ['00000001', '00000002'])
})

test('Wirkstärke (#262, Migration v8): setEntry/getEntry/setStaerke/search/bulkPut-Roundtrip', async () => {
  const repo = await freshRepo()
  await repo.setEntry('12345678', { wirkstoff: 'Ibuprofen', staerke: '400 mg', label: 'Ibuflam', category: '', note: '' })
  assert.equal((await repo.getEntry('12345678'))!.staerke, '400 mg')
  await repo.setStaerke('12345678', '600 mg')
  assert.equal((await repo.getEntry('12345678'))!.staerke, '600 mg')
  await repo.setStaerke('99999999', '1 mg') // fehlende PZN -> No-op, kein Insert
  assert.equal(await repo.getEntry('99999999'), null)
  const hit = await repo.search('Ibuprofen', { offset: 0, limit: 10 })
  assert.equal(hit[0]?.staerke, '600 mg', 'search liefert die Staerke-Spalte mit')
  await repo.bulkPut([{ pzn: '12345678', wirkstoff: 'Ibuprofen', staerke: '800 mg', label: 'Ibuflam', category: '', note: '' }], 'skip')
  assert.equal((await repo.getEntry('12345678'))!.staerke, '600 mg', 'skip laesst Bestand stehen')
  await repo.bulkPut([{ pzn: '12345678', wirkstoff: 'Ibuprofen', staerke: '800 mg', label: 'Ibuflam', category: '', note: '' }], 'overwrite')
  assert.equal((await repo.getEntry('12345678'))!.staerke, '800 mg', 'overwrite uebernimmt den Import')
})

test('Nachpflege-Filter (#264): page/search mit missingStaerke + countMissingStaerke', async () => {
  const repo = await freshRepo()
  await repo.setEntry('00000001', { wirkstoff: 'Ibuprofen', staerke: '400 mg', label: 'Ibuflam', category: '', note: '' })
  await repo.setEntry('00000002', { wirkstoff: 'Ibuprofen', staerke: '', label: 'Ibu akut', category: '', note: '' })
  await repo.setEntry('00000003', { wirkstoff: 'Ramipril', staerke: '', label: 'Rami', category: '', note: '' })
  assert.equal(await repo.countMissingStaerke(), 2)
  const page = await repo.page({ offset: 0, limit: 10, missingStaerke: true })
  assert.deepEqual(page.map((e) => e.pzn), ['00000002', '00000003'])
  // Suche kombiniert mit Filter: FTS-Zweig (Wort) und LIKE-Zweig (PZN-Fragment)
  const fts = await repo.search('ibu', { offset: 0, limit: 10, missingStaerke: true })
  assert.deepEqual(fts.map((e) => e.pzn), ['00000002'])
  const like = await repo.search('0000000', { offset: 0, limit: 10, missingStaerke: true })
  assert.deepEqual(like.map((e) => e.pzn), ['00000002', '00000003'])
  // Ohne Filter unveraendert
  assert.equal((await repo.page({ offset: 0, limit: 10 })).length, 3)
  // Nachpflegen senkt den Zaehler
  await repo.setStaerke('00000002', '600 mg')
  assert.equal(await repo.countMissingStaerke(), 1)
})
