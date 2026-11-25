// systemBars.ts — Farbe hinter den Android-Systemleisten (Statusleiste oben, Gestenleiste unten).
//
// Android zeichnet die App randlos. Gibt die System-WebView die Ränder noch nicht an die Seite weiter (ältere
// Fassungen), legt Capacitor einen Rand um die WebView, und darin sieht man den Hintergrund des Fensters. Der
// folgt von Haus aus dem Systemthema (res/values(-night)/colors.xml). Die App meldet deshalb nach, was die Seite
// an ihrem oberen und an ihrem unteren Rand gerade zeigt: im Normalfall Kopfzeile und Tab-Leiste (base-100), bei
// einem Fenster über den ganzen Bildschirm dessen Farbe (z. B. die Einführung in base-200), bei einem abgedunkelten
// Fenster die abgedunkelte Farbe. So stehen oben und unten nie andersfarbige Balken. Nur Android; iOS zeichnet die
// Seite selbst bis an den Rand.
//
// iOS hat dafür ein anderes Thema: Was das System selbst zeichnet (Fläche hinter der WebView, Statusleiste,
// Tastatur) und was die WebView auf `prefers-color-scheme` antwortet, folgt dem Fenster der App. Die App meldet
// deshalb die gewählte Erscheinung (Hell, Dunkel, System) an dasselbe Plugin, das dort das Fenster umstellt
// (syncAppearance, AppChromePlugin.swift). Jede Plattform hat ihre eigene Methode; keine behandelt die andere mit.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { composite, isDarkColor, toHex, type Rgba } from './systemBarsColor'
import { appearanceToSync, type AppearanceTheme } from './appearanceRules'

interface ResQChromePlugin {
  /** Android: Farbe hinter der Statusleiste (color) und hinter der Gestenleiste (bottomColor). */
  setColor(options: { color: string; dark: boolean; bottomColor: string; bottomDark: boolean }): Promise<void>
  /** iOS: Erscheinung des Fensters (Hell, Dunkel oder dem System folgen). */
  setAppearance(options: { theme: AppearanceTheme }): Promise<void>
}
const ResQChrome = registerPlugin<ResQChromePlugin>('ResQChrome')

type Rgb = [number, number, number]

// Jede CSS-Farbe (auch oklch, auch mit Deckkraft) über ein 1-Pixel-Canvas in Farbanteile wandeln. Gemerkt je
// Schreibweise: Die Seite kennt nur wenige Farben, gefragt wird bei jeder Änderung an der Oberfläche.
const colorCache = new Map<string, Rgba | null>()
function rgbaOf(cssColor: string): Rgba | null {
  const known = colorCache.get(cssColor)
  if (known !== undefined) return known
  let value: Rgba | null = null
  try {
    if (cssColor && cssColor !== 'transparent' && CSS.supports('color', cssColor)) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = cssColor
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        value = [r, g, b, a / 255]
      }
    }
  } catch {
    value = null
  }
  colorCache.set(cssColor, value)
  return value
}

/** Was die Seite an einer Stelle zeigt: die Hintergründe aller Elemente dort, übereinandergelegt. */
function colorAt(x: number, y: number, base: Rgb): Rgb {
  const layers: Rgba[] = []
  const stack = document.elementsFromPoint(x, y)
  for (let i = stack.length - 1; i >= 0; i--) {
    const c = rgbaOf(getComputedStyle(stack[i]).backgroundColor)
    if (c) layers.push(c)
  }
  return composite(base, layers)
}

/** Farbe am oberen und am unteren Rand der Seite (Mitte der Breite); null, solange das Thema keine Farbe liefert. */
export function edgeColors(): { top: Rgb; bottom: Rgb } | null {
  const base = rgbaOf(getComputedStyle(document.documentElement).getPropertyValue('--color-base-100').trim())
  if (!base) return null
  const ground: Rgb = [base[0], base[1], base[2]]
  const x = Math.floor(window.innerWidth / 2)
  return { top: colorAt(x, 1, ground), bottom: colorAt(x, Math.max(1, window.innerHeight - 2), ground) }
}

// Nach dem Ein- oder Ausblenden eines Fensters noch einmal nachsehen: Währenddessen steht die Farbe noch nicht fest.
const SETTLE_MS = 350
let lastSent = ''
let watching = false
let frame = 0
let settle = 0

function scheduleSync(): void {
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0
      syncSystemBars()
    })
  }
  window.clearTimeout(settle)
  settle = window.setTimeout(syncSystemBars, SETTLE_MS)
}

/** Änderungen an der Oberfläche beobachten (Fenster öffnet oder schließt, Tab wechselt). Einmal je App-Start. */
function watchSurface(): void {
  if (watching) return
  watching = true
  new MutationObserver(scheduleSync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open', 'hidden', 'style'] })
  window.addEventListener('resize', scheduleSync)
}

/** Android: melden, was die Seite an ihren Rändern zeigt, und von da an jede Änderung nachführen. Wirft nicht. */
export function syncSystemBars(): void {
  if (Capacitor.getPlatform() !== 'android') return
  watchSurface()
  const edges = edgeColors()
  if (!edges) return
  const color = toHex(...edges.top)
  const bottomColor = toHex(...edges.bottom)
  if (color + bottomColor === lastSent) return
  lastSent = color + bottomColor
  void ResQChrome.setColor({ color, dark: isDarkColor(...edges.top), bottomColor, bottomDark: isDarkColor(...edges.bottom) }).catch(() => {
    /* ältere App-Hülle ohne das Plugin: der Standard aus dem Android-Thema bleibt */
    lastSent = ''
  })
}

/** iOS: Fenster der App auf die gewählte Erscheinung stellen. Erst nach dem Laden der Einstellungen: Vorher gilt,
 *  was der native Start aus den gespeicherten Einstellungen gesetzt hat. Wirft nicht. */
export function syncAppearance(settingsLoaded: boolean, theme: unknown): void {
  if (Capacitor.getPlatform() !== 'ios') return
  const value = appearanceToSync(settingsLoaded, theme)
  if (!value) return
  void ResQChrome.setAppearance({ theme: value }).catch(() => {
    /* ältere App-Hülle ohne das Plugin: das Fenster folgt weiter dem System */
  })
}
