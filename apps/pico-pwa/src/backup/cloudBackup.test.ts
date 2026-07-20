// node --test --experimental-strip-types
// Cloud-Kern: Namens-Roundtrip + gerätescoped-append-only-Sync (Gerät A prunet NIE Gerät Bs Snapshots).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cloudName, parseCloudName, planCloudSync, cloudHistory, type CloudFile } from './cloudBackup.ts'

const T0 = 1_700_000_000_000
const DAY = 86_400_000
const HASH = 'abcdef0123456789' // >= 12 Zeichen

const file = (deviceId: string, createdAt: number, total: number, hash: string, id: string): CloudFile => ({
  id,
  name: cloudName({ deviceId, createdAt, total, hash }),
  modifiedTime: createdAt,
  size: total * 100,
})

test('cloudName/parseCloudName: Roundtrip (hash auf 12 gekürzt)', () => {
  const name = cloudName({ deviceId: 'aaa', createdAt: T0, total: 5, hash: HASH })
  const m = parseCloudName(name)
  assert.ok(m)
  assert.equal(m.deviceId, 'aaa')
  assert.equal(m.createdAt, T0)
  assert.equal(m.total, 5)
  assert.equal(m.hash, HASH.slice(0, 12))
  assert.equal(parseCloudName('fremd.json'), null)
})

test('Dedup: eigener neuester Stand inhaltsgleich -> kein Upload', () => {
  const files = [file('aaa', T0, 5, HASH, 'id1')]
  const plan = planCloudSync(files, 'aaa', { createdAt: T0 + 1000, total: 5, hash: HASH })
  assert.equal(plan.upload, false)
  assert.deepEqual(plan.pruneIds, [])
})

test('GERÄTESCOPED: Gerät A prunet nur EIGENE Snapshots, NIE die von Gerät B', () => {
  const cfg = { recent: 1, dailyDays: 1, weeklyWeeks: 1 } // aggressiv, erzwingt Prune
  const files: CloudFile[] = [
    file('aaa', T0, 5, 'h0000000000a', 'a0'),
    file('aaa', T0 + 60_000, 5, 'h0000000000b', 'a1'),
    file('aaa', T0 + 120_000, 5, 'h0000000000c', 'a2'),
    file('bbb', T0 + 90_000, 5, 'h0000000000x', 'b0'), // Gerät B – darf NIE geprunt werden
  ]
  const plan = planCloudSync(files, 'aaa', { createdAt: T0 + 300_000, total: 5, hash: 'h0000000000n' }, cfg)
  assert.equal(plan.upload, true)
  assert.ok(plan.pruneIds.length > 0, 'eigene alte Stände werden ausgedünnt')
  assert.equal(plan.pruneIds.includes('b0'), false, 'Gerät B bleibt unangetastet')
  for (const id of plan.pruneIds) assert.ok(id.startsWith('a'), `nur eigene ids (${id})`)
})

test('Anti-Regression greift auch in der Cloud (reichster eigener Stand bleibt)', () => {
  const cfg = { recent: 1, dailyDays: 1, weeklyWeeks: 1 }
  const files: CloudFile[] = [
    file('aaa', T0, 100, 'h00000000rich', 'rich'), // reich, alt
    file('aaa', T0 + 10 * DAY, 0, 'h0000000empt', 'empty'), // leer, neu
  ]
  const plan = planCloudSync(files, 'aaa', { createdAt: T0 + 11 * DAY, total: 0, hash: 'h0000000new0' }, cfg)
  assert.equal(plan.pruneIds.includes('rich'), false, 'der reichste eigene Stand bleibt')
})

test('cloudHistory: alle Geräte gemischt, neueste zuerst', () => {
  const files: CloudFile[] = [
    file('aaa', T0, 5, HASH, 'a0'),
    file('bbb', T0 + 5000, 7, HASH, 'b0'),
  ]
  const hist = cloudHistory(files)
  assert.equal(hist.length, 2)
  assert.equal(hist[0].id, 'b0') // neuer
  assert.equal(hist[1].id, 'a0')
})
