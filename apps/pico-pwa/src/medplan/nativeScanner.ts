// nativeScanner.ts - Bruecke zum nativen Vollbild-Scanner (Plugin "ResQScanner").
//
// Android: CameraX + ZXing-C++ (apps/pico-pwa/android/.../scanner); iOS: AVFoundation + ZXing-C++
// (apps/pico-pwa/ios/App/App/Scanner). Beide lesen dieselben Profile aus scanProfiles.ts.
//
// Datenschutz: Das Plugin gibt nur den gelesenen Inhalt zurueck, nie Bilder. Den Inhalt hier NICHT loggen.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { decodeScanBytes, normalizeScanFormat, type ScanCharset, type ScanProfile, type ScanResultFormat } from './scanProfiles.ts'
import { ownScreenGate } from '../backup/autoBackupTrigger.ts'

/** Ein Code aus der Liste des Mehrfach-Modus, wie ihn das Plugin liefert. */
export interface PluginScanItem {
  format: string
  bytesBase64: string
  text: string
}

/**
 * Antwort des Plugins. `items` kommt nur mit Schalter bzw. im Mehrfach-Modus (alle Codes in Scan-Reihenfolge,
 * auch der erste; format/bytesBase64/text auf oberster Ebene sind die des ersten), `multiOn` nur mit Schalter.
 */
export type PluginResult =
  | { status: 'found'; format: string; bytesBase64: string; text: string; diag?: string; items?: PluginScanItem[]; multiOn?: boolean }
  | { status: 'cancelled'; diag?: string; multiOn?: boolean }
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

/** Optionen des Plugin-Aufrufs scan(). Die Felder ab `multi` gibt es nur mit Mehrfach-Schalter. */
export interface PluginScanOptions {
  formats: string[]
  decoder: ScanProfile['decoder']
  codeSizeMm: number
  startZoomDelayMs: number
  title: string
  hint: string
  cancelLabel: string
  torchLabel: string
  showDiagnostics: boolean
  theme?: ScannerTheme
  /** Anfangsstellung des Schalters fuer den Mehrfach-Modus. */
  multi?: boolean
  /** Beschriftung des Schalters im Kamerabild; mit ihr zeigt der Scanner den Schalter. */
  multiToggleLabel?: string
  doneLabel?: string
  countOne?: string
  /** Platzhalter {n} = Anzahl. */
  countMany?: string
  duplicateLabel?: string
  /** PZN (8-stellig), die schon in der Liste stehen. */
  known?: string[]
}

interface ResQScannerPlugin {
  scan(options: PluginScanOptions): Promise<PluginResult>
}

const ResQScanner = registerPlugin<ResQScannerPlugin>('ResQScanner')

/**
 * Mehrfach-Scan: Schalter im Kamerabild. An = der Bildschirm bleibt offen und sammelt Codes; doppelte
 * (gleiche PZN wie in `known` oder in dieser Sitzung) nimmt er nicht auf und zeigt `duplicateLabel`.
 */
export interface NativeMultiScanOptions {
  /** Anfangsstellung des Schalters. */
  on: boolean
  toggleLabel: string
  doneLabel: string
  countOne: string
  /** Platzhalter {n} = Anzahl. */
  countMany: string
  duplicateLabel: string
  /** PZN (8-stellig), die schon in der Liste stehen. */
  known: string[]
}

export interface NativeScanOptions {
  showDiagnostics?: boolean
  multi?: NativeMultiScanOptions
}

/** Ein Code aus dem Mehrfach-Scan, dekodiert wie das Einzelergebnis. */
export interface NativeScanItem {
  raw: string
  format: ScanResultFormat
}

/**
 * Ergebnis der Bruecke. Mit `multi` traegt `found` zusaetzlich `items` (alle Codes in Scan-Reihenfolge, auch
 * der erste; raw/format auf oberster Ebene sind die des ersten) und `multiOn` (letzte Schalterstellung);
 * `cancelled` traegt dann ebenfalls `multiOn`.
 */
