// Wächter: Auf Android stehen oben und unten keine andersfarbigen Balken. Hinter den Systemleisten liegt als
// Standard die Farbe von Kopfzeile und Tab-Leiste (base-100, Android-Thema hell und dunkel). Zur Laufzeit meldet
// die App, was die Seite an ihrem oberen und unteren Rand gerade zeigt: auch ein Fenster über den ganzen Bildschirm
// in anderer Farbe (Einführung in base-200) oder eine abgedunkelte Seite.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { composite, isDarkColor, toHex } from './systemBarsColor.ts'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')

/** base-100 eines Themas aus style.css, klein geschrieben. */
function base100(theme: string): string {
  const css = read('src/style.css')
  const block = css.slice(css.indexOf(`name: "${theme}";`))
  return (block.match(/--color-base-100:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? '').toLowerCase()
}

test('Android-Thema: Fensterhintergrund = base-100, hell und dunkel', () => {
  const light = read('android/app/src/main/res/values/colors.xml').match(/<color name="appChrome">(#[0-9A-Fa-f]{6})<\/color>/)?.[1]
  const night = read('android/app/src/main/res/values-night/colors.xml').match(/<color name="appChrome">(#[0-9A-Fa-f]{6})<\/color>/)?.[1]
  assert.equal(light?.toLowerCase(), base100('resqdocs'))
  assert.equal(night?.toLowerCase(), base100('resqdocs-dark'))
  const styles = read('android/app/src/main/res/values/styles.xml')
  const theme = styles.slice(styles.indexOf('<style name="AppTheme.NoActionBar"'), styles.indexOf('</style>', styles.indexOf('<style name="AppTheme.NoActionBar"')))
  assert.match(theme, /<item name="android:windowBackground">@color\/appChrome<\/item>/)
})

test('Laufzeit: eigenes Plugin, registriert, ohne veraltete Leisten-APIs', () => {
  const plugin = read('android/app/src/main/java/app/resqdocs/AppChromePlugin.kt')
  assert.match(plugin, /@CapacitorPlugin\(name = "ResQChrome"\)/)
  assert.match(plugin, /decorView\.setBackgroundColor\(/)
  assert.match(plugin, /isAppearanceLightStatusBars = !dark/)
  assert.match(plugin, /isAppearanceLightNavigationBars = !bottomDark/)
  // Oben und unten dürfen sich unterscheiden (Blatt von unten vor abgedunkelter Seite): zweifarbiger Hintergrund.
  assert.match(plugin, /if \(upper == lower\) \{\s*window\.decorView\.setBackgroundColor\(upper\)\s*\} else \{\s*window\.decorView\.background = SplitDrawable\(upper, lower\)/)
  assert.match(plugin, /bottomColor = lower \?: parsed/, 'ohne eigene Angabe gilt unten dasselbe wie oben')
  // Capacitor setzt bei Konfigurationsänderungen die Themenfarbe zurück: danach erneut setzen.
  assert.match(plugin, /override fun handleOnConfigurationChanged[\s\S]*?decorView\.post \{ apply\(\) \}/)
  const code = plugin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(code, /setStatusBarColor|setNavigationBarColor|statusBarColor|navigationBarColor|setDecorFitsSystemWindows/, 'keine veralteten Edge-to-Edge-APIs (Play-Warnung)')
  assert.match(read('android/app/src/main/java/app/resqdocs/MainActivity.java'), /registerPlugin\(app\.resqdocs\.AppChromePlugin\.class\);/)
})

test('App: meldet, was die Seite an ihren Rändern zeigt, und führt jede Änderung nach', () => {
  const bars = read('src/shell/systemBars.ts')
  // Gefragt wird die Seite selbst: alle Flächen an der Stelle, übereinandergelegt. So zählt auch ein Fenster über
  // den ganzen Bildschirm (Einführung) und eine abgedunkelte Seite, ohne dass ein Fenster dafür eigenen Code braucht.
  assert.match(bars, /document\.elementsFromPoint\(x, y\)/)
  assert.match(bars, /top: colorAt\(x, 1, ground\), bottom: colorAt\(x, Math\.max\(1, window\.innerHeight - 2\), ground\)/)
  assert.match(bars, /new MutationObserver\(scheduleSync\)\.observe\(document\.body, \{ subtree: true, childList: true, attributes: true, attributeFilter: \['class', 'open', 'hidden', 'style'\] \}\)/)
  // Nach dem Ein- oder Ausblenden noch einmal, und nur senden, wenn sich etwas geändert hat.
  assert.match(bars, /settle = window\.setTimeout\(syncSystemBars, SETTLE_MS\)/)
  assert.match(bars, /if \(color \+ bottomColor === lastSent\) return/)
  assert.match(bars, /setColor\(\{ color, dark: isDarkColor\(\.\.\.edges\.top\), bottomColor, bottomDark: isDarkColor\(\.\.\.edges\.bottom\) \}\)/)
  // Beobachtet wird nur auf Android: vor dem Plattform-Check passiert nichts.
  assert.match(bars, /export function syncSystemBars\(\): void \{\s*if \(Capacitor\.getPlatform\(\) !== 'android'\) return\s*watchSurface\(\)/)
})

test('Flächen übereinanderlegen: deckend ersetzt, durchscheinend mischt, durchsichtig zählt nicht', () => {
  const white: [number, number, number] = [255, 255, 255]
  assert.deepEqual(composite(white, []), [255, 255, 255])
  assert.deepEqual(composite(white, [[247, 248, 251, 1]]), [247, 248, 251], 'Einführung in base-200 über der weißen Seite')
  assert.deepEqual(composite(white, [[0, 0, 0, 0]]), [255, 255, 255])
  assert.deepEqual(composite(white, [[0, 0, 0, 0.4]]).map(Math.round), [153, 153, 153], 'abgedunkelte Seite')
  // Reihenfolge von unten nach oben: Ein deckendes Fenster über dem Abdunkeln gewinnt.
  assert.deepEqual(composite(white, [[0, 0, 0, 0.4], [20, 27, 48, 1]]), [20, 27, 48])
})

test('App: meldet die Farbe nur auf Android und bei jedem Themenwechsel', () => {
  const bars = read('src/shell/systemBars.ts')
  assert.match(bars, /registerPlugin<ResQChromePlugin>\('ResQChrome'\)/)
  assert.match(bars, /if \(Capacitor\.getPlatform\(\) !== 'android'\) return/)
  assert.match(bars, /getPropertyValue\('--color-base-100'\)/)
  assert.match(read('src/App.vue'), /watch\(\[\(\) => storage\.settings\.theme, prefersDark\], \(\) => syncSystemBars\(\), \{ immediate: true, flush: 'post' \}\)/)
})

test('Farbrechnung: Hex und Helligkeit', () => {
  assert.equal(toHex(20, 27, 48), '#141b30')
  assert.equal(toHex(255, 255, 255), '#ffffff')
  assert.equal(toHex(300, -4, 15.6), '#ff0010')
  assert.equal(isDarkColor(20, 27, 48), true, 'dunkles Thema: helle Symbole')
  assert.equal(isDarkColor(255, 255, 255), false, 'helles Thema: dunkle Symbole')
})
