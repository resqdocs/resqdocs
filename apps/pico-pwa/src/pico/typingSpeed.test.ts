import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  speedFromDelay,
  delayFromSpeed,
  typingSpeedLabel,
  clampDelay,
  DELAY_MIN_MS,
  DELAY_MAX_MS,
  DELAY_STEP_MS,
  DELAY_DEFAULT_MS,
} from './typingSpeed.ts'
import { DEFAULT_SETTINGS } from '../storage/types.ts'

test('DER GEMELDETE FALL: weiter rechts ist jetzt schneller', () => {
  // Gemeldet zu 1.4.1: „schnell wenn der Slider auf 0 steht und langsam wenn er auf 100 steht".
  // Bei einem Regler mit der Aufschrift „Tippgeschwindigkeit" muss es genau andersherum sein.
  const ganzLinks = delayFromSpeed(DELAY_MIN_MS)
  const ganzRechts = delayFromSpeed(DELAY_MAX_MS)
  assert.equal(ganzLinks, DELAY_MAX_MS, 'links = groesste Verzoegerung = langsam')
  assert.equal(ganzRechts, DELAY_MIN_MS, 'rechts = kleinste Verzoegerung = schnell')
  assert.ok(ganzRechts < ganzLinks, 'nach rechts ziehen macht schneller')
})

test('die Abbildung ist ihre eigene Umkehrung - kein Wert driftet beim Hin- und Herrechnen', () => {
  // Wichtig, weil der Regler bei jedem Zeichnen liest und bei jedem Zug schreibt. Driftete die
  // Abbildung, wanderte die Einstellung bei blossem Ansehen der Seite.
  for (let ms = DELAY_MIN_MS; ms <= DELAY_MAX_MS; ms += DELAY_STEP_MS) {
    assert.equal(delayFromSpeed(speedFromDelay(ms)), ms, `Rueckrechnung bei ${ms} ms`)
  }
})

test('der Firmware-Default bleibt genau in der Mitte der Bedeutung', () => {
  assert.equal(typingSpeedLabel(DELAY_DEFAULT_MS), 'Normal', 'der Auslieferungszustand darf sich nicht wie eine Fehleinstellung lesen')
})

test('die Stufen decken den Reglerbereich vollstaendig ab', () => {
  // Vorher war „Langsam" ueber den Regler unerreichbar (Schwelle 90 bei einem Regler, der bei 70 endet).
  // Ganz rechts stand „Langsam" als Endbeschriftung, waehrend die Anzeige „Normal" meldete.
  assert.equal(typingSpeedLabel(DELAY_MIN_MS), 'Schnell')
  assert.equal(typingSpeedLabel(DELAY_MAX_MS), 'Langsam', 'das Ende des Reglers muss erreichbar sein')

  const stufen = new Set<string>()
  for (let ms = DELAY_MIN_MS; ms <= DELAY_MAX_MS; ms += DELAY_STEP_MS) stufen.add(typingSpeedLabel(ms))
  assert.deepEqual([...stufen].sort(), ['Langsam', 'Normal', 'Schnell'], 'jede Stufe ist erreichbar')
})

test('gespeicherte Werte ausserhalb des Reglerbereichs kippen die Anzeige nicht', () => {
  // Aeltere Einstellungen koennen bis 150 ms enthalten, der Regler geht nur 10-55. Ein Altwert von 150 darf keine
  // Reglerstellung ausserhalb der Skala und kein leeres Label erzeugen.
  assert.equal(clampDelay(150), DELAY_MAX_MS)
  assert.equal(typingSpeedLabel(150), 'Langsam')
  assert.equal(speedFromDelay(150), DELAY_MIN_MS, 'ein sehr langsamer Altwert steht ganz links')
  assert.equal(clampDelay(5), DELAY_MIN_MS)
})

test('unbrauchbare Eingaben fallen auf den Default zurueck statt NaN zu verbreiten', () => {
  assert.equal(clampDelay(Number.NaN), DELAY_DEFAULT_MS)
  assert.equal(typingSpeedLabel(Number.NaN), 'Normal')
})

// --- Die Kette bis zur Bridge ---------------------------------------------------------------------

test('an die Bridge geht die VERZOEGERUNG, nicht die Reglerstellung', async () => {
  // Diese Pruefung liest Quelltext statt Verhalten - unschoen, aber sie schliesst eine Luecke, die
  // sonst nur auf der Hardware auffiele: stellt jemand einen dieser Aufrufe versehentlich auf
  // speedFromDelay um, tippt die Bridge bei „Schnell\" plotzlich mit 70 ms. Beide Aufrufer nehmen
  // bewusst den GESPEICHERTEN Wert, weil ausschliesslich die Anzeige gespiegelt ist.
  const { readFile } = await import('node:fs/promises')
  const dir = import.meta.dirname

  const einsatz = await readFile(`${dir}/../components/rebuild/EinsatzView.vue`, 'utf8')
  const zeile = einsatz.split('\n').find((l) => l.includes('pico.typeText('))
  assert.ok(zeile, 'der Sendeaufruf im Einsatz muss auffindbar bleiben')
  assert.match(zeile, /typingDelayMs/, 'Einsatz: gespeicherte Verzoegerung senden')
  assert.doesNotMatch(zeile, /speedFromDelay/, 'niemals die Reglerstellung senden')

  // Der Testtext-Knopf schickte frueher gar kein delayMs und tippte deshalb immer mit dem
  // Firmware-Default 60 - ausgerechnet der Knopf, mit dem man die Einstellung ausprobiert.
  const device = await readFile(`${dir}/usePicoDevice.ts`, 'utf8')
  const ab = device.indexOf('async function sendTest')
  assert.ok(ab > 0, 'sendTest muss auffindbar bleiben')
  const block = device.slice(ab, device.indexOf('async function', ab + 10))
  assert.match(block, /delayMs:\s*storage\.settings\.typingDelayMs/, 'Testtext mit der eingestellten Geschwindigkeit')
})

test('Bereich 10-55 ms, Standard 45 ms liegt auf dem Reglerraster', () => {
  assert.equal(DELAY_MIN_MS, 10)
  const raster = new Set<number>()
  for (let pos = DELAY_MIN_MS; pos <= DELAY_MAX_MS; pos += DELAY_STEP_MS) raster.add(delayFromSpeed(pos))
  assert.ok(raster.has(10), 'ganz rechts = 10 ms')
  assert.equal(DELAY_MAX_MS, 55)
  assert.equal(DELAY_DEFAULT_MS, 45)
  assert.ok(raster.has(DELAY_DEFAULT_MS), 'Standard 45 ms einstellbar')
  assert.equal(DEFAULT_SETTINGS.typingDelayMs, DELAY_DEFAULT_MS, 'Auslieferungszustand = Standard des Reglers')
  assert.ok(raster.has(DELAY_MAX_MS), 'ganz links = langsamste Stufe')
  assert.equal((DELAY_MAX_MS - DELAY_MIN_MS) % DELAY_STEP_MS, 0, 'Bereich ist ein Vielfaches der Schrittweite')
})
