// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestStaerkeFromLabel } from './staerkeSuggestion.ts'

test('suggestStaerkeFromLabel: gaengige Formen', () => {
  assert.equal(suggestStaerkeFromLabel('Ibuflam 400 mg Filmtabletten'), '400 mg')
  assert.equal(suggestStaerkeFromLabel('Amoxi-Clav 500/125 mg'), '500/125 mg')
  assert.equal(suggestStaerkeFromLabel('Rivotril 1,5 mg/ml Tropfen'), '1,5 mg/ml')
  assert.equal(suggestStaerkeFromLabel('Clexane 40 mg/0,4 ml'), '40 mg/0,4 ml')
  assert.equal(suggestStaerkeFromLabel('Hydrocortison 2 % Creme'), '2 %')
})

test('suggestStaerkeFromLabel: konservativ bei Ambiguitaet/ohne Einheit', () => {
  assert.equal(suggestStaerkeFromLabel('Ibu 600'), null) // nackte Zahl ohne Einheit
  assert.equal(suggestStaerkeFromLabel('Vitamin B12 Depot'), null)
  assert.equal(suggestStaerkeFromLabel('Vigantol D3'), null)
  assert.equal(suggestStaerkeFromLabel('NaCl 0,9 % 500 ml'), null) // zwei Treffer -> ambig
  assert.equal(suggestStaerkeFromLabel('Fentanyl 12 µg/h Pflaster'), null) // Rate NIE verkuerzen
  assert.equal(suggestStaerkeFromLabel('Nitro 5 mg/24 h'), null) // Rate
  assert.equal(suggestStaerkeFromLabel('Insulin lispro Pen 3 ml'), null) // reines Volumen
  assert.equal(suggestStaerkeFromLabel(''), null)
  assert.equal(suggestStaerkeFromLabel('Aspirin'), null)
})
