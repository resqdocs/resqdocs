import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRequiredOpen, isFunctionFilled, countOpenRequired } from './required.ts'
import type { Container, Field, FunctionNode } from './model.ts'

// --- Field: required + „erfuellt" ---
test('Feld ohne required ist nie offen', () => {
  const f: Field = { type: 'field', id: 'a' }
  assert.equal(isRequiredOpen(f, undefined), false)
  assert.equal(isRequiredOpen(f, { state: 'excluded' }), false)
})

test('Pflicht-Freitext: leer/confirmed-ohne-Default = offen, mit Default/Custom = erfuellt', () => {
  const empty: Field = { type: 'field', id: 'a', required: true }
  assert.equal(isRequiredOpen(empty, undefined), true) // confirmed, kein Default -> offen
  assert.equal(isRequiredOpen(empty, { state: 'confirmed' }), true)
  assert.equal(isRequiredOpen(empty, { state: 'custom', value: '' }), true) // ✎ leer -> offen
  assert.equal(isRequiredOpen(empty, { state: 'custom', value: '   ' }), true) // nur Whitespace -> offen
  assert.equal(isRequiredOpen(empty, { state: 'custom', value: 'Text' }), false)

  const withDefault: Field = { type: 'field', id: 'a', required: true, default: 'Standard' }
  assert.equal(isRequiredOpen(withDefault, undefined), false) // Standardwert zaehlt als erfuellt
  assert.equal(isRequiredOpen(withDefault, { state: 'confirmed' }), false)
})

test('Pflicht-Select: confirmed liefert immer eine Option -> erfuellt; ✎ leer -> offen', () => {
  const sel: Field = { type: 'field', id: 's', required: true, options: ['A', 'B'], allowCustom: true }
  assert.equal(isRequiredOpen(sel, undefined), false) // confirmed = options[0]
  assert.equal(isRequiredOpen(sel, { state: 'custom', value: '' }), true) // individuell leer -> offen
  assert.equal(isRequiredOpen(sel, { state: 'custom', value: 'eigen' }), false)
})

test('Pflicht: excluded-Altzustand gilt als offen (nicht still erfuellt)', () => {
  const f: Field = { type: 'field', id: 'a', required: true, default: 'x' }
  assert.equal(isRequiredOpen(f, { state: 'excluded' }), true) // excluded liefert null -> nicht erfuellt
})

// --- Funktion: required + „erfuellt" ---
test('isFunctionFilled: Zeilen ODER Freitext ODER Standardtext', () => {
  const mp: FunctionNode = { type: 'function', id: 'mp', functionKind: 'medikamentenplan' }
  assert.equal(isFunctionFilled(mp, undefined), false)
  assert.equal(isFunctionFilled(mp, { state: 'function', rows: [] }), false)
  assert.equal(isFunctionFilled(mp, { state: 'function', rows: [{ name: 'ASS' }] }), true) // Zeilen
  assert.equal(isFunctionFilled(mp, { state: 'function', rows: [], status: 'custom', text: 'frei' }), true) // Freitext
  assert.equal(isFunctionFilled(mp, { state: 'function', rows: [], status: 'custom', text: '' }), false)
  assert.equal(isFunctionFilled(mp, { state: 'function', rows: [], status: 'excluded' }), false)

  const withDefault: FunctionNode = { type: 'function', id: 'mp', functionKind: 'medikamentenplan', default: 'keine' }
  assert.equal(isFunctionFilled(withDefault, undefined), true) // Standardtext-Fallback
})

test('Pflicht-Funktion offen, wenn ohne Daten/Freitext/Standardtext', () => {
  const mp: FunctionNode = { type: 'function', id: 'mp', functionKind: 'medikamentenplan', required: true }
  assert.equal(isRequiredOpen(mp, undefined), true)
  assert.equal(isRequiredOpen(mp, { state: 'function', rows: [{ name: 'ASS' }] }), false)
})

// --- Baum-Zaehler ---
const tree: Container = {
  type: 'container',
  id: 'r',
  children: [
    { type: 'field', id: 'a', required: true }, // offen (kein Default)
    { type: 'field', id: 'b' }, // kein Pflicht
    { type: 'field', id: 'c', required: true, default: 'x' }, // erfuellt
    { type: 'container', id: 'sub', excludable: true, children: [{ type: 'field', id: 'd', required: true }] },
  ],
}

test('countOpenRequired: nur offene Pflichtfelder, Default zaehlt als erfuellt', () => {
  assert.equal(countOpenRequired(tree, {}), 2) // a + d offen; c erfuellt (Default); b egal
  assert.equal(countOpenRequired(tree, { a: { state: 'custom', value: 'da' } }), 1) // a erfuellt -> nur d
})

test('countOpenRequired: „nicht erhoben"-Sektion zaehlt ihre Pflichtkinder nicht', () => {
  assert.equal(countOpenRequired(tree, { sub: { state: 'excluded' } }), 1) // d entfaellt -> nur a
})
