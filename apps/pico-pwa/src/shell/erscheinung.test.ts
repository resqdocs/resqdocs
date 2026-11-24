// Wächter: Auf iOS folgt alles nach dem Startbild der in der App gewählten Erscheinung (Hell, Dunkel, System),
// nicht dem Systemthema: Fläche hinter der WebView, Statusleiste, Tastatur und prefers-color-scheme in der WebView.
// Vorher startete die App bei System dunkel und App hell erst dunkelblau und sprang dann auf hell.
// Android bleibt unverändert (dort führt dasselbe Plugin die Farbe hinter den Systemleisten nach).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appearanceTheme, appearanceToSync } from './appearanceRules.ts'
import { SETTINGS_KEY } from '../storage/settingsRepository.ts'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
const code = (f: string): string => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('Einstellung → Fenster: Hell und Dunkel legen fest, System und alles Ungültige folgen dem iPhone', () => {
  assert.equal(appearanceTheme('light'), 'light')
  assert.equal(appearanceTheme('dark'), 'dark')
  assert.equal(appearanceTheme('system'), 'system')
  for (const bad of [undefined, null, '', 'Light', 'DARK', 'classic', 0, 1, true, {}, []]) assert.equal(appearanceTheme(bad), 'system', String(bad))
})

test('gemeldet wird erst nach dem Laden der Einstellungen (sonst nähme der Standard den nativen Start zurück)', () => {
  assert.equal(appearanceToSync(false, 'system'), null)
  assert.equal(appearanceToSync(false, 'light'), null)
  assert.equal(appearanceToSync(true, 'light'), 'light')
  assert.equal(appearanceToSync(true, 'dark'), 'dark')
  assert.equal(appearanceToSync(true, 'system'), 'system')
  assert.equal(appearanceToSync(true, 'quatsch'), 'system')
})

