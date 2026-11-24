// Wächter: Startbild. Beim Start steht die Marke der App mittig auf der Farbe der App, hell und dunkel, auf beiden
// Plattformen; zwischen Startbild und erstem Bild der App blitzt keine fremde Farbe auf. Vorher zeigten iOS und
// Android das Vorlagenbild von Capacitor (blaues Zeichen auf Weiß, ohne dunkle Fassung).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compose, SPLASH, targets } from '../../scripts/make-splash.mjs'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
const res = 'android/app/src/main/res'
const assets = 'ios/App/App/Assets.xcassets'

/** base-100 eines Themas aus style.css, klein geschrieben. */
function base100(theme: string): string {
  const css = read('src/style.css')
  const block = css.slice(css.indexOf(`name: "${theme}";`))
  return (block.match(/--color-base-100:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? '').toLowerCase()
}
/** Breite und Höhe einer PNG-Datei (IHDR). */
function pngSize(file: string): [number, number] {
  const b = readFileSync(join(app, file))
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

test('Farben des Startbilds = base-100 der beiden Themen', () => {
  assert.equal(SPLASH.light.bg.toLowerCase(), base100('resqdocs'))
  assert.equal(SPLASH.dark.bg.toLowerCase(), base100('resqdocs-dark'))
  // Dieselben Marken wie in der Kopfzeile der App.
  assert.equal(SPLASH.light.mark, 'public/brand.svg')
  assert.equal(SPLASH.dark.mark, 'public/brand-dark.svg')
})

test('alle Bilder liegen vor, in den Maßen des Skripts, hell und dunkel', () => {
  const list = targets()
  assert.equal(list.length, 26)
  assert.equal(list.filter((t) => t.mode === 'dark').length, 13)
  for (const t of list) {
    assert.ok(existsSync(join(app, t.file)), `fehlt: ${t.file} (node scripts/make-splash.mjs)`)
    const [w, h] = pngSize(t.file)
    assert.equal(w, t.w, t.file)
    if (t.h) assert.equal(h, t.h, t.file)
    else assert.ok(Math.abs(w / h - 3493.81 / 1071.46) < 0.03, `${t.file}: Marke unverzerrt`)
  }
})

test('Marke wird mittig und unverzerrt gesetzt', () => {
  const svg = compose('<?xml version="1.0"?>\n<svg id="x" viewBox="0 0 300 100"><path d="M0 0"/></svg>', { w: 1000, h: 600, markW: 300, bg: '#141B30' })
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1000" height="600" viewBox="0 0 1000 600">/)
  assert.match(svg, /<rect width="1000" height="600" fill="#141B30"\/>/)
  assert.match(svg, /<svg x="350" y="250" width="300" height="100" viewBox="0 0 300 100">/)
  assert.doesNotMatch(compose('<svg viewBox="0 0 300 100"></svg>', { w: 10, h: 10, markW: 6, bg: '' }), /<rect/, 'ohne Farbe: durchsichtig')
})

test('Android vor 12: Fensterhintergrund des Start-Themas = Farbe der App mit unverzerrter Marke', () => {
  const styles = read(`${res}/values/styles.xml`)
  const launch = styles.slice(styles.indexOf('<style name="AppTheme.NoActionBarLaunch"'))
  assert.match(launch, /^<style name="AppTheme\.NoActionBarLaunch" parent="AppTheme\.NoActionBar">\s*<item name="android:windowBackground">@drawable\/splash<\/item>\s*<\/style>/)
  const splash = read(`${res}/drawable/splash.xml`)
  assert.match(splash, /<item android:drawable="@color\/appChrome" \/>/)
  assert.match(splash, /<bitmap android:gravity="center" android:src="@drawable\/splash_logo" \/>/)
  // Die Farbe folgt dem Systemthema (values und values-night), siehe systemBars.test.ts.
  assert.match(read(`${res}/values/colors.xml`), /<color name="appChrome">#FFFFFF<\/color>/)
  assert.match(read(`${res}/values-night/colors.xml`), /<color name="appChrome">#141B30<\/color>/)
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:name="\.MainActivity"[\s\S]*?android:theme="@style\/AppTheme\.NoActionBarLaunch"/)
})

test('Android: kein Vorlagenbild von Capacitor mehr', () => {
  const dirs = readdirSync(join(app, res)).filter((d: string) => d.startsWith('drawable'))
  const old = dirs.filter((d: string) => existsSync(join(app, res, d, 'splash.png')))
  assert.deepEqual(old, [])
  assert.deepEqual(dirs.filter((d: string) => /-(port|land)-/.test(d)), [], 'keine gestreckten Vollbilder je Ausrichtung')
})

test('Android ab 12: System-Startbild über Attribute der Plattform, ohne core-splashscreen', () => {
  const v31 = read(`${res}/values-v31/styles.xml`)
  assert.match(v31, /<style name="AppTheme\.NoActionBarLaunch" parent="AppTheme\.NoActionBar">/)
  assert.match(v31, /<item name="android:windowSplashScreenBackground">@color\/appChrome<\/item>/)
  assert.match(v31, /<item name="android:windowSplashScreenAnimatedIcon">@drawable\/splash_icon<\/item>/)
  assert.match(v31, /<item name="android:windowBackground">@drawable\/splash<\/item>/)
  const xml = (f: string): string => read(f).replace(/<!--[\s\S]*?-->/g, '')
  for (const f of [`${res}/values/styles.xml`, `${res}/values-v31/styles.xml`]) {
    assert.doesNotMatch(xml(f), /Theme\.SplashScreen|postSplashScreenTheme|windowSplashScreenAnimationDuration/, `${f}: nichts aus der Bibliothek`)
  }
  assert.match(read('android/app/build.gradle'), /exclude group: 'androidx\.core', module: 'core-splashscreen'/)
  // Symbol: 288 dp, Marke innerhalb des sichtbaren Kreises von 192 dp.
  assert.equal(SPLASH.iconDp, 288)
  const half = (SPLASH.iconMarkDp * 1071.46) / 3493.81 / 2
  assert.ok(Math.hypot(SPLASH.iconMarkDp / 2, half) <= 96, 'die Ecken der Marke liegen im Kreis')
})

test('iOS: Farbfläche mit kleiner Marke in der Mitte, hell und dunkel, unter neuem Namen', () => {
  // Marke als eigenes, kleines Bild (transparent), je Auflösung hell und dunkel.
  const set = JSON.parse(read(`${assets}/Startmarke.imageset/Contents.json`)) as { images: { filename: string; scale: string; appearances?: { appearance: string; value: string }[] }[] }
  assert.equal(set.images.length, 6)
  for (const scale of ['1x', '2x', '3x']) {
    const both = set.images.filter((i) => i.scale === scale)
    assert.equal(both.length, 2, scale)
    const dark = both.find((i) => i.appearances)
    const light = both.find((i) => !i.appearances)
    assert.deepEqual(dark?.appearances, [{ appearance: 'luminosity', value: 'dark' }])
    assert.equal(dark?.filename, `startmarke-dunkel@${scale}.png`)
    assert.equal(light?.filename, `startmarke@${scale}.png`)
    for (const i of both) assert.deepEqual(pngSize(`${assets}/Startmarke.imageset/${i.filename}`)[0], SPLASH.iosMarkPt * Number(scale[0]), i.filename)
  }
  assert.equal(SPLASH.iosMarkPt, 220)
  // Kein bildfüllendes Großbild mehr: iOS lud es im Startbild nicht zuverlässig (schwarzes Startbild am Gerät).
  assert.ok(!existsSync(join(app, assets, 'Splash.imageset')), 'altes Bild-Set entfernt')
  const big = readdirSync(join(app, assets, 'Startmarke.imageset')).filter((f: string) => f.endsWith('.png') && pngSize(`${assets}/Startmarke.imageset/${f}`)[0] > 1000)
  assert.deepEqual(big, [])

  const color = JSON.parse(read(`${assets}/SplashBackground.colorset/Contents.json`)) as { colors: { appearances?: unknown; color: { components: Record<string, string> } }[] }
  const hex = (c: Record<string, string>): string => '#' + [c.red, c.green, c.blue].map((v) => v.replace('0x', '')).join('').toLowerCase()
  assert.equal(hex(color.colors.find((c) => !c.appearances)!.color.components), base100('resqdocs'))
  assert.equal(hex(color.colors.find((c) => c.appearances)!.color.components), base100('resqdocs-dark'))

  // Startbild: Wurzel ist eine Fläche in der benannten Farbe, darin die Marke, per Auto Layout mittig.
  const board = read('ios/App/App/Base.lproj/Startbild.storyboard')
  assert.match(board, /launchScreen="YES"/)
  const root = board.match(/<view key="view"[^>]*\bid="([^"]+)"/)?.[1]
  assert.ok(root, 'Wurzel ist eine einfache Fläche, kein Bild')
  assert.doesNotMatch(board, /<imageView key="view"/)
  assert.match(board, /<color key="backgroundColor" name="SplashBackground"\/>/)
  assert.match(board, /<namedColor name="SplashBackground">/)
  assert.match(board, /<capability name="Named colors" minToolsVersion="9\.0"\/>/)
  const image = board.match(/<imageView\b[^>]*>/)?.[0] ?? ''
  assert.match(image, /image="Startmarke"/)
  assert.match(image, /translatesAutoresizingMaskIntoConstraints="NO"/)
  assert.match(image, /contentMode="scaleAspectFit"/)
  const mark = image.match(/\bid="([^"]+)"/)?.[1]
  for (const axis of ['centerX', 'centerY']) {
    assert.match(board, new RegExp(`<constraint firstItem="${mark}" firstAttribute="${axis}" secondItem="${root}" secondAttribute="${axis}" id="[^"]+"/>`), axis)
  }
  assert.match(board, /<image name="Startmarke" width="220" height="67"\/>/)
  assert.doesNotMatch(board, /systemBackgroundColor|image="Splash"/)
  // Jede Kennung im Storyboard gibt es nur einmal.
  const ids = [...board.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length)
  // Der Name ist neu (iOS speichert das Startbild je Name zwischen); Verweise: iosProjekt.test.ts.
  assert.match(read('ios/App/App/Info.plist'), /<key>UILaunchStoryboardName<\/key>\s*<string>Startbild<\/string>/)
})

test('kein Aufblitzen danach: Grund der WebView und der Seite in der Farbe der App', () => {
  const cfg = read('capacitor.config.ts').replace(/\/\/.*$/gm, '')
  // Android: WebView durchsichtig, dahinter der Fensterhintergrund in App-Farbe (hell und dunkel).
  assert.match(cfg, /android: \{\s*backgroundColor: '#00000000',?\s*\}/)
  assert.doesNotMatch(cfg.replace(/android: \{[^}]*\}/, ''), /backgroundColor/, 'kein fester Wert für beide Plattformen')
  // iOS: Farbe des Startbilds im nativen Code, weil sie hell und dunkel verschieden ist.
  const delegate = read('ios/App/App/AppDelegate.swift')
  assert.match(delegate, /if let splash = UIColor\(named: "SplashBackground"\) \{\s*webView\?\.backgroundColor = splash\s*webView\?\.scrollView\.backgroundColor = splash\s*\}/)
  // Seite: Farbe vor dem ersten Skript, nur bis die App ihr Thema setzt.
  const html = read('index.html')
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  assert.match(style, new RegExp(`html:not\\(\\[data-theme\\]\\) \\{ background-color: ${base100('resqdocs')}; \\}`))
  assert.match(style, new RegExp(`@media \\(prefers-color-scheme: dark\\) \\{\\s*html:not\\(\\[data-theme\\]\\) \\{ background-color: ${base100('resqdocs-dark')}; \\}`))
  assert.ok(html.indexOf('<style>') < html.indexOf('<script'), 'vor dem Skript')
})
