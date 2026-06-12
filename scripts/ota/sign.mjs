#!/usr/bin/env node
// sign.mjs - Firmware-Binary signieren und als Release ablegen (Issue #130).
//
//   node scripts/ota/sign.mjs --bin firmware/bridge/build/bridge_s2/bridge_s2.ino.bin \
//        --version 0.3.0 [--key ~/.resqdocs/ota-ed25519-private.pem]
//
// Erzeugt manifest.json { version, size, sha256, sigB64 } und kopiert
// Binary + Manifest an BEIDE Ablagen (einziger Kopierweg):
//   firmware/bridge/dist/bridge_s2.pico2w.<version>.bin / .manifest.json
//   apps/pico-pwa/src/assets/firmware/bridge_s2.bin / bridge_s2.manifest.json
// Gegenprueft die Signatur gegen den in OtaPublicKey.h eingebetteten Key.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createPrivateKey } from 'node:crypto'
import {
  sha256, buildManifest, verifyDigest, publicKeyFromRaw, rawPublicKeyFromHeader,
} from './otaLib.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const headerPath = resolve(repoRoot, 'firmware/bridge/bridge_s2/OtaPublicKey.h')
const distDir = resolve(repoRoot, 'firmware/bridge/dist')
const assetDir = resolve(repoRoot, 'apps/pico-pwa/src/assets/firmware')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const binPath = arg('--bin')
const version = arg('--version')
const keyPath = resolve(arg('--key', resolve(homedir(), '.resqdocs/ota-ed25519-private.pem')))

if (!binPath || !version) {
  console.error('Aufruf: sign.mjs --bin <pfad.bin> --version <x.y.z> [--key <pem>]')
  process.exit(1)
}
if (!existsSync(binPath)) {
  console.error(`FEHLER: Binary nicht gefunden: ${binPath}`)
  process.exit(1)
}
if (!existsSync(keyPath)) {
  console.error(`FEHLER: Privater Schluessel fehlt: ${keyPath} (einmalig: scripts/ota/keygen.mjs)`)
  process.exit(1)
}

const binary = readFileSync(binPath)
const privateKey = createPrivateKey(readFileSync(keyPath))
const manifest = buildManifest(binary, version, privateKey)

// Gegenpruefung: passt der private Schluessel zum committeten Public Key?
if (existsSync(headerPath)) {
  const pub = publicKeyFromRaw(rawPublicKeyFromHeader(readFileSync(headerPath, 'utf8')))
  const ok = verifyDigest(sha256(binary).digest, Buffer.from(manifest.sigB64, 'base64'), pub)
  if (!ok) {
    console.error(`FEHLER: Signatur passt NICHT zum Public Key in ${headerPath}.`)
    console.error('Falscher privater Schluessel? Die Firmware wuerde dieses Update ablehnen.')
    process.exit(1)
  }
} else {
  console.warn(`WARNUNG: ${headerPath} fehlt - Gegenpruefung uebersprungen (erst keygen.mjs ausfuehren).`)
}

mkdirSync(distDir, { recursive: true })
mkdirSync(assetDir, { recursive: true })

const manifestJson = JSON.stringify(manifest, null, 2) + '\n'
writeFileSync(resolve(distDir, `bridge_s2.pico2w.${version}.bin`), binary)
writeFileSync(resolve(distDir, `bridge_s2.pico2w.${version}.manifest.json`), manifestJson)
writeFileSync(resolve(assetDir, 'bridge_s2.bin'), binary)
writeFileSync(resolve(assetDir, 'bridge_s2.manifest.json'), manifestJson)

console.log(`Signiert: ${binPath} (${manifest.size} Bytes, v${manifest.version})`)
console.log(`  sha256: ${manifest.sha256}`)
console.log(`  dist:   firmware/bridge/dist/bridge_s2.pico2w.${version}.bin + .manifest.json`)
console.log(`  app:    apps/pico-pwa/src/assets/firmware/bridge_s2.bin + bridge_s2.manifest.json`)
