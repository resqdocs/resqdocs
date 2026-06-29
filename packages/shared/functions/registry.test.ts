// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FUNCTION_REGISTRY, formatMedikament, formatArzt } from './registry.ts'
import type { FieldFill, MedikamenteRow, ArztRow } from '../model.ts'

const def = FUNCTION_REGISTRY.medikamentenplan
const fill = (rows: MedikamenteRow[]): FieldFill => ({ state: 'function', rows })
const R: MedikamenteRow[] = [
  { name: 'ASS', dosierung: '1-0-0' },
  { name: 'Ramipril', dosierung: '1-0-1', kommentar: 'nüchtern' },
]

test('formatMedikament: Name [Dosierung] [(Kommentar)]', () => {
  assert.equal(formatMedikament({ name: 'ASS', dosierung: '1-0-0' }), 'ASS 1-0-0')
  assert.equal(formatMedikament({ name: 'X' }), 'X')
  assert.equal(formatMedikament({ name: 'Y', kommentar: 'k' }), 'Y (k)')
})

test('renderBody ohne Config -> untereinander (\\n-join, Regression)', () => {
  assert.equal(def.renderBody(fill(R)), 'ASS 1-0-0\nRamipril 1-0-1 (nüchtern)')
})

test('renderBody block + Praefix/Suffix je Zeile', () => {
  assert.equal(
    def.renderBody(fill(R), { rowLayout: 'block', rowPrefix: '- ', rowSuffix: ' ;' }),
    '- ASS 1-0-0 ;\n- Ramipril 1-0-1 (nüchtern) ;',
  )
})

test('renderBody inline + freier Trenner; ohne Trenner -> DEFAULT_SEPARATOR', () => {
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline', rowSeparator: ' | ' }), 'ASS 1-0-0 | Ramipril 1-0-1 (nüchtern)')
  assert.equal(def.renderBody(fill(R), { rowLayout: 'inline' }), 'ASS 1-0-0, Ramipril 1-0-1 (nüchtern)')
})

test('renderBody: namelose Zeilen gefiltert (beide Layouts); leer -> ""', () => {
  const r: MedikamenteRow[] = [{ name: '' }, { name: 'ASS' }, { name: '  ' }]
  assert.equal(def.renderBody(fill(r)), 'ASS')
  assert.equal(def.renderBody(fill(r), { rowLayout: 'inline' }), 'ASS')
  assert.equal(def.renderBody(fill([]), { rowLayout: 'block', rowPrefix: '- ' }), '')
})

// --- Funktion „Ärzte" ---
const aerzteDef = FUNCTION_REGISTRY.aerzte
const fillA = (rows: ArztRow[]): FieldFill => ({ state: 'function', rows })

test('formatArzt: Name [(Rolle)][, Ort, Tel. ..., Arztnr. ...]', () => {
  assert.equal(formatArzt({ name: 'Dr. Müller' }), 'Dr. Müller')
  assert.equal(formatArzt({ name: 'Dr. Müller', rolle: 'Hausarzt' }), 'Dr. Müller (Hausarzt)')
  assert.equal(formatArzt({ name: 'X', ort: 'Berlin' }), 'X, Berlin')
  assert.equal(
    formatArzt({ name: 'Dr. Müller', rolle: 'Facharzt', ort: 'Worms', telefon: '06247', arztnummer: '123456789' }),
    'Dr. Müller (Facharzt), Worms, Tel. 06247, Arztnr. 123456789',
  )
})

test('aerzte.renderBody: block (Default) + inline; namelose gefiltert; leer -> ""', () => {
  const A: ArztRow[] = [
    { name: 'Dr. A', rolle: 'Hausarzt' },
    { name: 'Dr. B', ort: 'Worms' },
  ]
  assert.equal(aerzteDef.renderBody(fillA(A)), 'Dr. A (Hausarzt)\nDr. B, Worms')
  assert.equal(aerzteDef.renderBody(fillA(A), { rowLayout: 'inline', rowSeparator: ' · ' }), 'Dr. A (Hausarzt) · Dr. B, Worms')
  assert.equal(aerzteDef.renderBody(fillA([{ name: '' }, { name: 'Dr. C' }])), 'Dr. C')
  assert.equal(aerzteDef.renderBody(fillA([])), '')
})

test('aerzte.hasData: nur bei mindestens einem benannten Arzt', () => {
  assert.equal(aerzteDef.hasData(fillA([{ name: 'Dr. A' }])), true)
  assert.equal(aerzteDef.hasData(fillA([{ name: '  ' }])), false)
  assert.equal(aerzteDef.hasData(undefined), false)
})
