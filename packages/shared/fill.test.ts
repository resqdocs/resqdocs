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

// --- Multi-Select ---------------------------------------------------------------------------------
import { joinFieldValues, toggleMultiOption, multiSelected, multiFill, defaultOptionValue, multiSeparatorOf } from './fill.ts'

const multiField: Field = {
  type: 'field', id: 'm', multiple: true,
  options: ['Beidseits belüftet', 'Giemen', 'feinblasige RGs', 'Brummen'],
  exclusiveOptions: ['Beidseits belüftet'],
  default: 'Beidseits belüftet',
}

test('joinFieldValues: deutsche Aufzählung (Komma + „und")', () => {
  assert.equal(joinFieldValues([]), '')
  assert.equal(joinFieldValues(['a']), 'a')
  assert.equal(joinFieldValues(['a', 'b']), 'a und b')
  assert.equal(joinFieldValues(['a', 'b', 'c']), 'a, b und c')
  assert.equal(joinFieldValues(['a', '', 'c']), 'a und c') // leere raus
})

test('joinFieldValues: eigener Trenner statt Aufzählung', () => {
  assert.equal(joinFieldValues(['a', 'b', 'c'], '; '), 'a; b; c')
  assert.equal(joinFieldValues(['a', 'b'], ', '), 'a, b')
  assert.equal(joinFieldValues(['a'], '; '), 'a')
  assert.equal(joinFieldValues(['a', '', 'c'], ' / '), 'a / c')
  assert.equal(joinFieldValues(['a', 'b'], ''), 'a und b', 'leerer Trenner = Aufzählung')
})

test('multiSeparatorOf: fehlend, leer oder kein Text = Aufzählung; Zeilenumbruch wird Leerzeichen', () => {
  assert.equal(multiSeparatorOf({}), undefined)
  assert.equal(multiSeparatorOf({ multiSeparator: '' }), undefined)
  assert.equal(multiSeparatorOf({ multiSeparator: 5 as unknown as string }), undefined)
  assert.equal(multiSeparatorOf({ multiSeparator: '; ' }), '; ')
  assert.equal(multiSeparatorOf({ multiSeparator: ',\n' }), ', ')
})

test('multiFill: Trenner aus der Vorlage, Auswahl und „individuell“ folgen ihm', () => {
  const f: Field = { ...multiField, exclusiveOptions: [], multiSeparator: '; ' }
  const fill = multiFill(f, ['Giemen', 'Brummen', 'feinblasige RGs'])
  assert.deepEqual(fill, { state: 'custom', value: 'Giemen; feinblasige RGs; Brummen', values: ['Giemen', 'feinblasige RGs', 'Brummen'] })
  assert.equal(individuellPrefill(f, fill), 'Giemen; feinblasige RGs; Brummen')
  // ohne Eigenschaft unverändert die Aufzählung
  assert.equal((multiFill({ ...f, multiSeparator: undefined }, ['Giemen', 'Brummen']) as { value: string }).value, 'Giemen und Brummen')
})

test('toggleMultiOption: hinzufügen/entfernen + options-Reihenfolge', () => {
  const a = toggleMultiOption([], 'Giemen', multiField)
  assert.deepEqual(a, ['Giemen'])
  const b = toggleMultiOption(a, 'feinblasige RGs', multiField)
  assert.deepEqual(b, ['Giemen', 'feinblasige RGs']) // options-Reihenfolge
  const c = toggleMultiOption(b, 'Giemen', multiField)
  assert.deepEqual(c, ['feinblasige RGs']) // entfernt
})

test('toggleMultiOption: exklusive Option („Keine/Normal") verdrängt alles und umgekehrt', () => {
  // exklusive Option wählen -> alle anderen raus
  assert.deepEqual(toggleMultiOption(['Giemen', 'Brummen'], 'Beidseits belüftet', multiField), ['Beidseits belüftet'])
  // eine NICHT-exklusive dazu -> die exklusive fliegt raus
  assert.deepEqual(toggleMultiOption(['Beidseits belüftet'], 'Giemen', multiField), ['Giemen'])
})

test('multiFill: Status steckt in der Auswahl (leer=excluded, Standard-Menge=confirmed, sonst=custom+values)', () => {
  assert.deepEqual(multiFill(multiField, []), { state: 'excluded' })
  assert.deepEqual(multiFill(multiField, ['Beidseits belüftet']), { state: 'confirmed' }) // = Default -> nie materialisiert
  assert.deepEqual(multiFill(multiField, ['Giemen', 'feinblasige RGs']), {
    state: 'custom', value: 'Giemen und feinblasige RGs', values: ['Giemen', 'feinblasige RGs'],
  })
})

