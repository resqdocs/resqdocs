// Läuft mit:  node --test --experimental-strip-types
// Testet die reine, Vue-freie Laufzeit-Logik + das Zusammenspiel mit dem echten Seed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  initVariableValues,
  initCaseState,
  toggleActiveBlock,
  isBlockActive,
} from './caseState.ts'
import { render } from '@resqdocs/protocol-core/renderer/render.mjs'

const seed = JSON.parse(
  readFileSync(new URL('../../../../protocols/standardprotokoll.json', import.meta.url)),
)

// Kleines Demo-Protokoll mit Variablen + optionalem Block (analog SCHEMA.md).
const demo = {
  schemaVersion: '0.1.0',
  id: 'demo',
  title: 'Demo',
  variables: [
    { id: 'geschlecht', type: 'select', grammar: 'de-gender', default: 'w',
      options: [{ value: 'w', label: 'weiblich' }, { value: 'm', label: 'männlich' }] },
    { id: 'raucher', type: 'boolean', default: false },
    { id: 'klinik', type: 'text' }, // ohne default
  ],
  blocks: [
    { id: 'az', title: 'AZ', points: [
      { type: 'finding', id: 'bewusstsein', normal: '{{patient}} ist wach' }] },
    { id: 'verweigerung', title: 'Mitfahrtverweigerung', optional: true, points: [
      { type: 'text', id: 'a', content: '{{patient}} wurde aufgeklärt.' }] },
  ],
}

test('initVariableValues übernimmt nur Defaults', () => {
  const vv = initVariableValues(demo)
  assert.deepEqual(vv, { geschlecht: 'w', raucher: false })
  assert.ok(!('klinik' in vv), 'Variable ohne default bleibt ungesetzt')
})

test('initCaseState: Defaults, leere values, keine aktiven Blöcke', () => {
  const cs = initCaseState(demo)
  assert.deepEqual(cs.variableValues, { geschlecht: 'w', raucher: false })
  assert.deepEqual(cs.values, {})
  assert.deepEqual(cs.activeBlocks, [])
})

test('Seed (Funktionsdemo) liefert die Variablen-Defaults', () => {
  assert.deepEqual(initCaseState(seed).variableValues, {
    geschlecht: 'w',
    alter: '',
    raucher: false,
    einsatzart: 'internistisch',
  })
})

test('toggleActiveBlock: an, aus, idempotent, unverändert', () => {
  assert.deepEqual(toggleActiveBlock([], 'x'), ['x'])
  assert.deepEqual(toggleActiveBlock(['x'], 'x'), [])
  assert.deepEqual(toggleActiveBlock(['x'], 'x', true), ['x'])
  assert.deepEqual(toggleActiveBlock([], 'x', false), [])
})

test('toggleActiveBlock mutiert die Eingabe-Liste nicht', () => {
  const before = ['a']
  const after = toggleActiveBlock(before, 'b', true)
  assert.deepEqual(before, ['a'])
  assert.deepEqual(after, ['a', 'b'])
})

test('isBlockActive', () => {
  const cs = initCaseState(demo)
  assert.equal(isBlockActive(cs, 'verweigerung'), false)
  cs.activeBlocks = toggleActiveBlock(cs.activeBlocks, 'verweigerung', true)
  assert.equal(isBlockActive(cs, 'verweigerung'), true)
})

test('Reset (= frischer initCaseState) stellt Defaults wieder her', () => {
  const cs = initCaseState(demo)
  cs.variableValues.geschlecht = 'm'
  cs.values.bewusstsein = { state: 'abnormal', value: 'somnolent' }
  cs.activeBlocks.push('verweigerung')
  const fresh = initCaseState(demo)
  assert.deepEqual(fresh.variableValues, { geschlecht: 'w', raucher: false })
  assert.deepEqual(fresh.values, {})
  assert.deepEqual(fresh.activeBlocks, [])
})

test('Render-Ausgabe mit echtem Seed', () => {
  const cs = initCaseState(seed)
  const out = render(seed, cs)
  assert.match(out, /^# Über diese Vorlage =+/)
  assert.ok(out.includes('# xABCDE '))
  assert.ok(out.includes('# Übergabe '))
})

test('Aktivierter optionaler Block taucht in der Ausgabe auf', () => {
  const cs = initCaseState(demo)
  assert.ok(!render(demo, cs).includes('# Mitfahrtverweigerung '))
  cs.activeBlocks = toggleActiveBlock(cs.activeBlocks, 'verweigerung', true)
  const out = render(demo, cs)
  assert.ok(out.includes('# Mitfahrtverweigerung '))
  // Variable default geschlecht=w ⇒ de-gender "Patientin"
  assert.ok(out.includes('Patientin wurde aufgeklärt.'))
})

test('Render mit caseState mutiert das Protokoll nicht', () => {
  const snapshot = JSON.stringify(demo)
  const cs = initCaseState(demo)
  cs.variableValues.geschlecht = 'm'
  cs.values.bewusstsein = 'somnolent'
  cs.activeBlocks = toggleActiveBlock(cs.activeBlocks, 'verweigerung', true)
  render(demo, cs)
  assert.equal(JSON.stringify(demo), snapshot)
})
