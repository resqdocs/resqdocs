import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapState, needsAsking, nextAsking, clozeSummary } from './clozeFill.ts'
import type { Field, FunctionNode } from './model.ts'

const f = (extra: Partial<Field> = {}): Field => ({ type: 'field', id: 'f', ...extra })

test('gapState Feld: offen, Standardwert, beantwortet, nicht erhoben', () => {
  assert.equal(gapState(f(), undefined), 'open')
  assert.equal(gapState(f({ default: 'wach' }), undefined), 'default')
  assert.equal(gapState(f({ options: ['a', 'b'] }), undefined), 'default', 'Auswahl: die erste Option ist der Standardwert')
  assert.equal(gapState(f({ default: 'wach' }), { state: 'custom', value: 'müde' }), 'answered')
  assert.equal(gapState(f({ default: 'wach' }), { state: 'custom', value: '  ' }), 'open')
  assert.equal(gapState(f({ default: 'wach' }), { state: 'excluded' }), 'excluded')
  assert.equal(gapState(f({ default: 'wach', defaultExcluded: true }), undefined), 'excluded')
  assert.equal(gapState(f({ options: ['a'], multiple: true, defaultEmpty: true }), undefined), 'open', 'startet ohne Auswahl')
})

test('gapState Funktion: Standardtext, Freitext, nicht erhoben', () => {
  const med = (extra: Partial<FunctionNode> = {}): FunctionNode => ({ type: 'function', id: 'm', functionKind: 'medikamentenplan', ...extra })
  assert.equal(gapState(med(), undefined), 'open')
  assert.equal(gapState(med({ default: 'keine' }), undefined), 'default')
  assert.equal(gapState(med(), { state: 'function', rows: [], status: 'custom', text: 'ASS' }), 'answered')
  assert.equal(gapState(med(), { state: 'function', rows: [], status: 'excluded' }), 'excluded')
  assert.equal(gapState(med({ required: true }), { state: 'function', rows: [], status: 'excluded' }), 'open')
})

test('Durchtippen: offene immer, Standardwerte nur auf Wunsch, Gesehenes nicht noch einmal', () => {
  assert.equal(needsAsking('open', false, false), true)
  assert.equal(needsAsking('default', false, false), false)
  assert.equal(needsAsking('default', true, false), true)
  assert.equal(needsAsking('answered', true, false), false)
  assert.equal(needsAsking('excluded', true, false), false)
  assert.equal(needsAsking('open', true, true), false)
  const states = ['default', 'open', 'answered', 'default', 'open'] as const
  assert.equal(nextAsking(states, [], false, -1), 1)
  assert.equal(nextAsking(states, [], false, 1), 4)
  assert.equal(nextAsking(states, [], false, 4), -1)
  assert.equal(nextAsking(states, [], true, -1), 0)
  assert.equal(nextAsking(states, [true, true], true, -1), 3)
})

test('clozeSummary: Pflicht geht vor, Einzahl und Mehrzahl', () => {
  assert.equal(clozeSummary(0, 0, 0), 'Dieser Lückentext hat keine Lücken.')
  assert.equal(clozeSummary(3, 2, 1), '1 Pflicht-Lücke noch offen')
  assert.equal(clozeSummary(3, 2, 2), '2 Pflicht-Lücken noch offen')
  assert.equal(clozeSummary(3, 1, 0), '1 Lücke noch offen')
  assert.equal(clozeSummary(3, 2, 0), '2 Lücken noch offen')
  assert.equal(clozeSummary(3, 0, 0), 'Alle Lücken ausgefüllt')
})
