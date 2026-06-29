import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countDeviations } from './deviations.ts'
import type { Container } from './model.ts'

test('Funktion: erfasste Daten = 1 Abweichung, leer = 0, kein Crash (kein children)', () => {
  const t: Container = { type: 'container', id: 'r', children: [{ type: 'function', id: 'mp', functionKind: 'medikamentenplan' }] }
  assert.equal(countDeviations(t, {}), 0) // keine Daten
  assert.equal(countDeviations(t, { mp: { state: 'function', rows: [] } }), 0)
  assert.equal(countDeviations(t, { mp: { state: 'function', rows: [{ name: '' }] } }), 0) // namelose Zeile zaehlt nicht (hasData)
  assert.equal(countDeviations(t, { mp: { state: 'function', rows: [{ name: 'ASS' }] } }), 1)
})

const tree: Container = {
  type: 'container',
  id: 'r',
  children: [
    { type: 'field', id: 'a' },
    { type: 'field', id: 'b' },
    { type: 'container', id: 'sub', excludable: true, children: [{ type: 'field', id: 'c' }] },
  ],
}

test('alle auf Standard -> 0', () => {
  assert.equal(countDeviations(tree, {}), 0)
})

test('custom + excluded Feld zaehlen je 1', () => {
  assert.equal(countDeviations(tree, { a: { state: 'custom', value: 'x' }, b: { state: 'excluded' } }), 2)
})

test('excluded Container = 1, dessen Kinder werden nicht mitgezaehlt', () => {
  assert.equal(countDeviations(tree, { sub: { state: 'excluded' }, c: { state: 'custom', value: 'x' } }), 1)
})

test('Abweichung im Sub-Container zaehlt nach oben durch', () => {
  assert.equal(countDeviations(tree, { c: { state: 'custom', value: 'x' } }), 1)
})
