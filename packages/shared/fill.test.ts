import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FILL, cycleFill, fillValue } from './fill.ts'
import type { Field } from './model.ts'

const field: Field = { type: 'field', id: 'f', default: 'Standard' }

test('cycleFill: confirmed -> custom(value=default) -> excluded -> confirmed', () => {
  const a = cycleFill(DEFAULT_FILL, 'Standard')
  assert.deepEqual(a, { state: 'custom', value: 'Standard' })
  const b = cycleFill(a, 'Standard')
  assert.deepEqual(b, { state: 'excluded' })
  const c = cycleFill(b, 'Standard')
  assert.deepEqual(c, { state: 'confirmed' })
})

test('cycleFill: Verlassen von custom verwirft den getippten Wert (by design)', () => {
  assert.deepEqual(cycleFill({ state: 'custom', value: 'getippt' }, 'Standard'), { state: 'excluded' })
})

test('fillValue: confirmed -> Standardwert (auch bei fehlendem Fill)', () => {
  assert.equal(fillValue(field, { state: 'confirmed' }), 'Standard')
  assert.equal(fillValue(field), 'Standard')
})

test('fillValue: custom -> getippter Wert', () => {
  assert.equal(fillValue(field, { state: 'custom', value: 'eigen' }), 'eigen')
})

test('fillValue: excluded -> null', () => {
  assert.equal(fillValue(field, { state: 'excluded' }), null)
})

test('fillValue: confirmed ohne Standardwert -> leer', () => {
  assert.equal(fillValue({ type: 'field', id: 'f' }, { state: 'confirmed' }), '')
})

test('fillValue: Select ohne default -> oberste Option', () => {
  assert.equal(fillValue({ type: 'field', id: 's', options: ['A', 'B', 'C'] }, { state: 'confirmed' }), 'A')
})

test('fillValue: Select mit default -> default; custom -> gewaehlte Option/Freitext', () => {
  const sel: Field = { type: 'field', id: 's', options: ['A', 'B'], default: 'B' }
  assert.equal(fillValue(sel, { state: 'confirmed' }), 'B')
  assert.equal(fillValue(sel, { state: 'custom', value: 'A' }), 'A')
  assert.equal(fillValue(sel, { state: 'custom', value: 'individuell xyz' }), 'individuell xyz')
})

test('fillValue: Select - default NICHT in options -> oberste Option', () => {
  assert.equal(fillValue({ type: 'field', id: 's', options: ['A', 'B'], default: 'Z' }, { state: 'confirmed' }), 'A')
})

test('fillValue: Select - leere Optionen ignoriert (oberste = erste nicht-leere)', () => {
  assert.equal(fillValue({ type: 'field', id: 's', options: ['', 'B'] }, { state: 'confirmed' }), 'B')
})
