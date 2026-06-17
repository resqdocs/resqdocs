<script setup lang="ts">
import { useStorage } from '@/storage/useStorage'
import { SCANNER_MODE_LABELS, type ScannerMode } from '@/medplan/scannerMode'
import { nativeDatamatrixScanAvailable } from '@/medplan/nativeDatamatrixScan'

/**
 * Scanner-Modus (#170) - Auswahl der Scan-Strategie fuer den BMP-Data-Matrix-Scan.
 * Zentrale Quelle der Strategie; der Kamera-Schnellumschalter aendert genau diesen Wert.
 * Datenschutz: rein lokale Auswahl, kein Netz/Telemetrie.
 */
const storage = useStorage()
// #170: Der native, kameranative Scanner (Android: ZXing-C++, iOS: Apple Vision) ist in der App der
// Default ('Automatisch'); Web nutzt den WebView-Scanner. Beide nativen Pfade sind geraeteverifiziert
// und umgehen die WebView-Kamera.
const nativeAvailable = nativeDatamatrixScanAvailable()

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
        <option value="native_zxingcpp" :disabled="!nativeAvailable">
          {{ SCANNER_MODE_LABELS.native_zxingcpp }}{{ nativeAvailable ? '' : ' — nur in der App (Android/iOS)' }}
        </option>
      </select>
      <p class="text-xs text-base-content/60">
        „Automatisch" nutzt in der App jetzt den nativen Decoder (kameranativ, ohne den
        WebView-Kamera-Crash) — Android wie iOS. „WebView Standard/optimiert" bleiben als
        Fallback wählbar. Es werden keine Bilddaten gespeichert oder übertragen.
      </p>
    </div>
  </section>
</template>
