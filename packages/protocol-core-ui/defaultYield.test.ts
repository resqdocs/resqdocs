// Tests fuer die Einstellung „Standardwert weicht" (Editor) und ihre Wirkung im Einsatz.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultYields, withDefaultYield, moveDefaultYield } from './defaultYield.ts'
import { toggleMultiOption, multiSelected, multiFill } from '../shared/fill.ts'
import type { Field } from '../shared/model.ts'

const NORMAL = 'Sinusrhythmus, keine ST-Hebungen, keine ST-Senkungen'
const ekg = (exclusiveOptions?: string[]): Field => ({
  type: 'field', id: 'ekg', title: 'EKG', multiple: true, default: NORMAL,
  options: [NORMAL, 'Vorhofflimmern', 'ST-Hebung V1-V4', 'AV-Block I°'], exclusiveOptions,
})

test('einschalten markiert die Standard-Option, ausschalten nimmt sie wieder heraus', () => {
  assert.equal(defaultYields(undefined, NORMAL), false)
  const an = withDefaultYield(undefined, NORMAL, true)
  assert.deepEqual(an, [NORMAL])
  assert.equal(defaultYields(an, NORMAL), true)
  assert.equal(withDefaultYield(an, NORMAL, false), undefined, 'leere Liste wird nicht in die Vorlage geschrieben')
})

test('andere „allein"-Optionen bleiben beim Umschalten erhalten', () => {
  assert.deepEqual(withDefaultYield(['nicht beurteilbar'], NORMAL, true), ['nicht beurteilbar', NORMAL])
  assert.deepEqual(withDefaultYield(['nicht beurteilbar', NORMAL], NORMAL, false), ['nicht beurteilbar'])
  assert.deepEqual(withDefaultYield([NORMAL], NORMAL, true), [NORMAL], 'kein doppelter Eintrag')
})

test('wechselt der Standardwert, wandert die Einstellung mit', () => {
  assert.deepEqual(moveDefaultYield([NORMAL], NORMAL, 'Vorhofflimmern'), ['Vorhofflimmern'])
  assert.deepEqual(moveDefaultYield(['nicht beurteilbar', NORMAL], NORMAL, 'Vorhofflimmern'), ['nicht beurteilbar', 'Vorhofflimmern'])
  assert.equal(moveDefaultYield(undefined, NORMAL, 'Vorhofflimmern'), undefined, 'war sie aus, bleibt sie aus')
  assert.deepEqual(moveDefaultYield(['nicht beurteilbar'], NORMAL, 'Vorhofflimmern'), ['nicht beurteilbar'])
})

test('ohne Standard-Option passiert nichts', () => {
  assert.equal(defaultYields(['x'], undefined), false)
  assert.deepEqual(withDefaultYield(['x'], undefined, true), ['x'])
})

test('Einsatz, Einstellung AN: die pauschale Aussage weicht der genaueren Angabe', () => {
  const f = ekg(withDefaultYield(undefined, NORMAL, true))
  const start = multiSelected(f)
  assert.deepEqual(start, [NORMAL], 'vorausgewaehlt ist der Standardwert')
  const eins = toggleMultiOption(start, 'Vorhofflimmern', f)
  assert.deepEqual(eins, ['Vorhofflimmern'])
  const zwei = toggleMultiOption(eins, 'AV-Block I°', f)
  assert.deepEqual(zwei, ['Vorhofflimmern', 'AV-Block I°'])
  assert.equal(multiFill(f, zwei).value, 'Vorhofflimmern und AV-Block I°')
  // Standardwert wieder waehlen: die genaueren Angaben verschwinden.
  assert.deepEqual(toggleMultiOption(zwei, NORMAL, f), [NORMAL])
  assert.deepEqual(multiFill(f, [NORMAL]), { state: 'confirmed' })
})

test('Einsatz, Einstellung AUS: wie bisher bleibt der Standardwert neben der weiteren Option stehen', () => {
  const f = ekg()
  const eins = toggleMultiOption(multiSelected(f), 'Vorhofflimmern', f)
  assert.deepEqual(eins, [NORMAL, 'Vorhofflimmern'])
})
