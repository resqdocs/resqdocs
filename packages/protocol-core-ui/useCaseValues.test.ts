import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useCaseValues } from './useCaseValues.ts'

// BEWAHREN: versehentliches Verlassen von ✎ (custom) darf getippten Freitext nicht loeschen.
// Der Text ruht als prevValue/prevText und kommt beim Zurueckschalten auf ✎ verbatim zurueck;
// er erscheint NIE in der Ausgabe (excluded bleibt excluded, confirmed nutzt den Standardwert).

test('Feld: getippter Freitext wird beim custom->excluded bewahrt (Ausgabe bleibt nicht erhoben)', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setCustom('a', 'Anamnese-Text')
  cv.set('a', { state: 'excluded' }) // versehentlicher Toggle-Tap
  assert.equal(cv.getPrevValue('a'), 'Anamnese-Text')
  assert.equal(cv.get('a').state, 'excluded') // Zustand/Ausgabe unveraendert
})

test('Feld: getippter Freitext wird beim custom->confirmed bewahrt (Pflichtfeld-Fall)', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setCustom('a', 'Text')
  cv.set('a', { state: 'confirmed' }) // required-Feld ueberspringt −, verwirft sonst hier
  assert.equal(cv.getPrevValue('a'), 'Text')
})

test('Feld: gemerkter Text ueberlebt excluded<->confirmed und wird bei ✎ wieder Live-Wert', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setCustom('a', 'Text')
  cv.set('a', { state: 'excluded' })
  cv.set('a', { state: 'confirmed' }) // weiter zykeln - darf prevValue NICHT verlieren
  assert.equal(cv.getPrevValue('a'), 'Text')
  cv.set('a', { state: 'custom', value: 'Text' }) // zurueckholen
  assert.equal(cv.get('a').state, 'custom')
  assert.equal(cv.getPrevValue('a'), '') // im Live-Zustand kein Ruhe-Puffer
})

test('Feld: leerer/whitespace custom-Text wird nicht gemerkt', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setCustom('a', '   ')
  cv.set('a', { state: 'excluded' })
  assert.equal(cv.getPrevValue('a'), '')
})

test('Funktion: getippter Freitext wird beim custom->excluded/confirmed bewahrt, Zeilen bleiben', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setRows('mp', [{ name: 'ASS' }])
  cv.setFunctionText('mp', 'freitext') // ✎
  cv.setFunctionStatus('mp', 'excluded') // versehentlicher Toggle-Tap
  assert.equal(cv.getFunctionPrevText('mp'), 'freitext')
  assert.deepEqual(cv.getRows('mp'), [{ name: 'ASS' }]) // Zeilen ueberleben ohnehin
  assert.equal(cv.getFunctionStatus('mp'), 'excluded')
})

test('Funktion: gemerkter Freitext ueberlebt excluded->confirmed', () => {
  const cv = useCaseValues()
  cv.reset()
  cv.setFunctionText('mp', 'freitext')
  cv.setFunctionStatus('mp', 'excluded')
  cv.setFunctionStatus('mp', 'confirmed')
  assert.equal(cv.getFunctionPrevText('mp'), 'freitext')
})
