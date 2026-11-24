#!/usr/bin/env node
// Startbilder für Android und iOS aus der Wort-Bild-Marke erzeugen: Marke mittig auf der Farbe der App,
// hell und dunkel. Ersetzt das Vorlagenbild von Capacitor.
//
//   node scripts/make-splash.mjs            alle Bilder neu schreiben
//   node scripts/make-splash.mjs --check    nur prüfen, ob Quellen und Werkzeug da sind (schreibt nichts)
//
// Quellen: public/brand.svg (hell) und public/brand-dark.svg (dunkel), dieselben Dateien wie in der Kopfzeile.
// Farben: base-100 der beiden Themen aus src/style.css (Wächter: src/shell/startbild.test.ts).
// Werkzeug: CairoSVG über pipx (`pipx run`), feste Fassung, kein Eintrag in package.json.
//
// Was entsteht:
//   Android  res/drawable(-night)-<dichte>/splash_logo.png   Marke allein, transparent; res/drawable/splash.xml
//            legt sie mittig auf @color/appChrome (unverzerrt bei jedem Seitenverhältnis).
//            res/drawable(-night)-<dichte>/splash_icon.png   Symbol des System-Startbilds ab Android 12
//            (288 dp, Marke innerhalb des sichtbaren Kreises von 192 dp).
//   iOS      Assets.xcassets/Startmarke.imageset/startmarke(-dunkel)@1x/2x/3x.png   Marke allein, transparent,
//            220 pt breit; Base.lproj/Startbild.storyboard legt sie mittig auf die benannte Farbe SplashBackground.
//            Bewusst klein: bildfüllende Großbilder (früher 2732 x 2732) lädt iOS im Startbild nicht zuverlässig.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..') // apps/pico-pwa
const CAIROSVG = 'cairosvg==2.9.1'

export const SPLASH = {
  light: { bg: '#FFFFFF', mark: 'public/brand.svg' },
  dark: { bg: '#141B30', mark: 'public/brand-dark.svg' },
  /** Android-Dichten: Pixel je dp. */
  densities: { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 },
  /** Breite der Marke im Startbild vor Android 12 (dp). */
  logoDp: 200,
  /** System-Startbild ab Android 12: Fläche des Symbols und Breite der Marke darin (dp). Sichtbar ist ein Kreis
   *  von 192 dp; die Marke (3,26 : 1) passt mit 176 dp Breite hinein. */
  iconDp: 288,
  iconMarkDp: 176,
  /** iOS: Breite der Marke im Startbild (pt), als @1x/@2x/@3x. */
  iosMarkPt: 220,
  iosScales: [1, 2, 3],
}

/** Marke (SVG-Text) in eine Fläche w x h setzen, mittig, `markW` breit; `bg` leer = transparent. */
export function compose(mark, { w, h, markW, bg }) {
  const box = mark.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!box) throw new Error('Marke ohne viewBox')
  const markH = (markW * Number(box[2])) / Number(box[1])
  const x = (w - markW) / 2
  const y = (h - markH) / 2
  const inner = mark
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg\b[^>]*>/, `<svg x="${x}" y="${y}" width="${markW}" height="${markH}" viewBox="0 0 ${box[1]} ${box[2]}">`)
  const back = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${back}${inner}</svg>`
}

/** Alle Zieldateien mit Maßen (Pfade relativ zu apps/pico-pwa). */
export function targets() {
  const out = []
  const res = 'android/app/src/main/res'
  const ios = 'ios/App/App/Assets.xcassets/Startmarke.imageset'
  for (const [mode, night] of [['light', ''], ['dark', '-night']]) {
    for (const [name, scale] of Object.entries(SPLASH.densities)) {
      const markW = Math.round(SPLASH.logoDp * scale)
      out.push({ mode, file: `${res}/drawable${night}-${name}/splash_logo.png`, w: markW, h: null, markW, bg: '' })
      const icon = Math.round(SPLASH.iconDp * scale)
      out.push({ mode, file: `${res}/drawable${night}-${name}/splash_icon.png`, w: icon, h: icon, markW: Math.round(SPLASH.iconMarkDp * scale), bg: '' })
    }
    const prefix = mode === 'dark' ? 'startmarke-dunkel' : 'startmarke'
    for (const scale of SPLASH.iosScales) {
      const markW = SPLASH.iosMarkPt * scale
      out.push({ mode, file: `${ios}/${prefix}@${scale}x.png`, w: markW, h: null, markW, bg: '' })
    }
  }
  return out
}

function main() {
  const check = process.argv.includes('--check')
  const marks = { light: readFileSync(join(root, SPLASH.light.mark), 'utf8'), dark: readFileSync(join(root, SPLASH.dark.mark), 'utf8') }
  const probe = spawnSync('pipx', ['run', '--spec', CAIROSVG, 'cairosvg', '--version'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    console.error('CairoSVG über pipx nicht verfügbar (pipx installieren: https://pipx.pypa.io).\n' + (probe.stderr || probe.error?.message || ''))
    process.exit(1)
  }
  const list = targets()
  if (check) {
    console.log(`${list.length} Bilder würden geschrieben, CairoSVG ${probe.stdout.trim()}`)
    return
  }
  const tmp = mkdtempSync(join(tmpdir(), 'resq-splash-'))
  try {
    for (const t of list) {
      const mark = marks[t.mode]
      const box = mark.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
      const h = t.h ?? Math.round((t.w * Number(box[2])) / Number(box[1]))
      const svg = join(tmp, 'bild.svg')
      writeFileSync(svg, compose(mark, { w: t.w, h, markW: t.markW, bg: t.bg }))
      const target = join(root, t.file)
      mkdirSync(dirname(target), { recursive: true })
      const run = spawnSync('pipx', ['run', '--spec', CAIROSVG, 'cairosvg', svg, '-o', target, '-W', String(t.w), '-H', String(h)], { encoding: 'utf8' })
      if (run.status !== 0) {
        console.error(`Fehler bei ${t.file}:\n${run.stderr}`)
        process.exit(1)
      }
      console.log(`${t.file}  ${t.w} x ${h}`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
