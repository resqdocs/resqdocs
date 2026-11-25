// Bruecke zum nativen Scanner: Optionen fuer das Plugin und Abbildung seiner Antwort, ohne das Plugin selbst.
// Haelt fest: Ohne Mehrfach-Optionen bleiben Aufruf und Ergebnis unveraendert; mit ihnen gehen Schalter,
// Texte und bekannte PZN an das Plugin, und jeder Code der Liste wird wie das Einzelergebnis dekodiert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPluginScanOptions, mapPluginResult, type ScannerTheme } from './nativeScanner.ts'
import { BMP_PROFILE, PACKAGE_PROFILE, QR_PROFILE } from './scanProfiles.ts'

const b64 = (latin1: string): string => Buffer.from(latin1, 'latin1').toString('base64')

const THEME: ScannerTheme = { base100: '#ffffff', base300: '#dddddd', baseContent: '#112233', primary: '#ff7a66', primaryContent: '#141b30' }

const MULTI = {
  on: true,
  toggleLabel: 'Mehrere Packungen',
  doneLabel: 'Fertig',
  countOne: '1 Packung erfasst',
  countMany: '{n} Packungen erfasst',
  duplicateLabel: 'Schon in der Liste',
  known: ['01234567', '07654321'],
}

test('Optionen ohne multi: genau die bisherigen Felder, kein Mehrfach-Feld', () => {
  const options = buildPluginScanOptions(PACKAGE_PROFILE, {}, THEME)
  assert.deepStrictEqual(options, {
    formats: PACKAGE_PROFILE.formats,
    decoder: PACKAGE_PROFILE.decoder,
    codeSizeMm: PACKAGE_PROFILE.codeSizeMm,
    startZoomDelayMs: 0,
    title: PACKAGE_PROFILE.title,
    hint: PACKAGE_PROFILE.hint,
    cancelLabel: 'Abbrechen',
    torchLabel: 'Licht',
    showDiagnostics: false,
    theme: THEME,
  })
  assert.deepStrictEqual(Object.keys(options), [
    'formats', 'decoder', 'codeSizeMm', 'startZoomDelayMs', 'title', 'hint', 'cancelLabel', 'torchLabel', 'showDiagnostics', 'theme',
  ])
})

test('Optionen ohne multi: Start-Zoom-Verzoegerung und Diagnose wie bisher', () => {
  const options = buildPluginScanOptions(BMP_PROFILE, { showDiagnostics: true }, undefined)
  assert.equal(options.startZoomDelayMs, BMP_PROFILE.startZoomDelayMs)
  assert.equal(options.showDiagnostics, true)
  assert.equal(options.theme, undefined)
  assert.equal('multi' in options, false)
})

test('Optionen mit multi: Anfangsstellung, Schalter-Beschriftung, Texte und bekannte PZN gehen an das Plugin', () => {
  const options = buildPluginScanOptions(PACKAGE_PROFILE, { multi: MULTI }, THEME)
  assert.equal(options.multi, true)
  assert.equal(options.multiToggleLabel, 'Mehrere Packungen')
  assert.equal(options.doneLabel, 'Fertig')
  assert.equal(options.countOne, '1 Packung erfasst')
  assert.equal(options.countMany, '{n} Packungen erfasst')
  assert.equal(options.duplicateLabel, 'Schon in der Liste')
  assert.deepStrictEqual(options.known, ['01234567', '07654321'])
  // Die bisherigen Felder bleiben daneben unveraendert.
  assert.equal(options.title, PACKAGE_PROFILE.title)
  assert.equal(options.cancelLabel, 'Abbrechen')
})

test('Optionen mit multi: Schalter aus wird als multi=false gesendet, der Schalter bleibt sichtbar', () => {
  const options = buildPluginScanOptions(PACKAGE_PROFILE, { multi: { ...MULTI, on: false, known: [] } }, THEME)
  assert.equal(options.multi, false)
  assert.equal(options.multiToggleLabel, 'Mehrere Packungen')
  assert.deepStrictEqual(options.known, [])
})

