#!/usr/bin/env node
// Build-Guard gegen den 1.2.1-Vorfall: das WEB-Bundle (package.json -> In-App-Anzeige) MUSS mit der
// nativen Store-Version übereinstimmen — Android versionName UND iOS MARKETING_VERSION. Weicht es ab,
// wird ein Build ausgeliefert, dessen In-App-Version (Web) von der Store-Version (nativ) abweicht (bei
// 1.2.1: Web 1.2.0 in nativem 1.2.1 — Symptom eines nicht neu gebauten Web-Bundles / fehlenden cap sync).
// Dieser Guard bricht den Build HART ab (exit 1), damit eine solche Inkonsistenz NIE stillschweigend
// durchläuft. Wird von open-android.sh / open-ios.sh vor cap sync aufgerufen.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..') // apps/pico-pwa

const web = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8')
const android = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '(nicht gefunden)'

const pbx = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
const iosAll = [...pbx.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map((m) => m[1].trim())
const ios =
  iosAll.length === 0
    ? '(nicht gefunden)'
    : iosAll.every((v) => v === iosAll[0])
      ? iosAll[0]
      : `UNEINHEITLICH(${[...new Set(iosAll)].join('/')})`

console.log(`App-Version  Web(package.json)=${web}  Android(versionName)=${android}  iOS(MARKETING_VERSION)=${ios}`)

if (new Set([web, android, ios]).size > 1) {
  console.error('\n✖ VERSIONS-INKONSISTENZ — Build abgebrochen.')
  console.error('  Web-Bundle und native Store-Version weichen ab (genau der 1.2.1-Vorfall: veraltetes Web-Bundle im nativen Build).')
  console.error('  Fix: scripts/bump.mjs <version> <build> erneut laufen lassen, dann Web NEU bauen (npm run build) und cap sync.')
  process.exit(1)
}
console.log('✓ App-Versionen konsistent (Web == Android == iOS).')
