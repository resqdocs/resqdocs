// Scanner-Modus - zentrale Auswahl der Scan-Strategie.
//
// Gilt nur im Browser: Vergleich WebView-Standard vs. WebView-optimiert. In der App (Android, iOS)
// laeuft immer der native Scanner (ZXing-C++), siehe CodeScanOverlay.vue.
// Default ist der stabile WebView-Standard-Scan. Datenschutz: reine lokale Auswahl,
// kein Netz/Telemetrie.

export type ScannerMode = 'webview_standard' | 'webview_optimized' | 'native_zxingcpp'

/** Auswaehlbare Modi in UI-Reihenfolge. */
export const SCANNER_MODES: ScannerMode[] = ['webview_standard', 'webview_optimized', 'native_zxingcpp']

/** Konkret nutzbare Strategie. */
export type EffectiveScannerMode = 'webview_standard' | 'webview_optimized' | 'native_zxingcpp'

/** Default ohne Plattformwissen: nicht verfuegbar. Die Overlays uebergeben nativeScannerAvailable(). */
export const NATIVE_SCANNER_AVAILABLE = false

/**
 * Loest den gewaehlten Modus auf eine konkret nutzbare Strategie auf.
 * - 'native_zxingcpp' ohne Verfuegbarkeit -> Fallback webview_optimized (kein Rueckweg-Verlust).
 * - 'webview_*'       -> unveraendert.
 * - unbekannt/legacy  -> webview_standard (stabiler Default; faengt z. B. das entfernte 'auto' ab).
 */
export function effectiveScannerMode(
  mode: ScannerMode,
  nativeAvailable: boolean = NATIVE_SCANNER_AVAILABLE,
): EffectiveScannerMode {
  switch (mode) {
    case 'webview_standard': return 'webview_standard'
    case 'webview_optimized': return 'webview_optimized'
    case 'native_zxingcpp': return nativeAvailable ? 'native_zxingcpp' : 'webview_optimized'
    default: return 'webview_standard'
  }
}

/** Deutsche Labels fuer die Einstellungs-UI. */
export const SCANNER_MODE_LABELS: Record<ScannerMode, string> = {
  webview_standard: 'WebView Standard',
  webview_optimized: 'WebView optimiert',
  native_zxingcpp: 'Nativ (eigener Kamerabildschirm)', // Android: CameraX, iOS: AVFoundation; beide ZXing-C++
}