test('Ergebnis ohne items: genau die bisherige Form', () => {
  const outcome = mapPluginResult(
    { status: 'found', format: 'CODE_39', bytesBase64: b64('-01234567'), text: '-01234567', diag: 'Kamera 0' },
    'iso-8859-1',
  )
  assert.deepStrictEqual(outcome, { status: 'found', raw: '-01234567', format: 'code39', diag: 'Kamera 0' })
  assert.deepStrictEqual(Object.keys(outcome), ['status', 'raw', 'format', 'diag'])
})

test('Ergebnis mit items: jeder Code wie das Einzelergebnis dekodiert, Reihenfolge bleibt, erster steht oben', () => {
  const first = { format: 'DATA_MATRIX', bytesBase64: b64('[)>\u001e06\u001d9N110123456712'), text: 'egal' }
  const second = { format: 'PZN', bytesBase64: b64('-07654321'), text: '-07654321' }
  const third = { format: 'ITF', bytesBase64: b64('Grüße'), text: 'egal' }
  const outcome = mapPluginResult({ status: 'found', ...first, diag: '', items: [first, second, third], multiOn: true }, 'iso-8859-1')
  assert.deepStrictEqual(outcome, {
    status: 'found',
    raw: '[)>\u001e06\u001d9N110123456712',
    format: 'datamatrix',
    diag: '',
    items: [
      { raw: '[)>\u001e06\u001d9N110123456712', format: 'datamatrix' },
      { raw: '-07654321', format: 'code39' },
      // ISO-8859-1: Bytes 1:1, unbekanntes Format bleibt 'unknown'.
      { raw: 'Grüße', format: 'unknown' },
    ],
    multiOn: true,
  })
})

test('Ergebnis mit items: Zeichensatz des Profils gilt auch fuer die Liste (UTF-8)', () => {
  const bytesBase64 = Buffer.from('Grüße', 'utf8').toString('base64')
  const item = { format: 'QR_CODE', bytesBase64, text: 'egal' }
  const outcome = mapPluginResult({ status: 'found', ...item, items: [item], multiOn: false }, QR_PROFILE.charset)
  assert.deepStrictEqual(outcome, {
    status: 'found',
    raw: 'Grüße',
    format: 'qrcode',
    diag: '',
    items: [{ raw: 'Grüße', format: 'qrcode' }],
    multiOn: false,
  })
})

test('Abbruch: multiOn nur, wenn das Plugin es liefert', () => {
  assert.deepStrictEqual(mapPluginResult({ status: 'cancelled', diag: 'x' }, 'iso-8859-1'), { status: 'cancelled', diag: 'x' })
  assert.deepStrictEqual(mapPluginResult({ status: 'cancelled' }, 'iso-8859-1'), { status: 'cancelled', diag: '' })
  assert.deepStrictEqual(mapPluginResult({ status: 'cancelled', diag: '', multiOn: true }, 'iso-8859-1'), {
    status: 'cancelled',
    diag: '',
    multiOn: true,
  })
  assert.deepStrictEqual(mapPluginResult({ status: 'cancelled', diag: '', multiOn: false }, 'iso-8859-1'), {
    status: 'cancelled',
    diag: '',
    multiOn: false,
  })
})

test('verweigert und Fehler: unveraendert', () => {
  assert.deepStrictEqual(mapPluginResult({ status: 'denied' }, 'iso-8859-1'), { status: 'denied' })
  assert.deepStrictEqual(mapPluginResult({ status: 'error', code: 'camera', diag: 'd' }, 'iso-8859-1'), {
    status: 'error',
    message: 'Kamera konnte nicht gestartet werden',
    diag: 'd',
  })
  assert.deepStrictEqual(mapPluginResult({ status: 'error', code: 'no_result' }, 'iso-8859-1'), {
    status: 'error',
    message: 'Scan fehlgeschlagen',
    diag: '',
  })
})
