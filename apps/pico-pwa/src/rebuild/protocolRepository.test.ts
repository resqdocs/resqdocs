// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReworkRepositoryOnClient, createMemoryProtocolRepository, isValidProtocolTree, loadOrSeed, syncProtocols } from '@resqdocs/protocol-core/protocolRepository'
import { createContainer, createField, addChild } from '@resqdocs/protocol-core/creator'
import { createFakeSqlClient } from '../storage/sqlite/fakeSqlClient.ts'
import { runMigrations } from '../storage/sqlite/sqliteMigrations.ts'
import type { Container } from '@resqdocs/protocol-core/model'

const FIXED = '2026-01-01T00:00:00.000Z'

const sample = (id = 'p1', title = 'Standard'): Container => {
  let root: Container = createContainer(id)
  root = addChild(root, id, createField('a')) as Container
  return { ...root, title }
}

test('isValidProtocolTree: nur Container mit id + children-Array', () => {
  assert.equal(isValidProtocolTree({ type: 'container', id: 'x', children: [] }), true)
  assert.equal(isValidProtocolTree({ type: 'field', id: 'x' }), false)
  assert.equal(isValidProtocolTree({ type: 'container', id: 'x' }), false) // keine children
  assert.equal(isValidProtocolTree(null), false)
  assert.equal(isValidProtocolTree('nope'), false)
})

test('Migration v6 legt rework_protocols an', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  assert.equal(client.hasTable('rework_protocols'), true)
})

test('SQLite-Repo (Fake): save/load/update/remove/reset Round-trip', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createReworkRepositoryOnClient(client, () => FIXED)

  await repo.save(sample('p1', 'Standard'))
  let all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'p1')
  assert.equal(all[0].title, 'Standard')
  assert.equal(all[0].children.length, 1)

  // gleiche id -> Update, kein Duplikat
  await repo.save(sample('p1', 'Geaendert'))
  all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].title, 'Geaendert')

  // zweite Vorlage
  await repo.save({ ...createContainer('p2'), title: 'Zwei' })
  assert.equal((await repo.loadAll()).length, 2)

  await repo.remove('p1')
  all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'p2')

  await repo.reset()
  assert.equal((await repo.loadAll()).length, 0)
})

test('SQLite-Repo (Fake): defektes JSON wird beim Laden uebersprungen', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createReworkRepositoryOnClient(client, () => FIXED)
  await repo.save(sample('ok', 'Gut'))
  await client.run(
    'INSERT OR REPLACE INTO rework_protocols (id, title, protocol_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['bad', 'Kaputt', '{nicht json', FIXED, FIXED],
  )
  const all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'ok')
})

test('SQLite-Repo (Fake): ungueltiger Baum -> save wirft', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createReworkRepositoryOnClient(client, () => FIXED)
  await assert.rejects(() => repo.save({ type: 'field', id: 'bad' } as unknown as Container))
})

test('SQLite-Repo (Fake): replaceAll atomar - upsert vorhandene + entfernte loeschen', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  let t = 0
  const repo = createReworkRepositoryOnClient(client, () => `t${t++}`)
  await repo.replaceAll([sample('a', 'A'), sample('b', 'B')])
  assert.equal((await repo.loadAll()).length, 2)
  // a aendern, b entfernen, c neu - alles in EINER replaceAll
  await repo.replaceAll([sample('a', 'A2'), sample('c', 'C')])
  const all = await repo.loadAll()
  assert.deepEqual(all.map((p) => p.id).sort(), ['a', 'c'])
  assert.equal(all.find((p) => p.id === 'a')?.title, 'A2')
})

test('loadOrSeed: leere Bibliothek -> seedet + speichert; gefuellte -> laedt', async () => {
  const repo = createMemoryProtocolRepository()
  const seed = [sample('seed', 'Seed')]
  const first = await loadOrSeed(repo, seed)
  assert.equal(first.length, 1)
  assert.equal(first[0].id, 'seed')
  assert.equal((await repo.loadAll()).length, 1) // Seed wurde gespeichert
  // beim zweiten Mal NICHT erneut seeden, sondern die gespeicherte Bibliothek laden
  const second = await loadOrSeed(repo, [sample('anders', 'Anders')])
  assert.equal(second.length, 1)
  assert.equal(second[0].id, 'seed')
})

test('syncProtocols: upsert vorhandene + loesche entfernte', async () => {
  const repo = createMemoryProtocolRepository([sample('a', 'A'), sample('b', 'B')])
  // c hinzu, b weg, a geaendert
  await syncProtocols(repo, [sample('a', 'A2'), sample('c', 'C')])
  const all = await repo.loadAll()
  const byId = new Map(all.map((p) => [p.id, p]))
  assert.equal(all.length, 2)
  assert.equal(byId.get('a')?.title, 'A2')
  assert.ok(byId.has('c'))
  assert.equal(byId.has('b'), false)
})

test('replaceAll schreibt order_index = Array-Position (Fake)', async () => {
  const client = createFakeSqlClient()
  await runMigrations(client)
  const repo = createReworkRepositoryOnClient(client, () => FIXED)
  await repo.replaceAll([sample('a', 'A'), sample('b', 'B'), sample('c', 'C')])
  const idx = new Map(client.rows('rework_protocols').map((r) => [r.id, r.order_index]))
  assert.equal(idx.get('a'), 0)
  assert.equal(idx.get('b'), 1)
  assert.equal(idx.get('c'), 2)
  // umsortiert b,a,c -> order_index zieht mit
  await repo.replaceAll([sample('b', 'B'), sample('a', 'A'), sample('c', 'C')])
  const idx2 = new Map(client.rows('rework_protocols').map((r) => [r.id, r.order_index]))
  assert.equal(idx2.get('b'), 0)
  assert.equal(idx2.get('a'), 1)
  assert.equal(idx2.get('c'), 2)
})

test('Memory-Repo: replaceAll erhaelt die Array-Reihenfolge', async () => {
  const repo = createMemoryProtocolRepository()
  await repo.replaceAll([sample('a'), sample('b'), sample('c')])
  assert.deepEqual((await repo.loadAll()).map((p) => p.id), ['a', 'b', 'c'])
  await repo.replaceAll([sample('c'), sample('a'), sample('b')])
  assert.deepEqual((await repo.loadAll()).map((p) => p.id), ['c', 'a', 'b'])
})

test('Memory-Repo: save/load/remove/reset Round-trip', async () => {
  const repo = createMemoryProtocolRepository()
  await repo.save(sample('p1', 'A'))
  await repo.save({ ...createContainer('p2'), title: 'B' })
  assert.equal((await repo.loadAll()).length, 2)
  await repo.remove('p1')
  const all = await repo.loadAll()
  assert.equal(all.length, 1)
  assert.equal(all[0].id, 'p2')
  await repo.reset()
  assert.equal((await repo.loadAll()).length, 0)
})
