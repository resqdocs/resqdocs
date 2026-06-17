// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveScannerMode, SCANNER_MODES, NATIVE_SCANNER_AVAILABLE } from './scannerMode.ts'

test('effectiveScannerMode: explizite WebView-Modi unveraendert', () => {
  assert.equal(effectiveScannerMode('webview_standard'), 'webview_standard')
  assert.equal(effectiveScannerMode('webview_optimized'), 'webview_optimized')
})

test('auto faellt auf webview_optimized zurueck, solange nativ NICHT verfuegbar', () => {
  assert.equal(effectiveScannerMode('auto', false), 'webview_optimized')
})

test('auto bevorzugt nativ, sobald verfuegbar (Zukunft)', () => {
  assert.equal(effectiveScannerMode('auto', true), 'native_zxingcpp')
})

test('native_zxingcpp faellt ohne Verfuegbarkeit auf webview_optimized zurueck (Rueckweg)', () => {
  assert.equal(effectiveScannerMode('native_zxingcpp', false), 'webview_optimized')
  assert.equal(effectiveScannerMode('native_zxingcpp', true), 'native_zxingcpp')
})

test('Default-Konstante: nativ aktuell nicht verfuegbar; native ist NIE als auto-Default aktiv', () => {
  assert.equal(NATIVE_SCANNER_AVAILABLE, false)
  assert.equal(effectiveScannerMode('auto'), 'webview_optimized')
})

test('SCANNER_MODES enthaelt alle vier Modi', () => {
  assert.deepEqual(SCANNER_MODES, ['auto', 'webview_standard', 'webview_optimized', 'native_zxingcpp'])
})
