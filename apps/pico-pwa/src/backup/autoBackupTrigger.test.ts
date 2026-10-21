// node --test --experimental-strip-types
// Ausloeser der automatischen Sicherung: Faelligkeit nach „unveraendert" und eigene Screens (nativer Scanner).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoBackupDue, createOwnScreenGate } from './autoBackupTrigger.ts'

const T0 = 1_700_000_000_000
const DAY = 86_400_000

test('autoBackupDue: Aenderung macht immer faellig', () => {
  assert.equal(autoBackupDue({ dirty: true, lastSnapshotAt: T0, lastCheckAt: T0, intervalMs: DAY, now: T0 + 1 }), true)
  assert.equal(autoBackupDue({ dirty: true, lastSnapshotAt: T0, lastCheckAt: 0, intervalMs: null, now: T0 + 1 }), true)
})

test('autoBackupDue: ohne Aenderung erst nach dem Intervall', () => {
  assert.equal(autoBackupDue({ dirty: false, lastSnapshotAt: T0, lastCheckAt: 0, intervalMs: DAY, now: T0 + DAY - 1 }), false)
  assert.equal(autoBackupDue({ dirty: false, lastSnapshotAt: T0, lastCheckAt: 0, intervalMs: DAY, now: T0 + DAY }), true)
})

test('autoBackupDue: eine Pruefung mit „unveraendert" startet das Intervall neu', () => {
  // Letztes Backup vor 3 Tagen, vor einer Stunde geprueft: NICHT faellig. Frueher war es bei jedem Hintergrund faellig.
  const now = T0 + 3 * DAY
  assert.equal(autoBackupDue({ dirty: false, lastSnapshotAt: T0, lastCheckAt: now - 3_600_000, intervalMs: DAY, now }), false)
  assert.equal(autoBackupDue({ dirty: false, lastSnapshotAt: T0, lastCheckAt: now - DAY, intervalMs: DAY, now }), true)
})

test('autoBackupDue: nur manuell -> ohne Aenderung nie faellig', () => {
  assert.equal(autoBackupDue({ dirty: false, lastSnapshotAt: 0, lastCheckAt: 0, intervalMs: null, now: T0 }), false)
})

test('Gate: ohne eigenen Screen zaehlen Hintergrund und Vordergrund normal', () => {
  const g = createOwnScreenGate()
  assert.equal(g.isOpen(), false)
  assert.equal(g.background(), true)
  assert.equal(g.foreground(), true)
})

test('Gate: Scanner offen -> Hintergrund und die zugehoerige Rueckkehr loesen nichts aus', () => {
  const g = createOwnScreenGate()
  const release = g.hold()
  assert.equal(g.background(), false)
  // Android: Scan-Ergebnis kommt vor dem Vordergrund-Ereignis -> Screen schon freigegeben.
  release()
  assert.equal(g.isOpen(), false)
  assert.equal(g.foreground(), false)
  // Danach wieder normal: echter App-Wechsel sichert.
  assert.equal(g.background(), true)
  assert.equal(g.foreground(), true)
})

test('Gate: Vordergrund vor der Freigabe wird ebenfalls nur einmal verschluckt', () => {
  const g = createOwnScreenGate()
  const release = g.hold()
  assert.equal(g.background(), false)
  assert.equal(g.foreground(), false)
  release()
  assert.equal(g.foreground(), true)
})

test('Gate: Freigabe ist idempotent, mehrere Screens zaehlen getrennt', () => {
  const g = createOwnScreenGate()
  const a = g.hold()
  const b = g.hold()
  a()
  a()
  assert.equal(g.isOpen(), true)
  b()
  assert.equal(g.isOpen(), false)
})

test('Gate: Scanner ohne Hintergrund-Ereignis (iOS) verschluckt keinen spaeteren Vordergrund', () => {
  const g = createOwnScreenGate()
  g.hold()()
  assert.equal(g.foreground(), true)
})
