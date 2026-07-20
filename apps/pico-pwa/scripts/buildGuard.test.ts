// node --test --experimental-strip-types
// GAP 4: Unit-Tests für den Bundle-Frische-Guard. hashWebSources-Determinismus + die reine
// evaluateFreshness-Logik (Versions-Abweichung UND veraltetes Bundle -> Problem). Der Gradle-/Xcode-Anker
// selbst ist Mac-only und hier nicht ausführbar; die Skript-/Hash-Logik ist es.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashWebSources } from '../../../scripts/web-source-hash.mjs'
import { evaluateFreshness } from './check-bundle-fresh.mjs'

test('hashWebSources ist deterministisch + 64-hex sha256', () => {
  const a = hashWebSources()
  const b = hashWebSources()
  assert.equal(a, b, 'zwei Aufrufe müssen denselben Hash liefern')
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('evaluateFreshness: frisch + versionskonsistent -> keine Probleme', () => {
  const h = hashWebSources()
  const problems = evaluateFreshness({ info: { versionName: '1.2.2', srcHash: h }, nativeVersion: '1.2.2', freshHash: h })
  assert.deepEqual(problems, [])
})

test('evaluateFreshness: Versions-Abweichung (der 1.2.1-Fall) -> Problem', () => {
  const h = hashWebSources()
  const problems = evaluateFreshness({ info: { versionName: '1.2.0', srcHash: h }, nativeVersion: '1.2.1', freshHash: h })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /Versions-Abweichung/)
})

test('evaluateFreshness: gleich-nummeriertes, VERALTETES Bundle -> Problem', () => {
  const problems = evaluateFreshness({ info: { versionName: '1.2.2', srcHash: 'alter-hash' }, nativeVersion: '1.2.2', freshHash: 'neuer-hash' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /VERALTET/)
})

test('evaluateFreshness: fehlende build-info -> Problem', () => {
  const problems = evaluateFreshness({ info: null, nativeVersion: '1.2.2', freshHash: 'x' })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /fehlt/)
})

test('evaluateFreshness: beide Fehler gleichzeitig -> zwei Probleme', () => {
  const problems = evaluateFreshness({ info: { versionName: '1.2.0', srcHash: 'alt' }, nativeVersion: '1.2.2', freshHash: 'neu' })
  assert.equal(problems.length, 2)
})
