#!/usr/bin/env node
// keygen.mjs - EINMALIG: Ed25519-Schluesselpaar fuer OTA-Signaturen (Issue #130).
//
//   node scripts/ota/keygen.mjs [--out <pfad-zum-privaten-key.pem>] [--force]
//
// Der private Schluessel landet AUSSERHALB des Repos (Default:
// ~/.resqdocs/ota-ed25519-private.pem, chmod 600) - Pfade innerhalb des
// Repo-Roots werden verweigert. Der Public Key wird als C-Header nach
// firmware/bridge/bridge_s2/OtaPublicKey.h geschrieben (wird committet).

import { mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { generateKeyPair, rawPublicKey, publicKeyHeader } from './otaLib.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const headerPath = resolve(repoRoot, 'firmware/bridge/bridge_s2/OtaPublicKey.h')

const args = process.argv.slice(2)
const force = args.includes('--force')
const outIdx = args.indexOf('--out')
const outPath = resolve(outIdx >= 0 ? args[outIdx + 1] : resolve(homedir(), '.resqdocs/ota-ed25519-private.pem'))

if (outPath === repoRoot || outPath.startsWith(repoRoot + sep)) {
  console.error(`FEHLER: ${outPath} liegt im Repo - der private Schluessel darf nie ins Repo.`)
  process.exit(1)
}
if (existsSync(outPath) && !force) {
  console.error(`FEHLER: ${outPath} existiert bereits. Ueberschreiben macht alle bisher`)
  console.error('signierten Firmwares ungueltig - nur mit --force, wenn das gewollt ist.')
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPair()

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
chmodSync(outPath, 0o600)

writeFileSync(headerPath, publicKeyHeader(rawPublicKey(publicKey)))

console.log(`Privater Schluessel: ${outPath} (chmod 600 - sichern, nie committen!)`)
console.log(`Public-Key-Header:   ${headerPath} (committen)`)
