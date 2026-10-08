// Laeuft mit:  node --test --experimental-strip-types
//
// Gemeinsamer Such-Kern (#278). Medikamentensuche und Optionslisten leiten ihr Verhalten hieraus ab -
// die Bedeutung ist deshalb HIER festgenagelt, nicht in den Aufrufern.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchOptions, visibleOptions, wildcardRegExp, queryHead, meaningfulLength, OPTION_SEARCH_MIN } from './textSearch.ts'

const CODES = [
  '010: Bewusstlosigkeit',
  '012: Kopfschmerzen',
  '112: MRSA, ohne äußere Besiedlung',
  '120: Clostridium difficile-Infektion',
  '312: Beispiel mit 012 im Text',
  '860: Arbeitsunfall',
  '861: Ertrinkungsunfall, Pat. noch im Wasser',
  '940: Alarm über gesetzl. Notrufeinrichtung (z.B. eCall)',
]

test('leere Anfrage liefert alle Optionen in der Reihenfolge der Vorlage', () => {
  assert.deepEqual(searchOptions(CODES, ''), CODES)
  assert.deepEqual(searchOptions(CODES, '   '), CODES)
  assert.deepEqual(searchOptions(CODES, '**'), CODES, 'nur Platzhalter ist keine Suche')
})

test('die Nummer vom Pieper steht vorn: Anfangstreffer vor Teiltreffern', () => {
  // „012" beginnt nur einen Eintrag; „312: … 012 …" enthaelt die Zahl nur im Text.
  assert.deepEqual(searchOptions(CODES, '012'), ['012: Kopfschmerzen', '312: Beispiel mit 012 im Text'])
  // „12": Anfangstreffer (120) zuerst, dann die Teiltreffer in Vorlagen-Reihenfolge.
  assert.deepEqual(searchOptions(CODES, '12'), [
    '120: Clostridium difficile-Infektion',
    '012: Kopfschmerzen',
    '112: MRSA, ohne äußere Besiedlung',
    '312: Beispiel mit 012 im Text',
  ])
})

test('Teiltreffer im Text, Gross-/Kleinschreibung egal', () => {
  assert.deepEqual(searchOptions(CODES, 'kopf'), ['012: Kopfschmerzen'])
  assert.deepEqual(searchOptions(CODES, 'KOPF'), ['012: Kopfschmerzen'])
  assert.deepEqual(searchOptions(CODES, 'unfall'), ['860: Arbeitsunfall', '861: Ertrinkungsunfall, Pat. noch im Wasser'])
})

test('* und Leerraum stehen fuer beliebige Zeichen dazwischen', () => {
  assert.deepEqual(searchOptions(CODES, 'ertr*wasser'), ['861: Ertrinkungsunfall, Pat. noch im Wasser'])
  assert.deepEqual(searchOptions(CODES, 'ertr wasser'), ['861: Ertrinkungsunfall, Pat. noch im Wasser'])
  assert.deepEqual(searchOptions(CODES, 'wasser*ertr'), [], 'die Reihenfolge der Fragmente zaehlt')
})

test('Sonderzeichen werden woertlich gesucht (kein Regex-Einschleusen)', () => {
  assert.deepEqual(searchOptions(CODES, '(z.B.'), ['940: Alarm über gesetzl. Notrufeinrichtung (z.B. eCall)'])
  assert.equal(searchOptions(['axc'], 'a.c').length, 0, 'der Punkt ist literal')
})

test('Umlaute werden normal gefunden', () => {
  assert.deepEqual(searchOptions(CODES, 'äußere'), ['112: MRSA, ohne äußere Besiedlung'])
})

test('gleiche Semantik wie die Medikamentensuche (Infix + Platzhalter)', () => {
  const re = wildcardRegExp('me*for')!
  assert.ok(re.test('metformin'))
  assert.ok(!re.test('formic'), 'Reihenfolge muss stimmen')
  assert.ok(wildcardRegExp('for')!.test('metformin'), 'blosses Fragment findet die Wortmitte')
})

test('Hilfsfunktionen: Kopf-Fragment und bedeutungstragende Laenge', () => {
  assert.equal(queryHead('Meto 500'), 'meto')
  assert.equal(queryHead('*sartan'), '')
  assert.equal(meaningfulLength(' a * b '), 2)
  assert.equal(wildcardRegExp(''), null)
})

test('Mehrfachauswahl: gewaehlte Optionen bleiben oben sichtbar, auch wenn sie nicht zur Suche passen', () => {
  const chosen = new Set(['860: Arbeitsunfall', '012: Kopfschmerzen'])
  // Reihenfolge der Gewaehlten = Vorlage; darunter die Treffer ohne Doppelungen.
  assert.deepEqual(visibleOptions(CODES, 'kopf', chosen), ['012: Kopfschmerzen', '860: Arbeitsunfall'])
  assert.deepEqual(visibleOptions(CODES, 'wasser', chosen), [
    '012: Kopfschmerzen',
    '860: Arbeitsunfall',
    '861: Ertrinkungsunfall, Pat. noch im Wasser',
  ])
})

test('Einfachauswahl: nur die Treffer', () => {
  assert.deepEqual(visibleOptions(CODES, 'kopf'), ['012: Kopfschmerzen'])
})

test('Schwelle fuer das Suchfeld: ab 16 Optionen (Felder bis 15 bleiben unveraendert)', () => {
  assert.equal(OPTION_SEARCH_MIN, 16)
})
