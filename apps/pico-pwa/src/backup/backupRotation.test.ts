// node --test --experimental-strip-types
// Slice 2 (Kern): reine Rotations-/Prune-Logik + Anti-Regressions-Guard. Headless.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBackup, snapshotName, isBackupFile, type SnapshotMeta } from './backupRotation.ts'

const T0 = 1_700_000_000_000
const DAY = 86_400_000
const HOUR = 3_600_000
const meta = (name: string, createdAt: number, total: number, hash = name): SnapshotMeta => ({ name, createdAt, hash, total })

test('snapshotName: deterministisches UTC-Format + isBackupFile', () => {
  const n = snapshotName(Date.UTC(2026, 6, 19, 13, 5, 9)) // Juli = Monat 6
  assert.equal(n, 'resqdocs-backup-20260719-130509-000.json.gz')
  assert.equal(isBackupFile(n), true)
  assert.equal(isBackupFile('fremd.json'), false)
})

test('Dedup: inhaltsgleich zum neuesten -> kein Schreiben', () => {
  const plan = planBackup([meta('a', T0, 5, 'H1')], { name: 'b', createdAt: T0 + 1000, hash: 'H1', total: 5 })
  assert.equal(plan.write, false)
  assert.equal(plan.prune.length, 0)
})

test('leere DB: erster Snapshot wird geschrieben, nichts gelöscht', () => {
  const plan = planBackup([], { name: 'first', createdAt: T0, hash: 'h', total: 5 })
  assert.equal(plan.write, true)
  assert.deepEqual(plan.prune, [])
  assert.ok(plan.keep.includes('first'))
})

test('recent=3 am selben Tag: die 2 ältesten werden gelöscht', () => {
  const cfg = { recent: 3, dailyDays: 7, weeklyWeeks: 4 }
  const ex = [0, 1, 2, 3].map((i) => meta(`s${i}`, T0 + i * 60_000, 5))
  const plan = planBackup(ex, { name: 'neu', createdAt: T0 + 5 * 60_000, hash: 'hneu', total: 5 }, cfg)
  assert.equal(plan.write, true)
  assert.deepEqual(plan.prune.sort(), ['s0', 's1'])
  assert.ok(plan.keep.includes('neu') && plan.keep.includes('s3') && plan.keep.includes('s2'))
})

test('Pre-Restore-Pinning: alte Sicherheitsstände bleiben rotations-immun', () => {
  const cfg = { recent: 2, dailyDays: 1, weeklyWeeks: 1 }
  const pre: SnapshotMeta = { name: 'pre', createdAt: T0, hash: 'hp', total: 3, origin: 'pre-restore' }
  const autos = [1, 2, 3, 4].map((i) => meta(`a${i}`, T0 + i * DAY, 3)) // Tage später -> würden 'pre' wegrotieren
  const plan = planBackup([pre, ...autos], { name: 'neu', createdAt: T0 + 5 * DAY, hash: 'hn', total: 3 }, cfg)
  assert.equal(plan.prune.includes('pre'), false, 'der pre-restore-Stand bleibt gepinnt (frei zurückspringen)')
  assert.ok(plan.keep.includes('pre'))
})

test('ANTI-REGRESSION: reichhaltigster Stand bleibt trotz leerer neuer Snapshots erhalten', () => {
  const rich = meta('rich', T0, 100, 'hr') // vor 10 Tagen, voll
  const empties = [1, 2, 3].map((i) => meta(`e${i}`, T0 + 10 * DAY + i * HOUR, 0)) // heute, leer (nach Reset)
  const plan = planBackup([rich, ...empties], { name: 'e4', createdAt: T0 + 10 * DAY + 4 * HOUR, hash: 'he4', total: 0 })
  assert.equal(plan.prune.includes('rich'), false, 'der volle Stand darf NICHT verdrängt werden')
  assert.ok(plan.keep.includes('rich'))
})

test('GFS über 10 Tage: die 3 neuesten immer behalten, keep/prune disjunkt + vollständig', () => {
  const ex = Array.from({ length: 10 }, (_, i) => meta(`d${i}`, T0 + i * DAY, 5)) // d9 = neuester
  const plan = planBackup(ex, { name: 'neu', createdAt: T0 + 10 * DAY, hash: 'hneu', total: 5 })
  // Invarianten
  const allNames = ['neu', ...ex.map((s) => s.name)]
  assert.deepEqual([...plan.keep, ...plan.prune].sort(), allNames.sort(), 'jede Datei ist entweder keep oder prune')
  assert.equal(plan.keep.some((n) => plan.prune.includes(n)), false, 'keep/prune disjunkt')
  for (const n of ['neu', 'd9', 'd8']) assert.ok(plan.keep.includes(n), `die neuesten bleiben (${n})`)
})
