// node --test --experimental-strip-types
// Slice 2 (Orchestrierung): runBackup gegen Fake-Ports — Degradations-Guard, Dedup, Rotation, Index.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBackup, sha256Hex, type BackupDataSource, type BackupStore } from './backupService.ts'
import type { SnapshotMeta } from './backupRotation.ts'
import { createContainer, createField, addChild } from '@resqdocs/protocol-core/creator'
import type { Container } from '@resqdocs/protocol-core/model'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import type { PznLibrary } from '../medications/pznLibrary.ts'

const proto = (id: string, title: string): Container => {
  let root = createContainer(id)
  root = addChild(root, id, createField(`${id}-f`)) as Container
  return { ...root, title }
}

interface SrcSeed {
  degraded?: string | null
  protocols?: Container[]
  blocks?: Container[]
  snippets?: SnippetPayload[]
  pzn?: PznLibrary | null
}
function fakeSrc(seed: SrcSeed = {}): BackupDataSource {
  return {
    degradedReason: () => seed.degraded ?? null,
    loadProtocols: async () => seed.protocols ?? [],
    loadBlocks: async () => seed.blocks ?? [],
    loadSnippets: async () => seed.snippets ?? [],
    loadPzn: async () => seed.pzn ?? null,
    appInfo: () => ({ version: '1.2.2', build: '13' }),
  }
}

function fakeStore() {
  let index: SnapshotMeta[] = []
  const files = new Map<string, string>()
  const store: BackupStore = {
    listIndex: async () => index,
    writeSnapshot: async (n, j) => void files.set(n, j),
    deleteSnapshot: async (n) => void files.delete(n),
    putIndex: async (m) => void (index = m),
  }
  return { store, files, index: () => index }
}

// deterministischer Content-Hash für die Tests (voller Inhalt als Hash)
const idHash = async (s: string) => s

test('Degradations-Guard: bei defekter DB wird NICHTS geschrieben', async () => {
  const { store, files } = fakeStore()
  const r = await runBackup(fakeSrc({ degraded: 'db locked', protocols: [proto('p', 'A')] }), store, { now: 1_700_000_000_000, hash: idHash })
  assert.deepEqual(r, { written: false, reason: 'degraded' })
  assert.equal(files.size, 0)
})

test('leer + noch nie ein Backup -> kein leeres Erst-Backup', async () => {
  const { store, files } = fakeStore()
  const r = await runBackup(fakeSrc({}), store, { now: 1_700_000_000_000, hash: idHash })
  assert.deepEqual(r, { written: false, reason: 'empty' })
  assert.equal(files.size, 0)
})

test('erstes Backup: geschrieben + Index hat einen Eintrag', async () => {
  const { store, files, index } = fakeStore()
  const r = await runBackup(fakeSrc({ protocols: [proto('p1', 'A')] }), store, { now: 1_700_000_000_000, hash: idHash })
  assert.equal(r.written, true)
  assert.equal(files.size, 1)
  assert.equal(index().length, 1)
})

test('unverändert: zweiter Lauf schreibt nicht (Dedup)', async () => {
  const { store, files } = fakeStore()
  const src = fakeSrc({ protocols: [proto('p1', 'A')] })
  await runBackup(src, store, { now: 1_700_000_000_000, hash: idHash })
  const r2 = await runBackup(src, store, { now: 1_700_000_100_000, hash: idHash })
  assert.deepEqual(r2, { written: false, reason: 'unchanged' })
  assert.equal(files.size, 1)
})

test('Änderung: neuer Snapshot wird angelegt', async () => {
  const { store, files } = fakeStore()
  await runBackup(fakeSrc({ protocols: [proto('p1', 'A')] }), store, { now: 1_700_000_000_000, hash: idHash })
  const r2 = await runBackup(fakeSrc({ protocols: [proto('p1', 'A'), proto('p2', 'B')] }), store, { now: 1_700_100_000_000, hash: idHash })
  assert.equal(r2.written, true)
  assert.equal(files.size, 2)
})

test('Anti-Regression über den Service: leerer Lauf nach vollem behält den vollen im Index', async () => {
  const { store, index } = fakeStore()
  // voller Stand
  await runBackup(fakeSrc({ protocols: [proto('p1', 'A'), proto('p2', 'B'), proto('p3', 'C')] }), store, { now: 1_700_000_000_000, hash: idHash })
  const richName = index()[0].name
  // Tage später: alles gelöscht (total 0) -> wird gesichert, aber der volle Stand bleibt im Index
  const r = await runBackup(fakeSrc({}), store, { now: 1_700_000_000_000 + 10 * 86_400_000, hash: idHash })
  assert.equal(r.written, true, 'die Leerung wird als Snapshot festgehalten')
  assert.ok(index().some((m) => m.name === richName), 'der reichhaltige Stand bleibt erhalten')
})

test('origin + counts landen im Index-Meta', async () => {
  const { store, index } = fakeStore()
  await runBackup(fakeSrc({ protocols: [proto('p1', 'A'), proto('p2', 'B')] }), store, { now: 1_700_000_000_000, hash: idHash, origin: 'manual' })
  const m = index()[0]
  assert.equal(m.origin, 'manual')
  assert.equal(m.counts?.protocols, 2)
})

test('sha256Hex ist deterministisch + 64-hex', async () => {
  const a = await sha256Hex('abc')
  assert.equal(a, await sha256Hex('abc'))
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('Altersgrenze ohne neuen Stand: abgelaufene Sicherung wird gelöscht und als pruned gemeldet', async () => {
  const DAY = 86_400_000
  const t0 = 1_700_000_000_000
  const { store, files, index } = fakeStore()
  // Zwei Stände ohne Frist anlegen, dann die Frist einschalten und OHNE Änderung erneut sichern.
  const r1 = await runBackup(fakeSrc({ protocols: [proto('p1', 'A')] }), store, { now: t0, hash: idHash })
  const src = fakeSrc({ protocols: [proto('p1', 'B')] })
  await runBackup(src, store, { now: t0 + 10 * DAY, hash: idHash })
  assert.equal(files.size, 2)
  const cfg = { recent: 10, dailyDays: 30, weeklyWeeks: 12, maxAgeDays: 30 }
  const r3 = await runBackup(src, store, { now: t0 + 50 * DAY, hash: idHash, cfg })
  const alt = r1.written ? r1.name : ''
  assert.deepEqual(r3, { written: false, reason: 'unchanged', pruned: [alt] })
  assert.equal(files.has(alt), false, 'Datei des abgelaufenen Stands ist weg')
  assert.deepEqual(index().map((m) => m.name).includes(alt), false, 'und steht nicht mehr im Index')
  assert.equal(files.size, 1, 'der neueste Stand bleibt, obwohl auch er älter als die Frist ist')
})
