// otaLib.mjs - gemeinsame Logik fuer keygen/sign/upload (Issue #130).
// Signatur-Modell: Ed25519 ueber den SHA-256-Digest des Firmware-Binaries.
// Die Firmware verifiziert mit demselben Schema (OtaUpdate.h): erst Digest
// streamend berechnen, dann Ed25519::verify(sig, OTA_PUBLIC_KEY, digest, 32).

import { createHash, sign, verify, generateKeyPairSync, createPublicKey } from 'node:crypto'

/** SHA-256 ueber einen Buffer; liefert { hex, digest }. */
export function sha256(buffer) {
  const digest = createHash('sha256').update(buffer).digest()
  return { hex: digest.toString('hex'), digest }
}

/** Ed25519-Signatur ueber den 32-Byte-Digest (NICHT ueber das ganze Binary). */
export function signDigest(digest, privateKey) {
  if (digest.length !== 32) throw new Error(`Digest muss 32 Bytes haben, ist ${digest.length}`)
  return sign(null, digest, privateKey)
}

/** Gegenpruefung mit dem Public Key (Node-Pendant zu Ed25519::verify). */
export function verifyDigest(digest, signature, publicKey) {
  return verify(null, digest, publicKey, signature)
}

/** Einmaliges Ed25519-Schluesselpaar. */
export function generateKeyPair() {
  return generateKeyPairSync('ed25519')
}

/** Rohe 32 Public-Key-Bytes aus einem KeyObject (SPKI-DER, letzte 32 Bytes). */
export function rawPublicKey(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const raw = der.subarray(der.length - 32)
  if (raw.length !== 32) throw new Error('Public Key hat nicht 32 Bytes')
  return Buffer.from(raw)
}

/** KeyObject aus rohen 32 Public-Key-Bytes (fuer die Header-Gegenpruefung). */
export function publicKeyFromRaw(raw32) {
  if (raw32.length !== 32) throw new Error('Roher Public Key muss 32 Bytes haben')
  // SPKI-DER-Prefix fuer Ed25519 (RFC 8410): 12 Header-Bytes + 32 Key-Bytes.
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  return createPublicKey({ key: Buffer.concat([prefix, raw32]), type: 'spki', format: 'der' })
}

/** C-Header mit dem eingebetteten Public Key (wird committet). */
export function publicKeyHeader(raw32) {
  if (raw32.length !== 32) throw new Error('Roher Public Key muss 32 Bytes haben')
  const rows = []
  for (let i = 0; i < 32; i += 8) {
    const row = Array.from(raw32.subarray(i, i + 8), (b) => '0x' + b.toString(16).padStart(2, '0'))
    rows.push('  ' + row.join(', '))
  }
  return [
    '// SPDX-License-Identifier: GPL-3.0-or-later',
    '// Copyright (C) 2026 The ResQDocs project contributors',
    '// OtaPublicKey.h - GENERIERT von scripts/ota/keygen.mjs, nicht von Hand editieren.',
    '// Ed25519-Public-Key des Maintainers; verifiziert OTA-Firmware vor dem Anwenden.',
    '#pragma once',
    '#include <stdint.h>',
    '',
    'static const uint8_t OTA_PUBLIC_KEY[32] = {',
    rows.join(',\n'),
    '};',
    '',
  ].join('\n')
}

/** Rohe Public-Key-Bytes aus einem generierten OtaPublicKey.h zurueckparsen. */
export function rawPublicKeyFromHeader(headerText) {
  const bytes = [...headerText.matchAll(/0x([0-9a-fA-F]{2})/g)].map((m) => parseInt(m[1], 16))
  if (bytes.length !== 32) throw new Error(`OtaPublicKey.h enthaelt ${bytes.length} statt 32 Bytes`)
  return Buffer.from(bytes)
}

/** Manifest fuer ein signiertes Firmware-Binary. */
export function buildManifest(binary, version, privateKey) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Ungueltige Version: ${version}`)
  const { hex, digest } = sha256(binary)
  const sig = signDigest(digest, privateKey)
  return { version, size: binary.length, sha256: hex, sigB64: sig.toString('base64') }
}

/** Manifest-Format pruefen (auch von der App-Seite erwartetes Schema). */
export function validateManifest(manifest) {
  const errors = []
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? '')) errors.push('version')
  if (!Number.isInteger(manifest?.size) || manifest.size <= 0) errors.push('size')
  if (!/^[0-9a-f]{64}$/.test(manifest?.sha256 ?? '')) errors.push('sha256')
  const sig = manifest?.sigB64 ? Buffer.from(manifest.sigB64, 'base64') : Buffer.alloc(0)
  if (sig.length !== 64) errors.push('sigB64')
  return errors
}
