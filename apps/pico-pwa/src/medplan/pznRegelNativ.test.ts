// Die Kamera prüft im Mehrfach-Modus selbst, ob eine PZN schon in der Liste steht. Dafür leitet sie die PZN aus dem
// gelesenen Code ab, nach derselben Regel wie die App (medications/packageScan.ts). Die Regel steht damit an drei
// Stellen (TypeScript, Kotlin, Swift). Dieser Test hält fest, dass alle drei dieselbe beschreiben; übersetzen und
// ausführen lässt sich der native Code hier nicht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractPznFromPackageCode } from '../medications/packageScan.ts'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ts = readFileSync(join(APP, 'src/medications/packageScan.ts'), 'utf8')
const kt = readFileSync(join(APP, 'android/app/src/main/java/app/resqdocs/scanner/ScanActivity.kt'), 'utf8')
const swift = readFileSync(join(APP, 'ios/App/App/Scanner/ScanViewController.swift'), 'utf8')
const ab = (s: string, marke: string, len: number): string => {
  const i = s.indexOf(marke)
  assert.ok(i >= 0, `${marke} fehlt`)
  return s.slice(i, i + len)
}

test('die Regel der App, an der sich die nativen Fassungen messen', () => {
  assert.equal(extractPznFromPackageCode('\u001d9N110222394512', 'datamatrix'), '02223945')
  assert.equal(extractPznFromPackageCode('0104150123456789', 'datamatrix'), null, 'Data Matrix ohne 9N11: keine PZN')
  assert.equal(extractPznFromPackageCode('-2223945', 'code39'), '02223945')
  assert.equal(extractPznFromPackageCode('123', 'code39'), null)
  assert.equal(extractPznFromPackageCode('123456789', 'code39'), null)
  assert.match(ts, /s\.match\(\/9N11\(\\d\{8\}\)\/\)/)
  assert.match(ts, /if \(digits\.length < 4 \|\| digits\.length > 8\) return null\n  return digits\.padStart\(8, '0'\)/)
})

test('Android: dieselbe Regel (Muster, Data Matrix ohne Treffer, vier bis acht Ziffern, auf acht Stellen)', () => {
  const fn = ab(kt, 'internal fun extractPznFromPackageCode(', 900)
  assert.match(kt, /Regex\("9N11\(\[0-9\]\{8\}\)"\)/)
  assert.match(fn, /if \(dataMatrix \|\| unknown\) \{/)
  assert.match(fn, /if \(dataMatrix\) return null/)
  assert.match(fn, /removePrefix\("-"\)\.filter \{ it in '0'\.\.'9' \}/)
  assert.match(fn, /if \(digits\.length < 4 \|\| digits\.length > 8\) return null\n\s*return digits\.padStart\(8, '0'\)/)
  assert.match(kt, /packageScan\.ts/, 'Verweis auf die Quelle der Regel')
})

test('iOS: dieselbe Regel', () => {
  const fn = ab(swift, 'static func extractPznFromPackageCode(', 1100)
  assert.match(fn, /NSRegularExpression\(pattern: "9N11\(\[0-9\]\{8\}\)"\)/)
  assert.match(fn, /if dataMatrix \|\| unknown \{/)
  assert.match(fn, /if dataMatrix \{ return nil \}/)
  assert.match(fn, /s\.hasPrefix\("-"\) \? String\(s\.dropFirst\(\)\) : s/)
  assert.match(fn, /if digits\.count < 4 \|\| digits\.count > 8 \{ return nil \}\n\s*return String\(repeating: "0", count: 8 - digits\.count\) \+ digits/)
  assert.match(swift, /packageScan\.ts/, 'Verweis auf die Quelle der Regel')
})

test('Mehrfach-Modus: Beenden gibt Erfasstes zurück; die Brücke kennt Schalter und Liste', () => {
  assert.match(kt, /private fun finishCollected\(/)
  assert.match(swift, /private func finishCollected\(/)
  const bridge = readFileSync(join(APP, 'src/medplan/nativeScanner.ts'), 'utf8')
  assert.match(bridge, /multiToggleLabel/)
  assert.match(bridge, /export function mapPluginResult\(/)
})
