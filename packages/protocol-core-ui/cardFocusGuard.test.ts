import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldCloseCard, tapIsPending } from './cardFocusGuard.ts'

test('Fokus verlaesst die Karte, nichts offen -> schliessen (das erwartete Normalverhalten)', () => {
  assert.equal(shouldCloseCard({ focusStaysInside: false }), true)
})

test('Fokus bleibt in der Karte -> nicht schliessen', () => {
  assert.equal(shouldCloseCard({ focusStaysInside: true }), false)
})

test('REGRESSION 1.4.0: offenes Teilen-Panel haelt die Karte offen, auch wenn der Fokus rausgeht', () => {
  // Der Fehler: TTL „1 Stunde" im nativen <select> waehlen gibt den Fokus nach draussen, closeEdit
  // setzte shareOpenId auf null, und das Panel verschwand samt Link, QR und Fehlermeldung.
  assert.equal(shouldCloseCard({ shareOpen: true, focusStaysInside: false }), false)
})

test('offene Loesch-Rueckfrage haelt die Karte offen', () => {
  assert.equal(shouldCloseCard({ pendingDelete: true, focusStaysInside: false }), false)
})

test('offenes Gross-Modal haelt die Karte offen', () => {
  assert.equal(shouldCloseCard({ expandOpen: true, focusStaysInside: false }), false)
})

test('mehrere offene Zustaende gleichzeitig halten die Karte offen', () => {
  assert.equal(shouldCloseCard({ pendingDelete: true, shareOpen: true, expandOpen: true, focusStaysInside: false }), false)
})

test('REGRESSION: Tippen in der Karte haelt sie offen, auch wenn der Fokus rausgeht', () => {
  // Der gemeldete Fall: Fokus im Textfeld, dann auf „Teilen" tippen. Beim focusout ist shareOpen noch
  // false (das Panel oeffnet erst der Klick DANACH) - nur der Tap-Stempel kann hier schuetzen.
  assert.equal(shouldCloseCard({ tapPending: true, focusStaysInside: false }), false)
})

test('tapIsPending: innerhalb des Fensters ja, danach nein', () => {
  assert.equal(tapIsPending(1000, 1000), true, 'derselbe Moment')
  assert.equal(tapIsPending(1000, 1399), true, 'kurz danach')
  assert.equal(tapIsPending(1000, 1400), false, 'Fenster abgelaufen')
  assert.equal(tapIsPending(1000, 5000), false, 'lange danach')
})

test('tapIsPending: nie getippt oder Uhr laeuft rueckwaerts -> kein Schutz', () => {
  assert.equal(tapIsPending(0, 1000), false, 'nie getippt')
  assert.equal(tapIsPending(2000, 1000), false, 'negativer Abstand haelt die Karte nicht dauerhaft offen')
})

test('ohne Tap-Stempel schliesst die Karte weiterhin normal', () => {
  assert.equal(shouldCloseCard({ tapPending: false, focusStaysInside: false }), true)
})
