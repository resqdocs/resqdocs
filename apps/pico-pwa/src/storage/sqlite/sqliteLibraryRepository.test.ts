// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFakeSqlClient } from './fakeSqlClient.ts'
import { runMigrations, getUserVersion, LATEST_VERSION, LIBRARY_PROTOCOLS_TABLE, MIGRATIONS } from './sqliteMigrations.ts'
import { createLibraryRepositoryOnClient } from './sqliteLibraryRepository.ts'

const proto = (id: string, title = id) => ({ schemaVersion: '0.1.0', id, title, blocks: [], variables: [] })
let seq = 0
const fixedNow = () => `2026-01-01T00:00:${String(seq++).padStart(2, '0')}.000Z`

test('Migration ist idempotent', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  await runMigrations(client)
  assert.ok(client.hasTable(LIBRARY_PROTOCOLS_TABLE))
})

test('user_version: frisch 0, nach Migration LATEST (=7), idempotent; alle Tabellen', async () => {
  const client = createFakeSqlClient()
  assert.equal(await getUserVersion(client), 0)
  assert.equal(await runMigrations(client), LATEST_VERSION)
  assert.equal(await getUserVersion(client), LATEST_VERSION)
  assert.equal(LATEST_VERSION, 7)
  assert.ok(client.hasTable('library_protocols'))
  assert.ok(client.hasTable('library_blocks'))
  assert.ok(client.hasTable('library_snippets'))
  assert.ok(client.hasTable('pzn_entries')) // #194/#195: PZN-Bibliothek (Migration v3)
  assert.ok(client.hasTable('rework_protocols')) // Rework-Bibliothek (Migration v6)
  // erneuter Lauf ändert nichts (keine DDL, Version bleibt)
  assert.equal(await runMigrations(client), LATEST_VERSION)
  assert.equal(await getUserVersion(client), LATEST_VERSION)
})

test('Android-Splitter-Sicherheit: CREATE-TRIGGER-Statements enthalten kein ";\\n"', () => {
  // getStatementsArray des Android-Plugins zerschneidet Statements an ";\n" — ein
  // mehrzeiliger BEGIN…END-Trigger würde zerrissen und die Migration bräche auf Android.
  // Diese Trigger MÜSSEN einzeilig bleiben.
  const triggers = MIGRATIONS.flatMap((m) => m.statements).filter((s) => /CREATE TRIGGER/i.test(s))
  assert.ok(triggers.length >= 3, 'die drei pzn_fts-Trigger müssen existieren')
  for (const t of triggers) {
    assert.ok(!t.includes(';\n'), `Trigger darf kein ";\\n" enthalten (Android-Splitter): ${t.slice(0, 70)}…`)
  }
})

test('Migration v1→aktuell: bestehende v1-DB erhält nur die neuen Tabellen', async () => {
  const client = createFakeSqlClient()
  // simuliere DB auf v1 (nur protocols vorhanden)
  await client.execute('CREATE TABLE IF NOT EXISTS library_protocols (id TEXT)')
  await client.execute('PRAGMA user_version = 1')
  await runMigrations(client)
  assert.equal(await getUserVersion(client), LATEST_VERSION)
  assert.ok(client.hasTable('library_blocks') && client.hasTable('library_snippets'))
  assert.ok(client.hasTable('pzn_entries'))
})

test('saveProtocol + loadProtocols Roundtrip', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createLibraryRepositoryOnClient(client, fixedNow)
  await repo.saveProtocol(proto('a', 'A'))
  await repo.saveProtocol(proto('b', 'B'))
  const list = await repo.loadProtocols()
  assert.deepEqual(list.map((p) => p.id).sort(), ['a', 'b'])
})

test('saveProtocol blockiert ungültiges Protokoll', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createLibraryRepositoryOnClient(client, fixedNow)
  await assert.rejects(() => repo.saveProtocol({ schemaVersion: '0.1.0', id: 'x', title: '', blocks: [] }), /Speichern abgelehnt/)
  assert.equal(client.rows().length, 0)
})

