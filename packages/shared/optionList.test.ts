// Laeuft mit:  node --test --experimental-strip-types
//
// „Liste einfuegen": viele Optionen auf einmal - ohne Bestehendes zu veraendern.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendOptions } from './optionList.ts'

test('eine Option pro Zeile, Leerzeilen fallen weg, Leerraum wird geglaettet', () => {
  const r = appendOptions([], '010: Bewusstlosigkeit\n\n  011: ICB / SAB  \r\n012:\tKopfschmerzen\n')
  assert.deepEqual(r.options, ['010: Bewusstlosigkeit', '011: ICB / SAB', '012: Kopfschmerzen'])
  assert.equal(r.added, 3)
  assert.equal(r.duplicates, 0)
})

test('bestehende Optionen bleiben in Reihenfolge erhalten, Neue kommen hinten dazu', () => {
  const r = appendOptions(['A', 'B'], 'C\nD')
  assert.deepEqual(r.options, ['A', 'B', 'C', 'D'])
})

test('schon Vorhandenes und Doppeltes im Eingefuegten wird nicht doppelt angelegt', () => {
  const r = appendOptions(['A', 'B'], 'B\nC\nC\nA')
  assert.deepEqual(r.options, ['A', 'B', 'C'])
  assert.equal(r.added, 1)
  assert.equal(r.duplicates, 3)
})

test('leere Platzhalter-Zeilen aus „Eintrag hinzufuegen" fallen weg', () => {
  const r = appendOptions(['A', '', 'B', ''], 'C')
  assert.deepEqual(r.options, ['A', 'B', 'C'])
})

test('nichts Brauchbares eingefuegt -> nichts angelegt', () => {
  const r = appendOptions(['A'], '\n   \n')
  assert.deepEqual(r.options, ['A'])
  assert.equal(r.added, 0)
})
