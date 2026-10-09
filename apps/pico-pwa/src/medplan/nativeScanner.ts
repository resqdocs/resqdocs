// nativeScanner.ts - Bruecke zum nativen Vollbild-Scanner (Plugin "ResQScanner").
//
// Android: CameraX + ZXing-C++ (apps/pico-pwa/android/.../scanner); iOS: AVFoundation + ZXing-C++
// (apps/pico-pwa/ios/App/App/Scanner). Beide lesen dieselben Profile aus scanProfiles.ts.
//
// Datenschutz: Das Plugin gibt nur den gelesenen Inhalt zurueck, nie Bilder. Den Inhalt hier NICHT loggen.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { decodeScanBytes, normalizeScanFormat, type ScanProfile, type ScanResultFormat } from './scanProfiles.ts'

type PluginResult =
  | { status: 'found'; format: string; bytesBase64: string; text: string; diag?: string }
  | { status: 'cancelled'; diag?: string }
  | { status: 'denied' }
  | { status: 'error'; code: string; diag?: string }

/** Farben des aktiven App-Themes als #rrggbb, damit der native Bildschirm aussieht wie der Rest der App. */
export interface ScannerTheme {
  base100: string
  base300: string
  baseContent: string
  primary: string
  primaryContent: string
}

interface ResQScannerPlugin {
  scan(options: {
    formats: string[]
    decoder: ScanProfile['decoder']
    codeSizeMm: number
    title: string
    hint: string
    cancelLabel: string
    torchLabel: string
    showDiagnostics: boolean
    theme?: ScannerTheme
  }): Promise<PluginResult>
}

const ResQScanner = registerPlugin<ResQScannerPlugin>('ResQScanner')

export type NativeScanOutcome =
  | { status: 'found'; raw: string; format: ScanResultFormat; diag: string }
  | { status: 'cancelled'; diag: string }
  | { status: 'denied' }
  | { status: 'error'; message: string; diag: string }

/**
 * CSS-Farbe -> #rrggbb ueber ein 1-Pixel-Canvas: daisyUI-Themes liefern teils oklch(), das kein
 * natives Color-Parsing versteht. Ungueltige/leere Werte -> null (der native Teil nimmt dann Defaults).
 */
function cssColorToHex(css: string): string | null {
  const value = css.trim()
  if (!value) return null
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const sentinel = '#010203'
  ctx.fillStyle = sentinel
  ctx.fillStyle = value
  if (ctx.fillStyle === sentinel) return null // vom Canvas nicht verstanden
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Aktive Theme-Farben (daisyUI-Variablen am <html>) fuer den nativen Scanner; undefined ausserhalb des DOM. */
export function scannerTheme(): ScannerTheme | undefined {
  if (typeof document === 'undefined') return undefined
  const style = getComputedStyle(document.documentElement)
  const read = (name: string): string | null => cssColorToHex(style.getPropertyValue(name))
  const base100 = read('--color-base-100')
  const base300 = read('--color-base-300')
  const baseContent = read('--color-base-content')
  const primary = read('--color-primary')
  const primaryContent = read('--color-primary-content')
  if (!base100 || !base300 || !baseContent || !primary || !primaryContent) return undefined
  return { base100, base300, baseContent, primary, primaryContent }
}

/** Nativer Scanner verfuegbar? In der App auf Android und iOS; im Browser nie. */
export function nativeScannerAvailable(): boolean {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios'
}

/** Startet den nativen Scanner mit einem Profil. Wirft nicht. */
export async function scanNative(profile: ScanProfile, opts: { showDiagnostics?: boolean } = {}): Promise<NativeScanOutcome> {
  let r: PluginResult
  try {
    r = await ResQScanner.scan({
      formats: profile.formats,
      decoder: profile.decoder,
      codeSizeMm: profile.codeSizeMm,
      title: profile.title,
      hint: profile.hint,
      cancelLabel: 'Abbrechen',
      torchLabel: 'Licht',
      showDiagnostics: opts.showDiagnostics ?? false,
      theme: scannerTheme(),
    })
  } catch (e) {
    return { status: 'error', message: (e as Error)?.message || 'Scanner nicht verfügbar', diag: '' }
  }
  switch (r.status) {
    case 'found':
      return { status: 'found', raw: decodeScanBytes(r.bytesBase64, profile.charset), format: normalizeScanFormat(r.format), diag: r.diag ?? '' }
    case 'cancelled':
      return { status: 'cancelled', diag: r.diag ?? '' }
    case 'denied':
      return { status: 'denied' }
    default:
      return { status: 'error', message: r.code === 'camera' ? 'Kamera konnte nicht gestartet werden' : 'Scan fehlgeschlagen', diag: r.diag ?? '' }
  }
}
