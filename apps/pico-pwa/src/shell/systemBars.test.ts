// Wächter: Auf Android stehen oben und unten keine andersfarbigen Balken. Hinter den Systemleisten liegt die Farbe
// von Kopfzeile und Tab-Leiste (base-100): als Standard im Android-Thema (hell und dunkel), zur Laufzeit von der
// App nachgeführt, wenn das in der App gewählte Thema vom Systemthema abweicht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDarkColor, toHex } from './systemBarsColor.ts'

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
  assert.match(plugin, /isAppearanceLightNavigationBars = !dark/)
  // Capacitor setzt bei Konfigurationsänderungen die Themenfarbe zurück: danach erneut setzen.
  assert.match(plugin, /override fun handleOnConfigurationChanged[\s\S]*?decorView\.post \{ apply\(\) \}/)
  const code = plugin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(code, /setStatusBarColor|setNavigationBarColor|statusBarColor|navigationBarColor|setDecorFitsSystemWindows/, 'keine veralteten Edge-to-Edge-APIs (Play-Warnung)')
  assert.match(read('android/app/src/main/java/app/resqdocs/MainActivity.java'), /registerPlugin\(app\.resqdocs\.AppChromePlugin\.class\);/)
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
