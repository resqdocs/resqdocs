// UNO Reverse: ein Feld oder Abschnitt startet im Einsatz auf „nicht erhoben" statt auf „bestaetigt".
//
// Gedacht fuer Felder und Abschnitte, die man nur in bestimmten Lagen braucht (z. B. ein
// neurologischer Befund). Die Vorlage bleibt vollstaendig - es aendert sich nur der Ausgangszustand
// im Einsatz, ganz im Sinne von „Weglassen ist reiner Einsatz-Zustand".
//
// Der Ausgangszustand wird NIE in den Werte-Store geschrieben: ein fehlender Eintrag bedeutet
// weiterhin „Standard", nur wird er jetzt knotenabhaengig aufgeloest.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Container, Field, FieldFill } from './model.ts'
import { defaultFill, isDefaultFill, fillValue, isFilled, multiSelected, DEFAULT_FILL, EXCLUDED_FILL } from './fill.ts'
import { countDeviations } from './deviations.ts'
import { render } from './render.ts' // render(root, values) - values ist das FLACHE Record<id, FieldFill>
import { isRequiredOpen, countOpenRequired } from './required.ts'

const feld = (over: Partial<Field> = {}): Field => ({ type: 'field', id: 'f', default: 'Wert', ...over })
const leer: Record<string, FieldFill> = {}

// --- Ausgangszustand ------------------------------------------------------------------------------

test('defaultFill: ohne Flag bestaetigt, mit Flag nicht erhoben', () => {
  assert.equal(defaultFill(feld()).state, 'confirmed')
  assert.equal(defaultFill(feld({ defaultExcluded: true })).state, 'excluded')
  assert.equal(defaultFill(undefined).state, 'confirmed', 'ohne Knoten der bisherige Standard')
  assert.equal(defaultFill(null).state, 'confirmed')
})

test('die Ausgangszustaende sind eingefroren (kein versehentliches Mutieren des Singletons)', () => {
  assert.equal(Object.isFrozen(DEFAULT_FILL), true)
  assert.equal(Object.isFrozen(EXCLUDED_FILL), true)
})

test('fillValue: UNO-Reverse-Feld liefert ohne Eintrag NICHTS statt des Standardwerts', () => {
  assert.equal(fillValue(feld()), 'Wert', 'normal: Standardwert')
  assert.equal(fillValue(feld({ defaultExcluded: true })), null, 'UNO Reverse: entfaellt')
})

test('fillValue: ein gesetzter Zustand gewinnt IMMER ueber den Ausgangszustand', () => {
  const f = feld({ defaultExcluded: true })
  assert.equal(fillValue(f, { state: 'confirmed' }), 'Wert', 'eingeschaltet -> Standardwert erscheint')
  assert.equal(fillValue(f, { state: 'custom', value: 'eigener Text' }), 'eigener Text')
})

// --- Ausgabe --------------------------------------------------------------------------------------

const baum = (over: Partial<Field> = {}): Container => ({
  type: 'container',
  id: 'wurzel',
  children: [feld({ id: 'davor', default: 'VORHER', showTitle: false }), feld({ id: 'f', ...over }), feld({ id: 'danach', default: 'NACHHER', showTitle: false })],
})

test('Ausgabe: UNO-Reverse-Feld erscheint nicht, der Rest bleibt unberuehrt', () => {
  const ohne = render(baum(), leer)
  const mit = render(baum({ defaultExcluded: true }), leer)
  assert.match(ohne, /Wert/)
  assert.doesNotMatch(mit, /Wert/, 'das Feld faellt aus der Ausgabe')
  assert.match(mit, /VORHER/)
  assert.match(mit, /NACHHER/)
})

test('Ausgabe: eingeschaltetes UNO-Reverse-Feld erscheint wieder', () => {
  const out = render(baum({ defaultExcluded: true }), { f: { state: 'confirmed' } })
  assert.match(out, /Wert/)
})

test('Ausgabe: UNO-Reverse-CONTAINER entfaellt samt Kindern und erscheint erst zugeschaltet', () => {
  const mitAbschnitt: Container = {
    type: 'container',
    id: 'wurzel',
    children: [
      feld({ id: 'davor', default: 'VORHER', showTitle: false }),
      {
        type: 'container',
        id: 'neuro',
        title: 'Neurologie',
        showTitle: true,
        excludable: true,
        defaultExcluded: true,
        heading: { prefix: '', suffix: ':', fill: '', width: 0, fillMode: 'inclusive' },
        children: [feld({ id: 'n1', default: 'Pupillen isokor', showTitle: false })],
      },
      feld({ id: 'danach', default: 'NACHHER', showTitle: false }),
    ],
  }
  const zu = render(mitAbschnitt, leer)
  assert.doesNotMatch(zu, /Neurologie/, 'auch die Ueberschrift entfaellt, nicht nur der Inhalt')
  assert.doesNotMatch(zu, /Pupillen/)
  assert.match(zu, /VORHER/)
  assert.match(zu, /NACHHER/)

  const auf = render(mitAbschnitt, { neuro: { state: 'confirmed' } })
  assert.match(auf, /Neurologie/)
  assert.match(auf, /Pupillen/)
})

// --- Abweichungszaehlung (die eigentliche Umkehr) -------------------------------------------------

test('Abweichung: UNO-Reverse-Feld im Ausgangszustand zaehlt 0, nicht 1', () => {
  // Sonst zeigte ein Protokoll mit zehn solchen Feldern zehn Abweichungen, ohne dass der Anwender
  // irgendetwas getan haette - der Zaehler waere wertlos.
  assert.equal(countDeviations(feld({ defaultExcluded: true }), leer), 0)
  assert.equal(countDeviations(feld(), leer), 0, 'normales Feld unveraendert')
})

