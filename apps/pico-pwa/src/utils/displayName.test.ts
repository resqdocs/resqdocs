// Tests fuer den App-lokalen Anzeige-Namen-Fallback (#70). node:test, keine Vue-Abhaengigkeit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayName, humanize } from './displayName.ts'

test('title gewinnt vor label', () => {
  assert.equal(displayName({ title: 'Blutdruck', label: 'rr', id: 'x' }), 'Blutdruck')
})

test('label-Fallback, wenn kein title', () => {
  assert.equal(displayName({ label: 'RR', id: 'x' }), 'RR')
})

test('humanize(id) als letzter Fallback', () => {
  assert.equal(displayName({ id: 'vorerkrankungen' }), 'Vorerkrankungen')
})

test('resolver wird auf title/label angewandt (Platzhalter-Aufloesung)', () => {
  const up = (s: string) => s.toUpperCase()
  assert.equal(displayName({ label: 'rr' }, up), 'RR')
})

test('humanize: dashes/underscores -> Leerzeichen + Capitalize', () => {
  assert.equal(humanize('blut-druck_wert'), 'Blut druck wert')
})
