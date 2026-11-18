// Quell-Guard für useLongTextSize (Schriftgröße im großen Textfeld).
//
// Kein Laufzeit-Import (Vue-/Capacitor-Abhängigkeiten), sondern Prüfung der Quelle auf die invarianten
// Eigenschaften: Persistenz NUR über den preferencesAdapter, genau EIN Key, kein roher Browser-Storage,
// kein Netz, kein Logging - und nie speichern, bevor geladen wurde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('./useLongTextSize.ts', import.meta.url)), 'utf-8')

test('persistiert über den preferencesAdapter (gekapselte Storage-Schicht)', () => {
  assert.match(src, /from '@\/storage\/preferencesAdapter'/)
  assert.match(src, /preferencesAdapter\s*\.get\(/)
  assert.match(src, /preferencesAdapter\.set\(/)
})

test('nutzt genau einen Preferences-Key (LONG_TEXT_SIZE_KEY)', () => {
  const keyDefs = src.match(/=\s*'ui\.[^']+'/g) ?? []
  assert.equal(keyDefs.length, 1, 'es darf nur einen Key geben')
  assert.match(src, /LONG_TEXT_SIZE_KEY/)
})

test('unbekannte gespeicherte Werte laufen durch parseLongTextSize', () => {
  assert.match(src, /parseLongTextSize\(stored\)/)
})

test('speichert erst nach dem Laden (der Startwert überschreibt die gemerkte Stufe nicht)', () => {
  assert.match(src, /if \(loaded\) void preferencesAdapter\.set\(/)
})

test('greift NICHT direkt auf rohen Browser-Storage zu', () => {
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/)
})

test('kein Netz, kein Logging (kein fetch/console)', () => {
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|console\./)
})
