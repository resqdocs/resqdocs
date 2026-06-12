#!/usr/bin/env node
// upload.mjs - Dev-Helfer: OTA-Update OHNE App auf die Bridge spielen (Issue #130).
//
//   node scripts/ota/upload.mjs --bin <pfad.bin> --manifest <manifest.json> \
//        [--url http://10.10.10.1]
//
// Faehrt POST /ota/begin -> /ota/chunk (sequenziell) -> /ota/commit und
// pollt danach /health, bis die Bridge wieder da ist. Fuer den Hardware-Test
// von Slice 1 unabhaengig von der App (Mac im Bridge-WLAN).

import { readFileSync } from 'node:fs'
import { validateManifest, sha256 } from './otaLib.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const binPath = arg('--bin')
const manifestPath = arg('--manifest')
const baseUrl = (arg('--url', 'http://10.10.10.1')).replace(/\/$/, '')

if (!binPath || !manifestPath) {
  console.error('Aufruf: upload.mjs --bin <pfad.bin> --manifest <manifest.json> [--url <http://...>]')
  process.exit(1)
}

const binary = readFileSync(binPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const formatErrors = validateManifest(manifest)
if (formatErrors.length) {
  console.error(`FEHLER: Manifest ungueltig (${formatErrors.join(', ')})`)
  process.exit(1)
}
if (manifest.size !== binary.length || manifest.sha256 !== sha256(binary).hex) {
  console.error('FEHLER: Manifest passt nicht zum Binary (size/sha256) - falsches Paar?')
  process.exit(1)
}

async function post(path, body) {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = {}
  try { json = JSON.parse(text) } catch { /* Fehlertext unten ausgeben */ }
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.trim()}`)
  return json
}

const begin = await post('/ota/begin', {
  size: manifest.size, sha256: manifest.sha256, sig: manifest.sigB64,
})
const chunkMax = Number(begin.chunkMax) || 8192
console.log(`Session offen (chunkMax ${chunkMax}); lade ${binary.length} Bytes hoch ...`)

for (let offset = 0; offset < binary.length; offset += chunkMax) {
  const chunk = binary.subarray(offset, offset + chunkMax)
  const { received } = await post('/ota/chunk', { offset, dataB64: chunk.toString('base64') })
  process.stdout.write(`\r  ${received}/${binary.length} Bytes (${Math.round((received / binary.length) * 100)} %)`)
}
console.log('\nVerifiziere und flashe (commit) ...')

const commit = await post('/ota/commit', {})
if (!commit.rebooting) {
  console.error('Unerwartete commit-Antwort:', JSON.stringify(commit))
  process.exit(1)
}

console.log('Bridge rebootet - warte auf /health ...')
const deadline = Date.now() + 90_000
let back = false
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000))
  try {
    const res = await fetch(baseUrl + '/health', { signal: AbortSignal.timeout(3000) })
    if (res.ok) { back = true; break }
  } catch { /* noch nicht wieder da */ }
}
if (!back) {
  console.error('Bridge nach 90 s nicht wieder erreichbar - Status manuell pruefen (ggf. BOOTSEL-Fallback).')
  process.exit(1)
}

const status = await (await fetch(baseUrl + '/status')).json()
console.log(`Fertig: Bridge meldet fwVersion ${status.fwVersion} (erwartet ${manifest.version}).`)
if (status.fwVersion !== manifest.version) process.exit(1)
