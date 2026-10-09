// Tests fuer die zentralen Scan-Profile: Zeichensatz der Rohbytes und einheitliche Decoder-Optionen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BMP_PROFILE, PACKAGE_PROFILE, QR_PROFILE, decodeScanBytes } from './scanProfiles.ts'

const b64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64')

test('ISO-8859-1: Umlaute aus Einzelbytes (BMP-Kodierung laut Spezifikation)', () => {
  // "Müller ß" in ISO-8859-1: ü = 0xFC, ß = 0xDF
  const bytes = [0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x20, 0xdf]
  assert.equal(decodeScanBytes(b64(bytes), 'iso-8859-1'), 'Müller ß')
})

test('ISO-8859-1 ist NICHT windows-1252: 0x80 bleibt U+0080 statt Euro-Zeichen', () => {
  assert.equal(decodeScanBytes(b64([0x80]), 'iso-8859-1').charCodeAt(0), 0x80)
})

test('UTF-8: mehrbytige Zeichen', () => {
  assert.equal(decodeScanBytes(Buffer.from('Ärzte – ok', 'utf8').toString('base64'), 'utf-8'), 'Ärzte – ok')
})

test('BMP-Profil: Data Matrix, ISO-8859-1', () => {
  assert.deepEqual(BMP_PROFILE.formats, ['DataMatrix'])
  assert.equal(BMP_PROFILE.charset, 'iso-8859-1')
})

test('Packungs-Profil: Data Matrix + Code 39 + PZN, ISO-8859-1 (GS1 ist ASCII)', () => {
  assert.deepEqual(PACKAGE_PROFILE.formats, ['DataMatrix', 'Code39', 'PZN'])
  assert.equal(PACKAGE_PROFILE.charset, 'iso-8859-1')
})

test('QR-Profil: nur QR, UTF-8, invertiert erlaubt (Bildschirm im Dunkelmodus)', () => {
  assert.deepEqual(QR_PROFILE.formats, ['QRCode'])
  assert.equal(QR_PROFILE.charset, 'utf-8')
  assert.equal(QR_PROFILE.decoder.tryInvert, true)
})

test('alle Profile: Decoder-Optionen ausdruecklich gesetzt, tryDenoise aus, Codegroesse plausibel', () => {
  for (const [name, p] of Object.entries({ BMP_PROFILE, PACKAGE_PROFILE, QR_PROFILE })) {
    for (const key of ['tryHarder', 'tryRotate', 'tryInvert', 'tryDownscale', 'tryDenoise'] as const) {
      assert.equal(typeof p.decoder[key], 'boolean', `${name}.${key}`)
    }
    // Einheitlichkeit mit iOS: dessen Wrapper kennt tryDenoise nicht -> ueberall aus.
    assert.equal(p.decoder.tryDenoise, false, name)
    assert.ok(p.codeSizeMm >= 5 && p.codeSizeMm <= 200, `${name}.codeSizeMm`)
    assert.ok(p.formats.length > 0 && p.title && p.hint, name)
  }
})
