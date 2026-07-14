<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useStorage } from '@/storage/useStorage'
import { SCANNER_MODE_LABELS, type ScannerMode } from '@/medplan/scannerMode'
import { nativeDatamatrixScanAvailable } from '@/medplan/nativeDatamatrixScan'

/**
 * Scanner-Modus (#170) - Auswahl der Scan-Strategie fuer den BMP-Data-Matrix-Scan.
 * Zentrale Quelle der Strategie; der Kamera-Schnellumschalter aendert genau diesen Wert.
 * Datenschutz: rein lokale Auswahl, kein Netz/Telemetrie.
 */
const storage = useStorage()
// #170: 'Nativ' nutzt in der App den kameranativen Scanner (nur Android: ZXing-C++). Web + iOS nutzen
// den WebView-Scanner. Erststart-Default ist 'WebView Standard' (stabiler); der native Pfad bleibt
// auf Android als explizite Alternative waehlbar. 'Automatisch' wurde entfernt.
const nativeAvailable = nativeDatamatrixScanAvailable()
// Grund fuer die deaktivierte Option plattformgerecht: iOS-Nativ derzeit nicht verfuegbar; im Web
// ueberhaupt nur in der App.
const nativeHint = nativeAvailable
  ? ''
  : Capacitor.getPlatform() === 'ios'
    ? ' — auf iPhone/iPad derzeit nicht verfügbar'
    : ' — nur in der App (Android)'

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
        Strategie für den Medikationsplan-Scan. Für Vergleichstests umschaltbar;
        „WebView Standard" ist die Voreinstellung.
      </p>
      <select class="select select-bordered select-sm w-full max-w-xs min-h-11" :value="storage.settings.scannerMode" @change="onChange">
        <option value="webview_standard">{{ SCANNER_MODE_LABELS.webview_standard }}</option>
        <option value="webview_optimized">{{ SCANNER_MODE_LABELS.webview_optimized }}</option>
        <option value="native_zxingcpp" :disabled="!nativeAvailable">
          {{ SCANNER_MODE_LABELS.native_zxingcpp }}{{ nativeHint }}
        </option>
      </select>
      <p class="text-xs text-base-content/60">
        „WebView Standard" ist die stabile Voreinstellung (schlanker Scan im WebView).
        „Nativ" nutzt auf Android die geräteeigene Kamera + nativen Decoder (ZXing-C++) —
        als Alternative wählbar, derzeit aber nicht zuverlässiger. Auf iPhone/iPad wird immer
        der WebView-Scanner verwendet. Es werden keine Bilddaten gespeichert oder übertragen.
      </p>
    </div>
  </section>
</template>
