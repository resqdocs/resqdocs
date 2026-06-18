// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveScannerMode, SCANNER_MODES, NATIVE_SCANNER_AVAILABLE, type ScannerMode } from './scannerMode.ts'

test('effectiveScannerMode: explizite WebView-Modi unveraendert', () => {
  assert.equal(effectiveScannerMode('webview_standard'), 'webview_standard')
  assert.equal(effectiveScannerMode('webview_optimized'), 'webview_optimized')
})

test('native_zxingcpp faellt ohne Verfuegbarkeit auf webview_optimized zurueck (Rueckweg)', () => {
  assert.equal(effectiveScannerMode('native_zxingcpp', false), 'webview_optimized')
  assert.equal(effectiveScannerMode('native_zxingcpp', true), 'native_zxingcpp')
})

test('Default-Konstante: nativ aktuell nicht verfuegbar -> native faellt auf webview_optimized', () => {
  assert.equal(NATIVE_SCANNER_AVAILABLE, false)
  assert.equal(effectiveScannerMode('native_zxingcpp'), 'webview_optimized')
})

test('Legacy/unbekannter Modus (z. B. das entfernte "auto") -> webview_standard', () => {
  assert.equal(effectiveScannerMode('auto' as unknown as ScannerMode), 'webview_standard')
})

test('SCANNER_MODES enthaelt die drei waehlbaren Modi (ohne entferntes auto)', () => {
  assert.deepEqual(SCANNER_MODES, ['webview_standard', 'webview_optimized', 'native_zxingcpp'])
})
