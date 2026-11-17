// Tests für die Seite „Neu“ der Tour: nach JEDEM Update automatisch, Inhalt aus den Release-Notes
// (Grundregel Maintainer 2026-11-17: „So soll es immer funktionieren“).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { buildHistory, type ReleaseNote } from './releaseNotes.ts'
import { isReturningUser, tourHintId, whatsNewNotes, WHATS_NEW_COUNT } from './whatsNew.ts'

const note = (version: string): ReleaseNote => ({ version, summary: '', sections: [{ kind: 'neu', label: 'Neu', items: ['x'] }] })
const HISTORY = ['1.13.0', '1.12.0', '1.11.0', '1.10.0', '1.9.0'].map(note)

test('zeigt die letzten drei Versionen bis zur installierten, neueste zuerst', () => {
  assert.equal(WHATS_NEW_COUNT, 3)
  assert.deepEqual(whatsNewNotes(HISTORY, '1.12.0').map((n) => n.version), ['1.12.0', '1.11.0', '1.10.0'])
  assert.deepEqual(whatsNewNotes(HISTORY, '1.13.0').map((n) => n.version), ['1.13.0', '1.12.0', '1.11.0'])
})

test('Testbuild ohne eigene Notes zeigt die letzten veröffentlichten und behält deren Kennung', () => {
  const notes = whatsNewNotes(HISTORY.slice(1), '1.13.0')
  assert.equal(notes[0].version, '1.12.0')
  assert.equal(tourHintId(notes, 'fb'), 'tab-guide-1.12.0')
})

test('Kennung hängt an der neuesten gezeigten Version; ohne Notes greift der Rückfall', () => {
  assert.equal(tourHintId(whatsNewNotes(HISTORY, '1.13.0'), 'fb'), 'tab-guide-1.13.0')
  assert.equal(tourHintId([], 'tab-guide-v6'), 'tab-guide-v6')
})

test('neue Version = neue Kennung: wer die Tour zu einer früheren Version kannte, sieht zuerst „Neu“', () => {
  const current = 'tab-guide-1.13.0'
  assert.equal(isReturningUser(['tab-guide-1.12.0'], current), true)
  assert.equal(isReturningUser(['tab-guide-v6'], current), true, 'alte, von Hand gezählte Kennungen zählen mit')
  assert.equal(isReturningUser(['tab-guide-v2', 'tristate'], current), true)
  assert.equal(isReturningUser([current], current), false, 'nur die aktuelle Tour gesehen (z. B. über das ?-Symbol)')
  assert.equal(isReturningUser(['tristate'], current), false, 'Neuinstallation: keine Tour-Kennung')
})

test('echte Release-Notes: die App-Version bekommt ihre eigene Tour-Kennung und drei Versionen auf „Neu“', () => {
  const dir = new URL('../../../../release-notes/de/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(new URL(f, dir), 'utf8'))
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
  const notes = whatsNewNotes(buildHistory(files), pkg.version)
  assert.equal(tourHintId(notes, 'fb'), `tab-guide-${pkg.version}`, 'sonst erscheint die Tour nach dem Update nicht')
  assert.equal(notes.length, 3)
  for (const n of notes) assert.ok(n.sections.some((s) => s.items.length > 0), `${n.version}: keine Punkte für „Neu“`)
})