export type NativeScanOutcome =
  | { status: 'found'; raw: string; format: ScanResultFormat; diag: string; items?: NativeScanItem[]; multiOn?: boolean }
  | { status: 'cancelled'; diag: string; multiOn?: boolean }
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

/**
 * Optionen fuer den Plugin-Aufruf. Ohne `opts.multi` entstehen genau die bisherigen Felder; mit `multi`
 * kommen Anfangsstellung, Schalter-Beschriftung, Texte und die bekannten PZN dazu.
 */
export function buildPluginScanOptions(profile: ScanProfile, opts: NativeScanOptions, theme: ScannerTheme | undefined): PluginScanOptions {
  const options: PluginScanOptions = {
    formats: profile.formats,
    decoder: profile.decoder,
    codeSizeMm: profile.codeSizeMm,
    startZoomDelayMs: profile.startZoomDelayMs ?? 0,
    title: profile.title,
    hint: profile.hint,
    cancelLabel: 'Abbrechen',
    torchLabel: 'Licht',
    showDiagnostics: opts.showDiagnostics ?? false,
    theme,
  }
  const multi = opts.multi
  if (!multi) return options
  return {
    ...options,
    multi: multi.on,
    multiToggleLabel: multi.toggleLabel,
    doneLabel: multi.doneLabel,
    countOne: multi.countOne,
    countMany: multi.countMany,
    duplicateLabel: multi.duplicateLabel,
    known: multi.known,
  }
}

/**
 * Antwort des Plugins -> Ergebnis der Bruecke. `items` und `multiOn` werden nur uebernommen, wenn das Plugin
 * sie liefert; jeder Eintrag wird wie das Einzelergebnis dekodiert (Zeichensatz des Profils, neutrales Format).
 */
export function mapPluginResult(r: PluginResult, charset: ScanCharset): NativeScanOutcome {
  switch (r.status) {
    case 'found': {
      const outcome: NativeScanOutcome = {
        status: 'found',
        raw: decodeScanBytes(r.bytesBase64, charset),
        format: normalizeScanFormat(r.format),
        diag: r.diag ?? '',
      }
      if (Array.isArray(r.items)) {
        outcome.items = r.items.map((item) => ({ raw: decodeScanBytes(item.bytesBase64, charset), format: normalizeScanFormat(item.format) }))
      }
      if (typeof r.multiOn === 'boolean') outcome.multiOn = r.multiOn
      return outcome
    }
    case 'cancelled': {
      const outcome: NativeScanOutcome = { status: 'cancelled', diag: r.diag ?? '' }
      if (typeof r.multiOn === 'boolean') outcome.multiOn = r.multiOn
      return outcome
    }
    case 'denied':
      return { status: 'denied' }
    default:
      return { status: 'error', message: r.code === 'camera' ? 'Kamera konnte nicht gestartet werden' : 'Scan fehlgeschlagen', diag: r.diag ?? '' }
  }
}

/** Startet den nativen Scanner mit einem Profil. Wirft nicht. */
export async function scanNative(profile: ScanProfile, opts: NativeScanOptions = {}): Promise<NativeScanOutcome> {
  let r: PluginResult
  // Der Scanner ist ein eigener Vollbild-Screen (Android: eigene Activity). Solange er offen ist, darf die
  // automatische Sicherung nicht anlaufen, sonst warten die PZN-Abfragen nach dem Scan auf sie.
  const release = ownScreenGate.hold()
  try {
    r = await ResQScanner.scan(buildPluginScanOptions(profile, opts, scannerTheme()))
  } catch (e) {
    return { status: 'error', message: (e as Error)?.message || 'Scanner nicht verfügbar', diag: '' }
  } finally {
    release()
  }
  return mapPluginResult(r, profile.charset)
}
