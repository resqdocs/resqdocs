// Quell-Guard für useDisclaimer (Haftungsausschluss-Gate).
//
// Kein Laufzeit-Import (Vue-/Capacitor-/Vite-define-Abhängigkeiten), sondern
// Prüfung der Quelle auf die invarianten Eigenschaften des Gates:
//   - Persistenz NUR über den preferencesAdapter (kein roher Browser-Storage),
//   - genau EIN Preferences-Key,
//   - Wiedervorlage gebunden an die Build-Kennung __APP_BUILD_ID__,
//   - keine console-Ausgaben (kein Logging von Nutzungsdaten).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./useDisclaimer.ts', import.meta.url)), 'utf-8')

test('persistiert über den preferencesAdapter (gekapselte Storage-Schicht)', () => {
  assert.match(src, /from '@\/storage\/preferencesAdapter'/)
  assert.match(src, /preferencesAdapter\.(get|set)\(/)
})

test('nutzt genau einen Preferences-Key (DISCLAIMER_ACK_KEY)', () => {
  const keyDefs = src.match(/=\s*'disclaimer\.[^']+'/g) ?? []
  assert.equal(keyDefs.length, 1, 'es darf nur einen Disclaimer-Key geben')
  assert.match(src, /DISCLAIMER_ACK_KEY/)
})

test('bindet die Wiedervorlage an die Build-Kennung (__APP_BUILD_ID__)', () => {
  assert.match(src, /__APP_BUILD_ID__/)
})

test('greift NICHT direkt auf rohen Browser-Storage zu', () => {
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/)
})

test('schreibt keine console-Ausgaben (kein Logging)', () => {
  assert.doesNotMatch(src, /console\./)
})
