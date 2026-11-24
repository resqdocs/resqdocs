// systemBars.ts — Farbe hinter den Android-Systemleisten (Statusleiste oben, Gestenleiste unten).
//
// Android zeichnet die App randlos. Gibt die System-WebView die Ränder noch nicht an die Seite weiter (ältere
// Fassungen), legt Capacitor einen Rand um die WebView, und darin sieht man den Hintergrund des Fensters. Der
// folgt von Haus aus dem Systemthema (res/values(-night)/colors.xml). Wählt jemand in der App ein anderes Thema,
// meldet die App die Farbe von Kopfzeile und Tab-Leiste (base-100) hier nach, damit oben und unten keine
// andersfarbigen Balken stehen. Nur Android; iOS zeichnet die Seite selbst bis an den Rand.
//
// iOS hat dafür ein anderes Thema: Was das System selbst zeichnet (Fläche hinter der WebView, Statusleiste,
// Tastatur) und was die WebView auf `prefers-color-scheme` antwortet, folgt dem Fenster der App. Die App meldet
// deshalb die gewählte Erscheinung (Hell, Dunkel, System) an dasselbe Plugin, das dort das Fenster umstellt
// (syncAppearance, AppChromePlugin.swift). Jede Plattform hat ihre eigene Methode; keine behandelt die andere mit.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isDarkColor, toHex } from './systemBarsColor'
import { appearanceToSync, type AppearanceTheme } from './appearanceRules'

interface ResQChromePlugin {
  /** Android: Farbe hinter den Systemleisten. */
  setColor(options: { color: string; dark: boolean }): Promise<void>
  /** iOS: Erscheinung des Fensters (Hell, Dunkel oder dem System folgen). */
  setAppearance(options: { theme: AppearanceTheme }): Promise<void>
}
const ResQChrome = registerPlugin<ResQChromePlugin>('ResQChrome')

/** Beliebige CSS-Farbe (auch oklch) über ein 1-Pixel-Canvas in Farbanteile wandeln; null, wenn das nicht geht. */
function rgbOf(cssColor: string): [number, number, number] | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillStyle = cssColor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b]
  } catch {
    return null
  }
}

/** Farbe von Kopfzeile und Tab-Leiste des gerade gesetzten Themas an Android melden. Wirft nicht. */
export function syncSystemBars(): void {
  if (Capacitor.getPlatform() !== 'android') return
  const base = getComputedStyle(document.documentElement).getPropertyValue('--color-base-100').trim()
  const rgb = base ? rgbOf(base) : null
  if (!rgb) return
  void ResQChrome.setColor({ color: toHex(...rgb), dark: isDarkColor(...rgb) }).catch(() => {
    /* ältere App-Hülle ohne das Plugin: der Standard aus dem Android-Thema bleibt */
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
