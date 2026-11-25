// Laeuft mit:  node --test --experimental-strip-types
//
// „Mit Bridge-WLAN verbinden“: ResQBridgeWifi ist ein LOKALES Plugin der App (kein npm-Paket). Festgehalten wird
// die ganze Kette auf beiden Plattformen, nicht ein Laufzeitverhalten (es gibt hier keinen Gerätelauf):
// Registrierung (lokale Plugins registriert Capacitor nie von selbst), der Weg ohne Standortberechtigung,
// die iOS-Fähigkeit „Hotspot Configuration“ und der Rückfall auf älteren Android-Versionen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const ios = (file: string): string => read(`../../ios/App/${file}`)
const android = (file: string): string => read(`../../android/app/src/main/${file}`)
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const swift = ios('App/BridgeWifiPlugin.swift')
const kotlin = android('java/app/resqdocs/BridgeWifiPlugin.kt')
const manifest = android('AndroidManifest.xml')
const layer = read('./bridgeWifi.ts')

test('ein Plugin-Name auf beiden Plattformen und in der App', () => {
  assert.match(layer, /registerPlugin<ResQBridgeWifiPlugin>\('ResQBridgeWifi'\)/)
  assert.match(swift, /public let jsName = "ResQBridgeWifi"/)
  assert.match(kotlin, /@CapacitorPlugin\(name = "ResQBridgeWifi"\)/)
  for (const method of ['join', 'leave', 'status']) {
    assert.match(swift, new RegExp(`CAPPluginMethod\\(name: "${method}", returnType: CAPPluginReturnPromise\\)`), `iOS: ${method}`)
    assert.match(swift, new RegExp(`@objc func ${method}\\(_ call: CAPPluginCall\\)`), `iOS: ${method}`)
    assert.match(kotlin, new RegExp(`@PluginMethod\\s+fun ${method}\\(call: PluginCall\\)`), `Android: ${method}`)
  }
})

test('iOS: lokal registriert und im Xcode-Projekt', () => {
  assert.match(
    ios('App/AppDelegate.swift'),
    /class MainViewController: CAPBridgeViewController \{[\s\S]*?registerPluginInstance\(BridgeWifiPlugin\(\)\)/,
  )
  const project = ios('App.xcodeproj/project.pbxproj')
  assert.match(project, /BridgeWifiPlugin\.swift in Sources \*\/ = \{isa = PBXBuildFile/)
  assert.match(project, /BridgeWifiPlugin\.swift \*\/ = \{isa = PBXFileReference; lastKnownFileType = sourcecode\.swift;[^}]*path = App\/BridgeWifiPlugin\.swift/)
  assert.equal((project.match(/BridgeWifiPlugin\.swift in Sources \*\//g) ?? []).length, 2, 'Build-Datei und Eintrag in der Sources-Phase')
})

test('iOS: Beitritt per Präfix, Netz bleibt auch im Hintergrund (joinOnce aus), Fähigkeit eingetragen', () => {
  const src = code(swift)
  assert.match(src, /NEHotspotConfiguration\(ssidPrefix: ssidPrefix, passphrase: passphrase, isWEP: false\)/)
  assert.match(src, /configuration\.joinOnce = false/)
  assert.doesNotMatch(src, /joinOnce = true/)
  assert.match(src, /case \.userDenied:\s*call\.resolve\(\["status": "cancelled"\]\)/)
  assert.match(src, /case \.alreadyAssociated:\s*call\.resolve\(\["status": "applied"\]\)/)
  assert.match(ios('App/App.entitlements'), /<key>com\.apple\.developer\.networking\.HotspotConfiguration<\/key>\s*<true\/>/)
  const project = ios('App.xcodeproj/project.pbxproj')
  assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length, 2, 'Debug und Release')
})

test('Android: registriert, Präfix-Auswahl des Systems, Bindung wird wieder gelöst', () => {
  assert.match(android('java/app/resqdocs/MainActivity.java'), /registerPlugin\(app\.resqdocs\.BridgeWifiPlugin\.class\);[\s\S]*super\.onCreate\(savedInstanceState\)/)
  const src = code(kotlin)
  assert.match(src, /setSsidPattern\(PatternMatcher\(prefix, PatternMatcher\.PATTERN_PREFIX\)\)/)
  assert.match(src, /\.setWpa2Passphrase\(passphrase\)/)
  assert.match(src, /\.removeCapability\(NetworkCapabilities\.NET_CAPABILITY_INTERNET\)/)
  assert.match(src, /connectivity\.requestNetwork\(request, cb\)/)
  assert.match(src, /connectivity\.bindProcessToNetwork\(available\)/)
  assert.match(src, /if \(wasHeld\) connectivity\.bindProcessToNetwork\(null\)/, 'Bindung lösen')
  assert.match(src, /connectivity\.unregisterNetworkCallback\(cb\)/)
  assert.match(src, /override fun handleOnDestroy\(\) \{\s*release\(\)/, 'spätestens mit dem Ende der App')
  assert.match(src, /override fun onLost\(lost: Network\) = onGone\(/, 'Netz weg: Bindung lösen')
})

test('Android vor 10: sauberer Rückfall statt Absturz', () => {
  const src = code(kotlin)
  const guard = src.indexOf('if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q)')
  assert.ok(guard > 0)
  assert.ok(guard < src.indexOf('WifiNetworkSpecifier.Builder()'), 'die Prüfung steht vor dem neuen API')
  assert.match(src.slice(guard, guard + 120), /call\.resolve\(reply\("unsupported"\)\)\s*return/)
  assert.match(read('../../android/variables.gradle'), /minSdkVersion = 24\b/, 'ändert sich minSdk, diese Prüfung neu bewerten')
})

test('keine Standortberechtigung, keine Google-Dienste, kein Abfragen des WLAN-Namens', () => {
  assert.doesNotMatch(manifest, /LOCATION|NEARBY_WIFI_DEVICES/)
  assert.match(manifest, /<uses-permission android:name="android\.permission\.CHANGE_NETWORK_STATE" \/>/)
  assert.match(manifest, /<uses-permission android:name="android\.permission\.ACCESS_WIFI_STATE" \/>/)
  // ACCESS_WIFI_STATE zieht sonst android.hardware.wifi als Pflicht nach (Play-Warnung zu 2.2.0): Geräte ohne WLAN bleiben unterstützt.
  assert.match(manifest, /<uses-feature android:name="android\.hardware\.wifi" android:required="false" \/>/)
  assert.doesNotMatch(code(kotlin), /com\.google\.|\.gms\.|LocationManager|getScanResults|startScan|connectionInfo/)
  assert.doesNotMatch(code(swift), /CoreLocation|CLLocationManager|fetchCurrent|CNCopyCurrentNetworkInfo/)
  assert.doesNotMatch(ios('App/App.entitlements'), /wifi-info/)
  assert.doesNotMatch(ios('App/Info.plist'), /NSLocation/)
})

test('das Plugin selbst spricht mit niemandem', () => {
  for (const src of [code(kotlin), code(swift)]) assert.doesNotMatch(src, /https?:\/\/|URLSession|HttpURLConnection|OkHttp|openConnection/)
})
