// Quell-Guard für useUsageNotice („Hinweis zur Nutzung").
//
// Kein Laufzeit-Import (Vue-/Capacitor-Abhängigkeiten), sondern Prüfung der Quelle
// auf die invarianten Eigenschaften: Persistenz NUR über den preferencesAdapter,
// genau EIN Key, kein roher Browser-Storage, kein Netz, kein Logging.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./useUsageNotice.ts', import.meta.url)), 'utf-8')

test('persistiert über den preferencesAdapter (gekapselte Storage-Schicht)', () => {
  assert.match(src, /from '@\/storage\/preferencesAdapter'/)
  assert.match(src, /preferencesAdapter\.(get|set)\(/)
})

test('nutzt genau einen Preferences-Key (USAGE_NOTICE_KEY)', () => {
  const keyDefs = src.match(/=\s*'usage\.[^']+'/g) ?? []
  assert.equal(keyDefs.length, 1, 'es darf nur einen Usage-Key geben')
  assert.match(src, /USAGE_NOTICE_KEY/)
})

test('greift NICHT direkt auf rohen Browser-Storage zu', () => {
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/)
})

test('kein Netz, kein Logging (kein fetch/console)', () => {
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|console\./)
})
