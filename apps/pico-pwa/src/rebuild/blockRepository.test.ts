// Laeuft mit:  node --test --experimental-strip-types --experimental-sqlite
// Baustein-Bibliothek (Rework Slice 2): eigene Tabelle rework_blocks, gleiche Grundpruefung wie die
// Protokoll-Bibliothek. Spiegelt protocolRepository.test.ts (fakeSqlClient + Migrationen).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBlockRepositoryOnClient, createMemoryBlockRepository } from '@resqdocs/protocol-core/blockRepository'
import { createContainer, createField, addChild } from '@resqdocs/protocol-core/creator'
import { createFakeSqlClient } from '../storage/sqlite/fakeSqlClient.ts'
import { runMigrations } from '../storage/sqlite/sqliteMigrations.ts'
import type { Container } from '@resqdocs/protocol-core/model'

const FIXED = '2026-01-01T00:00:00.000Z'

const sample = (id = 'b1', title = 'Anamnese'): Container => {
  let root: Container = createContainer(id)
  root = addChild(root, id, createField('a')) as Container
  return { ...root, title }
}

test('Migration v9 legt rework_blocks an', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  assert.equal(client.hasTable('rework_blocks'), true)
})

test('SQLite-Repo (Fake): save/load/update/remove/reset Round-trip', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createBlockRepositoryOnClient(client, () => FIXED)

  await repo.save(sample('b1', 'Anamnese'))
  let all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'b1')
  assert.equal(all[0].title, 'Anamnese')
  assert.equal(all[0].children.length, 1)

  // gleiche id -> Update, kein Duplikat
  await repo.save(sample('b1', 'Geaendert'))
  all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].title, 'Geaendert')

  // zweiter Baustein
  await repo.save({ ...createContainer('b2'), title: 'Zwei' })
  assert.equal((await repo.loadAll()).length, 2)

  await repo.remove('b1')
  all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'b2')

  await repo.reset()
  assert.equal((await repo.loadAll()).length, 0)
})

test('SQLite-Repo (Fake): stabile Reihenfolge ueber created_at - Umbenennen sortiert NICHT um', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  let t = 0
  const repo = createBlockRepositoryOnClient(client, () => `t${String(t++).padStart(3, '0')}`)
  await repo.save(sample('b1', 'Erst'))
  await repo.save(sample('b2', 'Zweit'))
  await repo.save(sample('b3', 'Dritt'))
  assert.deepEqual((await repo.loadAll()).map((b) => b.id), ['b1', 'b2', 'b3'])
  // b1 aktualisieren -> created_at bleibt -> b1 bleibt vorne
  await repo.save(sample('b1', 'Erst neu'))
  assert.deepEqual((await repo.loadAll()).map((b) => b.id), ['b1', 'b2', 'b3'])
})

test('SQLite-Repo (Fake): defektes JSON wird beim Laden uebersprungen', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createBlockRepositoryOnClient(client, () => FIXED)
  await repo.save(sample('ok', 'Gut'))
  await client.run(
    'INSERT OR REPLACE INTO rework_blocks (id, title, block_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['bad', 'Kaputt', '{nicht json', FIXED, FIXED],
  )
  const all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'ok')
})

test('SQLite-Repo (Fake): ungueltiger Baum (kein Container) -> save wirft', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createBlockRepositoryOnClient(client, () => FIXED)
  await assert.rejects(() => repo.save({ type: 'field', id: 'bad' } as unknown as Container))
})

test('SQLite-Repo (Fake): Speicherstand ist von der Quelle entkoppelt (tiefe Kopie)', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createBlockRepositoryOnClient(client, () => FIXED)
  const src = sample('b1', 'Original')
  await repo.save(src)
  src.title = 'nachtraeglich mutiert'
  src.children.push(createField('spaeter'))
  const all = await repo.loadAll()
  assert.equal(all[0].title, 'Original')
  assert.equal(all[0].children.length, 1)
})

test('Memory-Repo: save/load/remove/reset + Update in-place, neue ans Ende', async () => {
  const repo = createMemoryBlockRepository()
  await repo.save(sample('b1', 'A'))
  await repo.save({ ...createContainer('b2'), title: 'B' })
  assert.deepEqual((await repo.loadAll()).map((b) => b.id), ['b1', 'b2'])
  await repo.save(sample('b1', 'A2')) // Update -> bleibt an Position 0
  assert.deepEqual((await repo.loadAll()).map((b) => b.id), ['b1', 'b2'])
  assert.equal((await repo.loadAll())[0].title, 'A2')
  await repo.remove('b1')
  const all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'b2')
  await repo.reset()
  assert.equal((await repo.loadAll()).length, 0)
})

test('Memory-Repo: ungueltiger Baum -> save wirft; loadAll entkoppelt (tiefe Kopie)', async () => {
  const repo = createMemoryBlockRepository()
  await assert.rejects(() => repo.save({ type: 'container', id: 'x' } as unknown as Container)) // keine children
  await repo.save(sample('b1', 'X'))
  const a = await repo.loadAll()
  a[0].title = 'lokal veraendert'
  assert.equal((await repo.loadAll())[0].title, 'X') // interner Stand unberuehrt
})