test('App: eine Schicht, je Plattform eine Methode; Android unverändert, iOS meldet die Erscheinung', () => {
  const bars = code('src/shell/systemBars.ts')
  assert.match(bars, /registerPlugin<ResQChromePlugin>\('ResQChrome'\)/)
  // iOS: nur dort, über die Regel, still bei Fehlern.
  const ios = bars.slice(bars.indexOf('export function syncAppearance'))
  assert.match(ios, /^export function syncAppearance\(settingsLoaded: boolean, theme: unknown\): void \{\s*if \(Capacitor\.getPlatform\(\) !== 'ios'\) return\s*const value = appearanceToSync\(settingsLoaded, theme\)\s*if \(!value\) return\s*void ResQChrome\.setAppearance\(\{ theme: value \}\)\.catch\(/)
  // Android: Funktion wie bisher, kennt setAppearance nicht.
  const android = bars.slice(bars.indexOf('export function syncSystemBars'), bars.indexOf('export function syncAppearance'))
  assert.match(android, /if \(Capacitor\.getPlatform\(\) !== 'android'\) return/)
  assert.match(android, /ResQChrome\.setColor\(/)
  assert.doesNotMatch(android, /setAppearance/)
  assert.doesNotMatch(ios, /setColor/)
  // Aufruf: sobald die Einstellungen geladen sind und bei jedem Umschalten; der Android-Aufruf steht unverändert daneben.
  const vue = read('src/App.vue')
  assert.match(vue, /watch\(\[\(\) => storage\.settingsLoaded\.value, \(\) => storage\.settings\.theme\], \(\[loaded, theme\]\) => syncAppearance\(loaded, theme\), \{ immediate: true \}\)/)
  assert.match(vue, /watch\(\[\(\) => storage\.settings\.theme, prefersDark\], \(\) => syncSystemBars\(\), \{ immediate: true, flush: 'post' \}\)/)
  // „System“ folgt weiter live dem Gerät: Die Seite hört auf prefers-color-scheme.
  assert.match(vue, /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.addEventListener\('change'/)
  assert.match(vue, /const dark = t === 'dark' \|\| \(t === 'system' && prefersDark\.value\)/)
})

test('Android-Plugin unverändert: nur die Farbe, keine Erscheinung des Fensters', () => {
  const kt = read('android/app/src/main/java/app/resqdocs/AppChromePlugin.kt')
  assert.match(kt, /@CapacitorPlugin\(name = "ResQChrome"\)/)
  assert.match(kt, /fun setColor\(call: PluginCall\)/)
  assert.doesNotMatch(kt, /setAppearance|AppCompatDelegate|setDefaultNightMode/)
})

test('iOS-Plugin ResQChrome: Methode vorhanden, setzt das Fenster, registriert wie die anderen lokalen Plugins', () => {
  const swift = read('ios/App/App/AppChromePlugin.swift')
  assert.match(swift, /@objc\(AppChromePlugin\)\s*public class AppChromePlugin: CAPPlugin, CAPBridgedPlugin \{/)
  assert.match(swift, /public let jsName = "ResQChrome"/)
  assert.match(swift, /CAPPluginMethod\(name: "setAppearance", returnType: CAPPluginReturnPromise\)/)
  assert.match(swift, /@objc func setAppearance\(_ call: CAPPluginCall\) \{\s*let style = AppAppearance\.style\(forTheme: call\.getString\("theme"\)\)\s*DispatchQueue\.main\.async \{\s*self\.bridge\?\.viewController\?\.view\.window\?\.overrideUserInterfaceStyle = style\s*call\.resolve\(\)/)
  // Lokale Plugins registriert MainViewController von Hand (Capacitor kennt nur npm-Plugins).
  assert.match(read('ios/App/App/AppDelegate.swift'), /class MainViewController: CAPBridgeViewController \{[\s\S]*?registerPluginInstance\(AppChromePlugin\(\)\)/)
  // Im Xcode-Projekt eingetragen (Datei, Gruppe, Build-Phase): iosProjekt.test.ts prüft die Verweise.
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
  assert.match(pbx, /\/\* AppChromePlugin\.swift in Sources \*\/ = \{isa = PBXBuildFile; fileRef = [0-9A-F]{24} \/\* AppChromePlugin\.swift \*\/; \};/)
  assert.match(pbx, /\/\* AppChromePlugin\.swift \*\/ = \{isa = PBXFileReference; lastKnownFileType = sourcecode\.swift; name = AppChromePlugin\.swift; path = App\/AppChromePlugin\.swift; sourceTree = "<group>"; \};/)
})

test('Zuordnung im nativen Code wie in der App: light, dark, sonst dem System folgen', () => {
  const swift = read('ios/App/App/AppChromePlugin.swift')
  assert.match(swift, /static func style\(forTheme theme: String\?\) -> UIUserInterfaceStyle \{\s*switch theme \{\s*case "light": return \.light\s*case "dark": return \.dark\s*default: return \.unspecified\s*\}/)
})

test('Start: die gespeicherte Einstellung wird nativ gelesen, bevor die Seite zeichnet', () => {
  const swift = read('ios/App/App/AppChromePlugin.swift')
  // @capacitor/preferences legt Werte in UserDefaults.standard unter „CapacitorStorage.<Schlüssel>“ ab.
  assert.equal(SETTINGS_KEY, 'app.settings')
  assert.match(swift, new RegExp(`static let settingsDefaultsKey = "CapacitorStorage\\.${SETTINGS_KEY.replace('.', '\\.')}"`))
  const prefs = readFileSync(join(app, 'node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/Preferences.swift'), 'utf8')
  assert.match(prefs, /init\(for group: Group = \.named\("CapacitorStorage"\)\)/)
  assert.match(prefs, /return UserDefaults\.standard/)
  assert.match(prefs, /return group \+ "\."/)
  assert.doesNotMatch(code('src/storage/preferencesAdapter.ts'), /configure\(/, 'die App nutzt die Standardgruppe')
  // JSON-Text mit dem Feld „theme“; fehlend oder unlesbar → dem System folgen.
  assert.match(swift, /JSONSerialization\.jsonObject\(with: data\)\) as\? \[String: Any\] else \{ return nil \}\s*return object\["theme"\] as\? String/)
  assert.match(swift, /static func storedStyle\(defaults: UserDefaults = \.standard\) -> UIUserInterfaceStyle \{\s*return style\(forTheme: theme\(fromSettingsJSON: defaults\.string\(forKey: settingsDefaultsKey\)\)\)/)
  // Gesetzt wird am Fenster, bevor Capacitor die Szene übernimmt.
  const scene = read('ios/App/App/SceneDelegate.swift')
  const connect = scene.slice(scene.indexOf('willConnectTo session'), scene.indexOf('openURLContexts'))
  assert.match(connect, /let style = AppAppearance\.storedStyle\(\)\s*window\?\.overrideUserInterfaceStyle = style\s*\(scene as\? UIWindowScene\)\?\.windows\.forEach \{ \$0\.overrideUserInterfaceStyle = style \}\s*SceneDelegateProxy\.shared\.scene\(scene, willConnectTo: session, options: connectionOptions\)/)
  assert.doesNotMatch(scene, /rootViewController\s*=/, 'kein eigener Start-View-Controller (lokale Plugins blieben sonst unregistriert)')
  // Nichts erzwingt die Erscheinung fest für die ganze App.
  assert.doesNotMatch(read('ios/App/App/Info.plist'), /UIUserInterfaceStyle/)
})

test('Seite und Fläche dahinter richten sich nach dem Fenster: frühe Farbe per prefers-color-scheme, benannte Farbe', () => {
  const html = read('index.html')
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{\s*html:not\(\[data-theme\]\)/)
  assert.match(read('ios/App/App/AppDelegate.swift'), /if let splash = UIColor\(named: "SplashBackground"\)/)
})
