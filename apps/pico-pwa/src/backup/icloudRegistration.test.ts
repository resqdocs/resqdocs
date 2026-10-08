// Laeuft mit:  node --test --experimental-strip-types
//
// iCloud-Sicherung auf iOS: ICloudBackup ist ein LOKALES Plugin der App, kein npm-Paket. Capacitor registriert
// es deshalb nicht von selbst (packageClassList kennt nur npm-Plugins), sondern MainViewController in
// capacitorDidLoad (AppDelegate.swift). MainViewController ist der Start-View-Controller in Main.storyboard.
//
// Seit dem UIScene-Umbau (Xcode 27) legt UIKit das Fenster aus Main.storyboard an - vorausgesetzt, die Szene
// verweist auf das Storyboard und der SceneDelegate setzt keinen eigenen rootViewController. Genau das ging
// schief: Ein CAPBridgeViewController() im SceneDelegate ersetzte MainViewController, die App meldete
// "ICloudBackup plugin is not implemented on ios", und der Cloud-Schalter sprang sofort zurueck.
//
// Festgehalten wird die ganze Kette, nicht ein Laufzeitverhalten (es gibt keinen iOS-Testlauf).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ios = (file: string) => readFileSync(new URL(`../../ios/App/App/${file}`, import.meta.url), 'utf8')

test('SceneDelegate setzt keinen eigenen Start-View-Controller', () => {
  assert.doesNotMatch(ios('SceneDelegate.swift'), /rootViewController\s*=/)
})

test('die Szene startet aus Main.storyboard (Konfigurationsname in Code und Info.plist gleich)', () => {
  const plist = ios('Info.plist')
  assert.match(plist, /<key>UISceneConfigurationName<\/key>\s*<string>Default Configuration<\/string>/)
  assert.match(plist, /<key>UISceneStoryboardFile<\/key>\s*<string>Main<\/string>/)
  assert.match(ios('AppDelegate.swift'), /UISceneConfiguration\(name: "Default Configuration"/)
})

test('Start-View-Controller von Main.storyboard ist MainViewController', () => {
  const storyboard = ios('Base.lproj/Main.storyboard')
  const initial = storyboard.match(/initialViewController="([^"]+)"/)?.[1]
  assert.ok(initial, 'Main.storyboard hat keinen Start-View-Controller')
  const tag = storyboard.match(new RegExp(`<viewController\\b[^>]*\\bid="${initial}"[^>]*>`))?.[0] ?? ''
  assert.match(tag, /customClass="MainViewController"/)
})

test('MainViewController registriert das lokale iCloud-Plugin', () => {
  assert.match(
    ios('AppDelegate.swift'),
    /class MainViewController: CAPBridgeViewController \{[\s\S]*?registerPluginInstance\(ICloudBackupPlugin\(\)\)/,
  )
})
