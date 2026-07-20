#!/usr/bin/env node
// Release-Guard (GAP 4): stellt sicher, dass das in die NATIVEN Assets gesyncte Web-Bundle
//   (a) versionskonsistent zur nativen Store-Version ist UND
//   (b) frisch aus dem AKTUELLEN Quellstand gebaut wurde (Content-Hash, nicht bloß Versions-String).
// Liest die EINGEBETTETE build-info.json (nicht dist/) -> deckt auch „cap sync vergessen" ab. Verankert
// im echten Store-Build (Gradle bundleRelease/assembleRelease, iOS Xcode Run-Script), NICHT in open-*.sh.
//   Aufruf: node scripts/check-bundle-fresh.mjs <android|ios> <embeddedPublicDir relativ zu apps/pico-pwa>
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { hashWebSources } from '../../../scripts/web-source-hash.mjs'

// Diese Datei: apps/pico-pwa/scripts/ -> eine Ebene hoch = apps/pico-pwa (App-Wurzel).
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Reine Auswertung (unit-testbar): Problemliste (leer = ok). */
export function evaluateFreshness({ info, nativeVersion, freshHash }) {
  const problems = []
  if (!info || typeof info !== 'object') {
    problems.push('build-info.json fehlt/unlesbar im eingebetteten Bundle — dist/ nicht frisch gebaut und/oder cap sync vergessen.')
    return problems
  }
  if (info.versionName !== nativeVersion) {
    problems.push(`Versions-Abweichung: Bundle=${info.versionName} != nativ=${nativeVersion} (genau der 1.2.1-Fall).`)
  }
  if (info.srcHash !== freshHash) {
    problems.push('Bundle VERALTET: eingebetteter srcHash != aktuell neu berechneter — dist/ wurde nicht aus dem aktuellen Quellstand gebaut/gesynct.')
  }
  return problems
}

function readNativeVersion(platform) {
  if (platform === 'android') {
    const gradle = readFileSync(join(APP_ROOT, 'android/app/build.gradle'), 'utf8')
    return gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '(nicht gefunden)'
  }
  if (platform === 'ios') {
    const pbx = readFileSync(join(APP_ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
    const all = [...pbx.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim())
    if (all.length === 0) return '(nicht gefunden)'
    return all.every((v) => v === all[0]) ? all[0] : `UNEINHEITLICH(${[...new Set(all)].join('/')})`
  }
  throw new Error(`Unbekannte Plattform: ${platform} (erwartet: android|ios)`)
}

function main() {
  const [platform, embeddedPublicDir] = process.argv.slice(2)
  if (!platform || !embeddedPublicDir) {
    console.error('Aufruf: check-bundle-fresh.mjs <android|ios> <embeddedPublicDir>')
    process.exit(2)
  }
  let info = null
  try {
    info = JSON.parse(readFileSync(join(APP_ROOT, embeddedPublicDir, 'build-info.json'), 'utf8'))
  } catch {
    info = null
  }
  const nativeVersion = readNativeVersion(platform)
  const freshHash = hashWebSources()
  const problems = evaluateFreshness({ info, nativeVersion, freshHash })
  if (problems.length) {
    console.error(`\n✖ Bundle-Frische-/Versions-Check FEHLGESCHLAGEN (${platform}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('  Fix: scripts/release/build-release.sh nutzen (clean build + cap sync), dann erneut.')
    process.exit(1)
  }
  console.log(`✓ Bundle frisch & versionskonsistent (${platform} ${nativeVersion}, srcHash ${freshHash.slice(0, 12)}…)`)
}

// Nur als CLI ausführen (beim Import im Test tut sich nichts).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