test('multiSelected: Auswahl aus dem Fill lesen (inkl. Rückwärts-Kompat: custom ohne values)', () => {
  assert.deepEqual(multiSelected(multiField, { state: 'excluded' }), [])
  assert.deepEqual(multiSelected(multiField, { state: 'confirmed' }), ['Beidseits belüftet'])
  assert.deepEqual(multiSelected(multiField, { state: 'custom', value: 'Giemen und Brummen', values: ['Giemen', 'Brummen'] }), ['Giemen', 'Brummen'])
  // VORWÄRTS/RÜCKWÄRTS-KOMPAT: alte/Single-Daten (custom OHNE values) -> [value], kein Absturz
  assert.deepEqual(multiSelected(multiField, { state: 'custom', value: 'Giemen' }), ['Giemen'])
})

test('KOMPAT: fillValue liest custom.value auch bei Multi (value = Fliesstext) — alte Apps bekommen korrekten Text', () => {
  const f = multiFill(multiField, ['Giemen', 'feinblasige RGs'])
  assert.equal(fillValue(multiField, f), 'Giemen und feinblasige RGs') // eine ALTE App liest nur .value -> stimmt
  assert.equal(defaultOptionValue(multiField), 'Beidseits belüftet')
})

test('multiFill: erzwingt Exklusiv-Regel final (auch bei exklusivem Namen via Freitext)', () => {
  // Auswahl enthaelt Pathologien + die exklusive Option (z. B. via Freitext eingeschmuggelt) -> exklusive gewinnt
  assert.deepEqual(multiFill(multiField, ['Giemen', 'Brummen', 'Beidseits belüftet']), { state: 'confirmed' })
  // mehrere Nicht-Exklusive bleiben nebeneinander
  assert.deepEqual(multiFill(multiField, ['Giemen', 'Brummen']), {
    state: 'custom', value: 'Giemen und Brummen', values: ['Giemen', 'Brummen'],
  })
})

test('orderByOptions/multiFill: doppelte Options-Strings verdoppeln die Ausgabe NICHT (Dedup wie Single)', () => {
  const dupField: Field = { type: 'field', id: 'd', multiple: true, options: ['A', 'A', 'B'] }
  assert.deepEqual(toggleMultiOption(['A'], 'B', dupField), ['A', 'B']) // kein 'A','A'
  assert.deepEqual(multiFill(dupField, ['A', 'A', 'B']), { state: 'custom', value: 'A und B', values: ['A', 'B'] })
})

// --- ✎ „individuell" startet mit der aktuellen Auswahl -------------------------------------------
import { individuellPrefill } from './fill.ts'

const abdomen: Field = { type: 'field', id: 'abd', multiple: true, allowCustom: true, options: ['unauffällig', 'Abwehrspannung', 'Druckschmerz'] }
const lage: Field = { type: 'field', id: 'lage', allowCustom: true, options: ['sitzend', 'liegend'], default: 'liegend' }

test('individuellPrefill Mehrfachauswahl: der ✎-Text startet mit der verketteten Auswahl', () => {
  assert.equal(individuellPrefill(abdomen, undefined), 'unauffällig') // confirmed = Standard-Option
  assert.equal(individuellPrefill(abdomen, multiFill(abdomen, ['Druckschmerz'])), 'Druckschmerz')
  assert.equal(individuellPrefill(abdomen, multiFill(abdomen, ['Druckschmerz', 'Abwehrspannung'])), 'Abwehrspannung und Druckschmerz')
})

test('individuellPrefill Einfachauswahl: Standard-Option bzw. gewaehlte Option', () => {
  assert.equal(individuellPrefill(lage, undefined), 'liegend')
  assert.equal(individuellPrefill(lage, { state: 'custom', value: 'sitzend' }), 'sitzend')
})

test('individuellPrefill: der Wechsel auf ✎ aendert die Ausgabe nicht', () => {
  for (const fill of [undefined, multiFill(abdomen, ['Druckschmerz']), multiFill(abdomen, ['Abwehrspannung', 'Druckschmerz'])]) {
    const text = individuellPrefill(abdomen, fill)
    assert.equal(fillValue(abdomen, { state: 'custom', value: text }), fillValue(abdomen, fill))
  }
})

test('individuellPrefill: eigener und gemerkter Text gehen vor, getippter Text geht nie verloren', () => {
  assert.equal(individuellPrefill(abdomen, { state: 'custom', value: 'Narbe rechts' }), 'Narbe rechts')
  assert.equal(individuellPrefill(abdomen, { state: 'confirmed', prevValue: 'Narbe rechts' }, 'Narbe rechts'), 'Narbe rechts')
})

test('individuellPrefill: ohne Auswahl bleibt der ✎-Text leer', () => {
  assert.equal(individuellPrefill(abdomen, { state: 'excluded' }), '')
  assert.equal(individuellPrefill({ ...abdomen, defaultEmpty: true }, undefined), '')
})
