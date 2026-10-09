// Datenschutz-Waechter fuer den nativen Scanner: Inhalte medizinischer Codes und Kamerabilder
// duerfen das Geraet nie verlassen. Dieser Test liest die nativen Scanner-Quellen (Android und iOS) als
// Text und schlaegt fehl, sobald dort Netzwerkzugriff, Dateiablage von Bildern oder Logging hinzukommt.
// Ausserdem: die iOS-Dateien muessen im Xcode-Projekt eingetragen sein, sonst fehlt das Plugin still.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ANDROID_DIR = fileURLToPath(new URL('../../android/app/src/main/java/app/resqdocs/scanner/', import.meta.url))
const IOS_DIR = fileURLToPath(new URL('../../ios/App/App/Scanner/', import.meta.url))
const PBXPROJ = fileURLToPath(new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url))
const PODFILE = fileURLToPath(new URL('../../ios/App/Podfile', import.meta.url))
const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url))
const MAIN_ACTIVITY = fileURLToPath(new URL('../../android/app/src/main/java/app/resqdocs/MainActivity.java', import.meta.url))

const VERBOTEN: [RegExp, string][] = [
  [/\bjava\.net\b|\bjavax\.net\b|\bokhttp3?\b|HttpURLConnection|\bSocket\b|\bURL\(|URLSession|NSURLConnection|CFNetwork|\bNetwork\b/, 'Netzwerkzugriff'],
  [/FileOutputStream|MediaStore|openFileOutput|ImageCapture\.OutputFileOptions|UIImageWriteToSavedPhotosAlbum|PHPhotoLibrary|AVCapturePhotoOutput|write\(to:|FileManager/, 'Bild-/Dateiablage'],
  [/\bLog\.[vdiwe]\(|android\.util\.Log\b|println\(|\bprint\(|NSLog\(|os_log|Logger\(/, 'Logging (koennte Inhalte ausgeben)'],
]

function sources(dir: string, ext: string): { name: string; text: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }))
}

const ohneKommentare = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

test('Scanner-Quellen vorhanden (sonst prueft dieser Waechter nichts)', () => {
  const android = sources(ANDROID_DIR, '.kt').map((s) => s.name)
  for (const n of ['ScannerPlugin.kt', 'ScanActivity.kt', 'ScanOptions.kt']) assert.ok(android.includes(n), n)
  const ios = sources(IOS_DIR, '.swift').map((s) => s.name)
  for (const n of ['ScannerPlugin.swift', 'ScanViewController.swift', 'StartZoom.swift']) assert.ok(ios.includes(n), n)
})

test('kein Netzwerkcode, keine Bildablage, kein Logging im nativen Scanner (Android + iOS)', () => {
  for (const { name, text } of [...sources(ANDROID_DIR, '.kt'), ...sources(IOS_DIR, '.swift')]) {
    const code = ohneKommentare(text)
    for (const [re, was] of VERBOTEN) assert.doesNotMatch(code, re, `${name}: ${was}`)
  }
})

test('iOS: Scanner-Dateien stehen im Xcode-Target, ZXing-C++ 3.1.1 im Podfile', () => {
  const pbx = readFileSync(PBXPROJ, 'utf8')
  for (const f of ['ScannerPlugin.swift', 'ScanViewController.swift', 'StartZoom.swift']) {
    assert.match(pbx, new RegExp(`${f} in Sources`), `${f} fehlt in der Sources-Phase`)
  }
  assert.doesNotMatch(pbx, /DatamatrixDecoderPlugin/, 'alter Vision-Decoder darf nicht mehr im Projekt stehen')
  const pod = readFileSync(PODFILE, 'utf8')
  assert.match(pod, /pod 'zxing-cpp'.*:tag => 'v3\.1\.1'/, 'zxing-cpp 3.1.1 per Git-Tag (Trunk hat nur 2.2.0)')
})

test('alter Foto-Pfad bleibt weg: kein @capacitor/camera, kein Vision-/Foto-Decoder-Plugin', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { dependencies?: Record<string, string> }
  assert.equal(pkg.dependencies?.['@capacitor/camera'], undefined, '@capacitor/camera (Foto-Aufnahme) ist ersetzt')
  assert.doesNotMatch(readFileSync(PODFILE, 'utf8'), /CapacitorCamera/)
  const main = readFileSync(MAIN_ACTIVITY, 'utf8')
  assert.doesNotMatch(main, /DatamatrixDecoderPlugin/)
  assert.match(main, /registerPlugin\(app\.resqdocs\.scanner\.ScannerPlugin\.class\)/, 'nativer Scanner muss registriert sein')
})
