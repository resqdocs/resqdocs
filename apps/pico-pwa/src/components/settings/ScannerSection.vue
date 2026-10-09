<script setup lang="ts">
import { useStorage } from '@/storage/useStorage'
import { SCANNER_MODE_LABELS, type ScannerMode } from '@/medplan/scannerMode'
import { nativeScannerAvailable } from '@/medplan/nativeScanner'

/**
 * Scanner-Modus - Auswahl der Scan-Strategie fuer den BMP-Data-Matrix-Scan.
 * Zentrale Quelle der Strategie; der Kamera-Schnellumschalter aendert genau diesen Wert.
 * Datenschutz: rein lokale Auswahl, kein Netz/Telemetrie.
 */
const storage = useStorage()
// 'Nativ' nutzt in der App den eigenen Vollbild-Scanner (Android: CameraX, iOS: AVFoundation; beide ZXing-C++).
// Nur im Browser bleibt der WebView-Scanner (dort wird die Auswahl angezeigt).
const nativeAvailable = nativeScannerAvailable()
// Die native Option gibt es nur in der App; im Browser ist sie deaktiviert.
const nativeHint = nativeAvailable ? '' : ' — nur in der App'

function onChange(e: Event): void {
  storage.settings.scannerMode = (e.target as HTMLSelectElement).value as ScannerMode
  void storage.saveSettings()
}

function onDiagnostics(e: Event): void {
  storage.settings.scannerDiagnostics = (e.target as HTMLInputElement).checked
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
      <template v-if="nativeAvailable">
        <p class="text-sm">
          In der App wird immer der eigene Kamerabildschirm genutzt (Zoom, Tippen zum Scharfstellen, Licht;
          gelesen mit ZXing-C++). Kamerabilder werden weder gespeichert noch übertragen.
        </p>
        <label class="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" class="checkbox checkbox-sm" :checked="storage.settings.scannerDiagnostics" @change="onDiagnostics" />
          <span class="text-sm">Technische Angaben im Scanner anzeigen (Kamera, Auflösung, Zoom, Versuche)</span>
        </label>
      </template>
      <select v-else class="select select-bordered select-sm w-full max-w-xs min-h-11" :value="storage.settings.scannerMode" @change="onChange">
        <option value="webview_standard">{{ SCANNER_MODE_LABELS.webview_standard }}</option>
        <option value="webview_optimized">{{ SCANNER_MODE_LABELS.webview_optimized }}</option>
        <option value="native_zxingcpp" :disabled="!nativeAvailable">
          {{ SCANNER_MODE_LABELS.native_zxingcpp }}{{ nativeHint }}
        </option>
      </select>
      <p v-if="!nativeAvailable" class="text-xs text-base-content/60">
        „WebView Standard" ist die stabile Voreinstellung (schlanker Scan im WebView).
        „Nativ" öffnet in der App einen eigenen Kamerabildschirm mit Zoom, Tippen zum Scharfstellen
        und Licht; gelesen wird mit ZXing-C++. Kamerabilder werden weder gespeichert noch übertragen.
      </p>
    </div>
  </section>
</template>
