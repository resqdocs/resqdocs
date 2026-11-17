import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createContainer } from '@resqdocs/protocol-core/creator'
import { initialRows, toChoices } from './importPick.ts'

test('Startwerte: Sammlung ohne Vorauswahl, einzelne Vorlage gewählt; Name = Titel, nie überschreiben', () => {
  const a = createContainer('a'); a.title = ' Erste '
  const b = createContainer('b')
  assert.deepEqual(initialRows([a, b]), [
    { take: false, name: 'Erste', overwrite: false },
    { take: false, name: '', overwrite: false },
  ])
  assert.deepEqual(initialRows([a]), [{ take: true, name: 'Erste', overwrite: false }])
  assert.deepEqual(initialRows([a], ['zu neu']), [{ take: false, name: 'Erste', overwrite: false }])
})

test('nur gewählte Zeilen werden zu Entscheidungen, mit Name und Überschreiben', () => {
  const a = createContainer('a'); a.title = 'Erste'
  const b = createContainer('b'); b.title = 'Zweite'
  const c = toChoices([a, b], [{ take: false, name: 'x', overwrite: true }, { take: true, name: 'Neu', overwrite: true }])
  assert.equal(c.length, 1)
  assert.equal(c[0].tree, b)
  assert.equal(c[0].name, 'Neu')
  assert.equal(c[0].overwrite, true)
})
