<script setup lang="ts">
import { useStorage } from '@/storage/useStorage'
import { SCANNER_MODE_LABELS, NATIVE_SCANNER_AVAILABLE, type ScannerMode } from '@/medplan/scannerMode'

/**
 * Scanner-Modus (#170) - Test-/Vergleichseinstellung fuer den BMP-Data-Matrix-Scan.
 * Zentrale Quelle der Strategie; der Kamera-Schnellumschalter aendert genau diesen
 * Wert. „Native ZXing-C++" ist aktuell deaktiviert (noch nicht verfuegbar).
 * Datenschutz: rein lokale Auswahl, kein Netz/Telemetrie.
 */
const storage = useStorage()

function onChange(e: Event): void {
  storage.settings.scannerMode = (e.target as HTMLSelectElement).value as ScannerMode
  void storage.saveSettings()
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">Scanner-Modus (BMP-Data-Matrix)</h3>
      <p class="text-sm text-base-content/70">
        Strategie für den Medikationsplan-Scan. Für Vergleichstests umschaltbar; „Automatisch"
        ist der Standard.
      </p>
      <select class="select select-bordered select-sm w-full max-w-xs" :value="storage.settings.scannerMode" @change="onChange">
        <option value="auto">{{ SCANNER_MODE_LABELS.auto }}</option>
        <option value="webview_standard">{{ SCANNER_MODE_LABELS.webview_standard }}</option>
        <option value="webview_optimized">{{ SCANNER_MODE_LABELS.webview_optimized }}</option>
        <option value="native_zxingcpp" :disabled="!NATIVE_SCANNER_AVAILABLE">
          {{ SCANNER_MODE_LABELS.native_zxingcpp }}{{ NATIVE_SCANNER_AVAILABLE ? '' : ' — noch nicht verfügbar' }}
        </option>
      </select>
      <p class="text-xs text-base-content/60">
        „WebView Standard" = bisheriger Scanner, „WebView optimiert" = mit Tuning (schnelleres
        Decodieren, höhere Auflösung, Fokus). Im Scanner selbst gibt es zusätzlich einen
        Schnellumschalter. Es werden keine Bilddaten gespeichert oder übertragen.
      </p>
    </div>
  </section>
</template>
