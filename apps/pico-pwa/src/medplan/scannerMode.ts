// Scanner-Modus (#170) - zentrale Auswahl der Scan-Strategie.
//
// Test-/Debug-orientiert fuer den Vergleich WebView-Standard vs. WebView-optimiert
// in EINEM Build; bewusst so strukturiert, dass spaeter ein nativer Decoder
// (ZXing-C++) als bevorzugte Option dazukommt und bei Problemen auf WebView
// zurueckgefallen wird. Datenschutz: reine lokale Auswahl, kein Netz/Telemetrie.

export type ScannerMode = 'auto' | 'webview_standard' | 'webview_optimized' | 'native_zxingcpp'

/** Auswaehlbare Modi in UI-Reihenfolge. */
export const SCANNER_MODES: ScannerMode[] = ['auto', 'webview_standard', 'webview_optimized', 'native_zxingcpp']

/** Konkret nutzbare Strategie (nie 'auto'). */
export type EffectiveScannerMode = 'webview_standard' | 'webview_optimized' | 'native_zxingcpp'

/** Nativer Scanner aktuell NICHT produktiv verfuegbar (nur Android-Spike). */
export const NATIVE_SCANNER_AVAILABLE = false

/**
 * Loest den gewaehlten Modus auf eine konkret nutzbare Strategie auf.
 * - 'auto'            -> bevorzugt nativ (sobald verfuegbar), sonst webview_optimized.
 * - 'native_zxingcpp' ohne Verfuegbarkeit -> Fallback webview_optimized (kein Rueckweg-Verlust).
 * - 'webview_*'       -> unveraendert.
 */
export function effectiveScannerMode(
  mode: ScannerMode,
  nativeAvailable: boolean = NATIVE_SCANNER_AVAILABLE,
): EffectiveScannerMode {
  switch (mode) {
    case 'webview_standard': return 'webview_standard'
    case 'webview_optimized': return 'webview_optimized'
    case 'native_zxingcpp': return nativeAvailable ? 'native_zxingcpp' : 'webview_optimized'
    case 'auto':
    default: return nativeAvailable ? 'native_zxingcpp' : 'webview_optimized'
  }
}

/** Deutsche Labels fuer die Einstellungs-UI. */
export const SCANNER_MODE_LABELS: Record<ScannerMode, string> = {
  auto: 'Automatisch',
  webview_standard: 'WebView Standard',
  webview_optimized: 'WebView optimiert',
  native_zxingcpp: 'Nativ (kameranativ)', // Android: ZXing-C++, iOS: Apple Vision
}
