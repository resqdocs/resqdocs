// Quell-Guard für useDisclaimer (Hinweis beim Start).
//
// Kein Laufzeit-Import (Vue-/Capacitor-/Vite-define-Abhängigkeiten), sondern
// Prüfung der Quelle auf die invarianten Eigenschaften des Hinweises:
//   - Persistenz NUR über den preferencesAdapter (kein roher Browser-Storage),
//   - genau EIN Preferences-Key,
//   - Wiedervorlage gebunden an die Textversion (nicht an die Build-Kennung),
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

test('erneut nur bei geändertem Text: gespeichert und verglichen wird die Textversion, nicht die Build-Kennung', () => {
  assert.match(src, /export const DISCLAIMER_TEXT_VERSION = '[^']+'/)
  assert.doesNotMatch(src, /__APP_BUILD_ID__/, 'ein neuer Build mit gleichem Text darf nicht erneut fragen')
  assert.match(src, /needsAck\.value = acknowledged !== DISCLAIMER_TEXT_VERSION/)
  assert.match(src, /preferencesAdapter\.set\(DISCLAIMER_ACK_KEY, DISCLAIMER_TEXT_VERSION\)/)
})

test('bisherige Nutzer sehen den neuen Text einmal: der Schlüssel bleibt, die alte Build-Kennung gleicht keiner Textversion', () => {
  // Dort steht bisher „<Version>+<ISO-Zeit>“. Eine Textversion mit „+“ könnte mit einer alten Build-Kennung
  // übereinstimmen und den neuen Text überspringen.
  assert.match(src, /DISCLAIMER_ACK_KEY = 'disclaimer\.acknowledgedBuild'/)
  const version = src.match(/DISCLAIMER_TEXT_VERSION = '([^']+)'/)![1]
  assert.doesNotMatch(version, /^\d+\.\d+\.\d+\+/)
})

test('zum Lesen öffnen sperrt nicht: eigener Zustand reading, show/close ändern needsAck nicht', () => {
  const show = src.slice(src.indexOf('function show'), src.indexOf('void init()'))
  assert.match(show, /reading\.value = true/)
  assert.match(show, /reading\.value = false/)
  assert.doesNotMatch(show, /needsAck/)
})

test('greift NICHT direkt auf rohen Browser-Storage zu', () => {
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/)
})

test('schreibt keine console-Ausgaben (kein Logging)', () => {
  assert.doesNotMatch(src, /console\./)
})
