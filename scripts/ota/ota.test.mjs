// ota.test.mjs - Tests fuer das OTA-Signatur-Tooling (Issue #130).
// Laeuft mit:  node --test scripts/ota/ota.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sha256, signDigest, verifyDigest, generateKeyPair, rawPublicKey,
  publicKeyFromRaw, publicKeyHeader, rawPublicKeyFromHeader,
  buildManifest, validateManifest,
} from './otaLib.mjs'

const firmware = Buffer.from('resqdocs-fake-firmware-' + 'x'.repeat(1000))

test('Sign/Verify-Roundtrip: Ed25519 ueber den SHA-256-Digest', () => {
  const { publicKey, privateKey } = generateKeyPair()
  const { digest } = sha256(firmware)
  const sig = signDigest(digest, privateKey)
  assert.equal(sig.length, 64)
  assert.equal(verifyDigest(digest, sig, publicKey), true)
  // Manipuliertes Binary -> anderer Digest -> Signatur ungueltig.
  const tampered = Buffer.from(firmware)
  tampered[0] ^= 0xff
  assert.equal(verifyDigest(sha256(tampered).digest, sig, publicKey), false)
  // Fremder Schluessel -> ungueltig.
  const other = generateKeyPair()
  assert.equal(verifyDigest(digest, sig, other.publicKey), false)
})

test('signDigest verweigert Nicht-Digest-Eingaben', () => {
  const { privateKey } = generateKeyPair()
  assert.throws(() => signDigest(firmware, privateKey), /32 Bytes/)
})

test('Manifest: Format und Inhalt', () => {
  const { privateKey, publicKey } = generateKeyPair()
  const manifest = buildManifest(firmware, '0.3.0', privateKey)
  assert.deepEqual(validateManifest(manifest), [])
  assert.equal(manifest.version, '0.3.0')
  assert.equal(manifest.size, firmware.length)
  assert.equal(manifest.sha256, sha256(firmware).hex)
  assert.equal(
    verifyDigest(sha256(firmware).digest, Buffer.from(manifest.sigB64, 'base64'), publicKey),
    true,
  )
})

test('Manifest: ungueltige Felder werden gemeldet', () => {
  const { privateKey } = generateKeyPair()
  const manifest = buildManifest(firmware, '0.3.0', privateKey)
  assert.deepEqual(validateManifest({ ...manifest, version: 'v1' }), ['version'])
  assert.deepEqual(validateManifest({ ...manifest, size: 0 }), ['size'])
  assert.deepEqual(validateManifest({ ...manifest, sha256: 'kaputt' }), ['sha256'])
  assert.deepEqual(validateManifest({ ...manifest, sigB64: 'AAAA' }), ['sigB64'])
  assert.throws(() => buildManifest(firmware, 'quatsch', privateKey), /Ungueltige Version/)
})

test('Public-Key-Header: 32 Bytes, gueltiges C, Roundtrip', () => {
  const { publicKey, privateKey } = generateKeyPair()
  const raw = rawPublicKey(publicKey)
  assert.equal(raw.length, 32)

  const header = publicKeyHeader(raw)
  assert.match(header, /#pragma once/)
  assert.match(header, /static const uint8_t OTA_PUBLIC_KEY\[32\] = \{/)
  assert.equal((header.match(/0x[0-9a-f]{2}/g) ?? []).length, 32)

  // Roundtrip: Header -> raw -> KeyObject verifiziert eine echte Signatur.
  const parsed = rawPublicKeyFromHeader(header)
  assert.deepEqual(parsed, raw)
  const { digest } = sha256(firmware)
  const sig = signDigest(digest, privateKey)
  assert.equal(verifyDigest(digest, sig, publicKeyFromRaw(parsed)), true)
})
