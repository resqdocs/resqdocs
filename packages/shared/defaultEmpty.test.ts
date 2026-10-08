// Laeuft mit:  node --test --experimental-strip-types
//
// Mehrfachauswahl „startet ohne Auswahl" (Feld.defaultEmpty). Anlass: Einsatzcodes - eine Vorauswahl
// der obersten Option wuerde einen falschen Code dokumentieren. Bewusste Entscheidung: OPTIONAL; in der Regel
// bleibt die oberste Option der Standard (Bestand), deshalb pruefen die ersten Tests den Bestand mit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Field, Container } from './model.ts'
import { multiSelected, multiFill, fillValue, isFilled, isDefaultFill, startsEmpty } from './fill.ts'
import { render } from './render.ts'
import { countDeviations } from './deviations.ts'
import { isRequiredOpen } from './required.ts'

const CODES = ['010: Bewusstlosigkeit', '011: ICB / SAB', '012: Kopfschmerzen']
const feld = (extra: Partial<Field> = {}): Field => ({ type: 'field', id: 'alarm', title: 'Alarmierung', options: CODES, multiple: true, ...extra })
const baum = (f: Field): Container => ({ type: 'container', id: 'root', children: [f] })

test('Bestand: ohne defaultEmpty ist die oberste Option vorausgewaehlt und leer = nicht erhoben', () => {
  const f = feld()
  assert.equal(startsEmpty(f), false)
  assert.deepEqual(multiSelected(f), ['010: Bewusstlosigkeit'])
  assert.equal(fillValue(f), '010: Bewusstlosigkeit')
  assert.deepEqual(multiFill(f, []), { state: 'excluded' })
  assert.deepEqual(multiFill(f, ['010: Bewusstlosigkeit']), { state: 'confirmed' })
})

test('defaultEmpty: nichts vorausgewaehlt, nichts in der Ausgabe', () => {
  const f = feld({ defaultEmpty: true })
  assert.deepEqual(multiSelected(f), [])
  assert.equal(fillValue(f), null)
  assert.equal(render(baum(f), {}), '')
  // auch mit eingeschaltetem Feldtitel keine leere „Alarmierung: "-Zeile
  assert.equal(render(baum(feld({ defaultEmpty: true, showTitle: true })), {}), '')
})

test('defaultEmpty: gewaehlte Codes erscheinen, die oberste ist dabei nichts Besonderes', () => {
  const f = feld({ defaultEmpty: true })
  const nurErster = multiFill(f, ['010: Bewusstlosigkeit'])
  assert.equal(nurErster.state, 'custom', 'auch die oberste Option ist eine bewusste Auswahl')
  const zwei = multiFill(f, ['012: Kopfschmerzen', '010: Bewusstlosigkeit'])
  assert.equal(render(baum(f), { alarm: zwei }), '010: Bewusstlosigkeit und 012: Kopfschmerzen')
})

test('defaultEmpty: alles wieder abgewaehlt = Ausgangszustand (✓), nicht „nicht erhoben"', () => {
  const f = feld({ defaultEmpty: true })
  const leer = multiFill(f, [])
  assert.deepEqual(leer, { state: 'confirmed' })
  assert.equal(isDefaultFill(f, leer), true)
  assert.equal(countDeviations(baum(f), { alarm: leer }), 0, 'kein „abweichend" ohne Auswahl')
  assert.equal(countDeviations(baum(f), { alarm: multiFill(f, ['011: ICB / SAB']) }), 1)
})

test('defaultEmpty + Pflichtfeld: bleibt „noch offen", bis gewaehlt wurde', () => {
  const f = feld({ defaultEmpty: true, required: true })
  assert.equal(isFilled(f), false)
  assert.equal(isRequiredOpen(f, undefined), true)
  assert.equal(isRequiredOpen(f, multiFill(f, ['011: ICB / SAB'])), false)
})

test('defaultEmpty + UNO Reverse: startet nicht erhoben, ✓ beginnt leer', () => {
  const f = feld({ defaultEmpty: true, defaultExcluded: true })
  assert.equal(fillValue(f), null)
  assert.deepEqual(multiSelected(f, { state: 'confirmed' }), [], '✓ ohne Vorauswahl')
})

test('defaultEmpty wirkt nur bei Mehrfachauswahl', () => {
  const einfach = feld({ defaultEmpty: true, multiple: undefined })
  assert.equal(startsEmpty(einfach), false)
  assert.equal(fillValue(einfach), '010: Bewusstlosigkeit', 'Einfachauswahl bleibt beim Bestand')
})