test('loadProtocols überspringt defektes JSON, übernimmt ungültige nicht still', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  // direkt manipulierte/defekte Datensätze einschleusen
  await client.run('INSERT OR REPLACE INTO library_protocols (id,title,schema_version,protocol_json,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ['bad', 'Bad', '0.1.0', '{ kaputt', '2026', '2026'])
  await client.run('INSERT OR REPLACE INTO library_protocols (id,title,schema_version,protocol_json,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ['invalid', 'Invalid', '0.1.0', JSON.stringify({ schemaVersion: '0.1.0', id: 'invalid', title: '', blocks: [] }), '2026', '2026'])
  await client.run('INSERT OR REPLACE INTO library_protocols (id,title,schema_version,protocol_json,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ['ok', 'Ok', '0.1.0', JSON.stringify(proto('ok', 'Ok')), '2026', '2026'])
  const list = await createLibraryRepositoryOnClient(client, fixedNow).loadProtocols()
  assert.deepEqual(list.map((p) => p.id), ['ok'])
})

test('saveProtocol erhält created_at, aktualisiert updated_at', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  let t = 0
  const now = () => `2026-01-01T00:00:0${t++}.000Z`
  const repo = createLibraryRepositoryOnClient(client, now)
  await repo.saveProtocol(proto('a', 'A'))
  await repo.saveProtocol(proto('a', 'A2'))
  const row = client.rows().find((r) => r.id === 'a')
  assert.equal(row.created_at, '2026-01-01T00:00:00.000Z')
  assert.notEqual(row.updated_at, row.created_at)
})

test('deleteProtocol entfernt nur das Zielprotokoll', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createLibraryRepositoryOnClient(client, fixedNow)
  await repo.saveProtocol(proto('a'))
  await repo.saveProtocol(proto('b'))
  await repo.deleteProtocol('a')
  assert.deepEqual((await repo.loadProtocols()).map((p) => p.id), ['b'])
})

test('resetLibrary löscht alle Library-Protokolle', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createLibraryRepositoryOnClient(client, fixedNow)
  await repo.saveProtocol(proto('a'))
  await repo.resetLibrary()
  assert.deepEqual(await repo.loadProtocols(), [])
})

test('kein caseState im gespeicherten protocol_json', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  await createLibraryRepositoryOnClient(client, fixedNow).saveProtocol(proto('a'))
  const json = String(client.rows()[0].protocol_json)
  assert.ok(!/values|activeBlocks|variableValues|caseState/.test(json))
})

// --- Bausteine + Snippets (SQLite-Repo gegen Fake-Client) ---

const libBlock = (id: string, title = id) => ({
  id, title, block: { id: `blk-${id}`, title, points: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const libSnippet = (id: string, title = id, text = 'Neutraler Text') => ({
  id, title, text, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

async function migratedRepo() {
  const client = createFakeSqlClient()
  await runMigrations(client)
  return { client, repo: createLibraryRepositoryOnClient(client, fixedNow) }
}

test('SQLite-Repo: Baustein speichern/laden/löschen', async () => {
  const { repo } = await migratedRepo()
  await repo.saveBlock(libBlock('a', 'Mitfahrtverweigerung'))
  await repo.saveBlock(libBlock('b'))
  let list = await repo.loadBlocks()
  assert.deepEqual(list.map((b) => b.id).sort(), ['a', 'b'])
  assert.equal(list.find((b) => b.id === 'a').block.title, 'Mitfahrtverweigerung')
  await repo.deleteBlock('a')
  list = await repo.loadBlocks()
  assert.deepEqual(list.map((b) => b.id), ['b'])
})

test('SQLite-Repo: Baustein-Validierung blockt ungültig, Load überspringt defektes JSON', async () => {
  const { client, repo } = await migratedRepo()
  await assert.rejects(() => repo.saveBlock({ id: 'x', title: '', block: { id: 'b', title: '', points: [] }, createdAt: '', updatedAt: '' }), /ungültig/)
  await client.run('INSERT OR REPLACE INTO library_blocks (id,title,block_json,created_at,updated_at) VALUES (?,?,?,?,?)',
    ['bad', 'Bad', '{ kaputt', '2026', '2026'])
  assert.deepEqual(await repo.loadBlocks(), [])
})

test('SQLite-Repo: Snippet speichern/laden/löschen', async () => {
  const { repo } = await migratedRepo()
  await repo.saveSnippet(libSnippet('s1', 'Hinweis'))
  await repo.saveSnippet(libSnippet('s2'))
  let list = await repo.loadSnippets()
  assert.deepEqual(list.map((s) => s.id).sort(), ['s1', 's2'])
  await repo.deleteSnippet('s1')
  list = await repo.loadSnippets()
  assert.deepEqual(list.map((s) => s.id), ['s2'])
})

test('resetLibrary löscht Protokolle, Blöcke UND Snippets', async () => {
  const { repo } = await migratedRepo()
  await repo.saveProtocol(proto('p1'))
  await repo.saveBlock(libBlock('b1'))
  await repo.saveSnippet(libSnippet('s1'))
  await repo.resetLibrary()
  assert.deepEqual(await repo.loadProtocols(), [])
  assert.deepEqual(await repo.loadBlocks(), [])
  assert.deepEqual(await repo.loadSnippets(), [])
})

test('kein caseState im gespeicherten block_json', async () => {
  const { client, repo } = await migratedRepo()
  await repo.saveBlock(libBlock('a'))
  const json = String(client.rows('library_blocks')[0].block_json)
  assert.ok(!/values|activeBlocks|variableValues|caseState/.test(json))
})

test('SQLite-Schicht nutzt KEIN Preferences und keinen rohen Browser-Storage', () => {
  for (const f of ['sqliteLibraryRepository.ts', 'sqliteMigrations.ts', 'fakeSqlClient.ts', 'sqlClient.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/@capacitor\/preferences|localStorage\.|sessionStorage\.|indexedDB\./.test(src), `${f}`)
  }
})