test('Abweichung: EINSCHALTEN eines UNO-Reverse-Felds ist die Abweichung', () => {
  assert.equal(countDeviations(feld({ defaultExcluded: true }), { f: { state: 'confirmed' } }), 1)
  assert.equal(countDeviations(feld({ defaultExcluded: true }), { f: { state: 'custom', value: 'x' } }), 1)
})

test('Abweichung: normales Feld auf „nicht erhoben" zaehlt weiterhin 1', () => {
  assert.equal(countDeviations(feld(), { f: { state: 'excluded' } }), 1)
})

test('Abweichung: ausdrueckliches „nicht erhoben" auf einem UNO-Reverse-Feld zaehlt 0 (es ist der Standard)', () => {
  assert.equal(countDeviations(feld({ defaultExcluded: true }), { f: { state: 'excluded' } }), 0)
})

test('Abweichung: UNO-Reverse-Container im Ausgangszustand zaehlt 0, seine Kinder tragen nichts bei', () => {
  const c: Container = {
    type: 'container',
    id: 'neuro',
    excludable: true,
    defaultExcluded: true,
    children: [feld({ id: 'a' }), feld({ id: 'b' }), feld({ id: 'c' })],
  }
  assert.equal(countDeviations(c, leer), 0, 'unsichtbare Kinder koennen nicht abweichen')
  assert.equal(countDeviations(c, { neuro: { state: 'confirmed' } }), 1, 'zugeschaltet = eine bewusste Abweichung')
})

// --- Pflichtfeld ----------------------------------------------------------------------------------

test('required + defaultExcluded: der Editor verhindert die Kombination; die Laufzeit meldet defensiv „offen"', () => {
  // Beides gleichzeitig ist ein Widerspruch (ein Pflichtfeld darf nicht still entfallen). Kommt es
  // ueber eine fremde Vorlage doch herein, wird das Feld als OFFEN gemeldet statt still zu fehlen.
  const f = feld({ required: true, defaultExcluded: true })
  assert.equal(isRequiredOpen(f, undefined), true)
})

// --- Rueckwaertskompatibilitaet -------------------------------------------------------------------

test('ohne das Flag ist das Verhalten bitgleich zu vorher', () => {
  const f = feld()
  assert.deepEqual(defaultFill(f), DEFAULT_FILL)
  assert.equal(isDefaultFill(f, undefined), true)
  assert.equal(isDefaultFill(f, { state: 'excluded' }), false)
  assert.equal(fillValue(f, undefined), 'Wert')
})

test('isDefaultFill misst gegen den Ausgangszustand des KNOTENS, nicht gegen „confirmed"', () => {
  const uno = feld({ defaultExcluded: true })
  assert.equal(isDefaultFill(uno, { state: 'excluded' }), true)
  assert.equal(isDefaultFill(uno, { state: 'confirmed' }), false)
})

// --- Nachtrag aus dem Annahmen-Sweep --------------------------------------------------------------

test('REGRESSION: „ein, aendern, wieder aus" zaehlt 0 Abweichungen, nicht 1', () => {
  // Der erste Anlauf pruefte auf einen FEHLENDEN Eintrag. toggleExcluded schreibt beim Ausschalten
  // aber immer einen expliziten Eintrag - nach einmal Ein und Aus griff die Regel nie mehr, und der
  // Zaehler rekursierte in die unsichtbaren Kinder.
  const c: Container = {
    type: 'container',
    id: 'neuro',
    excludable: true,
    defaultExcluded: true,
    children: [feld({ id: 'n1' }), feld({ id: 'n2' })],
  }
  const nachAusschalten = { neuro: { state: 'excluded' } as FieldFill, n1: { state: 'custom', value: 'x' } as FieldFill }
  assert.equal(countDeviations(c, nachAusschalten), 0, 'der Abschnitt ist unsichtbar - seine Kinder koennen nicht abweichen')
  assert.equal(render({ type: 'container', id: 'root', children: [c] }, nachAusschalten).includes('x'), false, 'und er steht auch nicht in der Ausgabe')
})

test('REGRESSION: Pflichtfeld in einem UNO-Abschnitt zaehlt nicht als offen, solange der Abschnitt aus ist', () => {
  // Der Zaehler widersprach der Ausgabe: das Feld stand nirgends, wurde aber als offen gemeldet -
  // und der Sprung-Button fand es nicht, weil der ausgeblendete Zweig gar keine Kinder rendert.
  // WICHTIG fuer den Test: das Pflicht-Kind darf KEINEN Standardwert haben, sonst gilt es ohnehin
  // als erfuellt und der Fehler bliebe unsichtbar.
  const t: Container = {
    type: 'container',
    id: 'root',
    children: [
      {
        type: 'container',
        id: 'neuro',
        excludable: true,
        defaultExcluded: true,
        children: [{ type: 'field', id: 'n1', required: true, default: '' }],
      },
    ],
  }
  assert.equal(countOpenRequired(t, {}), 0, 'unsichtbares Pflichtfeld ist nicht offen')
  assert.equal(render(t, {}).includes('n1'), false)
  // Gegenprobe: eingeschaltet zaehlt es sehr wohl.
  assert.equal(countOpenRequired(t, { neuro: { state: 'confirmed' } }), 1)
})

test('isFilled und multiSelected loesen den Ausgangszustand ebenfalls knotenabhaengig auf', () => {
  const uno = feld({ defaultExcluded: true, options: ['a', 'b'], multiple: true })
  assert.equal(isFilled(uno), false, 'ohne Eintrag ist ein UNO-Feld nicht erfuellt')
  assert.deepEqual(multiSelected(uno), [], 'und es hat nichts ausgewaehlt')
  assert.equal(isFilled(feld()), true, 'normales Feld unveraendert')
})
