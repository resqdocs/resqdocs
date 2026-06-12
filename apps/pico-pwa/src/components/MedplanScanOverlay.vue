<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserDatamatrixCodeReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'

/**
 * Kamera-Overlay fuer den BMP-Scan (#36): reiner JS-Scanner (@zxing/browser,
 * Data Matrix) ueber getUserMedia - laeuft in iOS-WKWebView (ab 14.3),
 * Android-WebView, Huawei (kein Google-Dienst) und im Browser.
 * Netzwerk-Policy: ZXing dekodiert lokal, nichts verlaesst das Geraet.
 * Der dekodierte Roh-String wird nur emittiert, nie geloggt/gespeichert.
 */
const emit = defineEmits<{ decoded: [raw: string]; cancel: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
let controls: IScannerControls | null = null
let done = false

onMounted(async () => {
  try {
    const reader = new BrowserDatamatrixCodeReader()
    controls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: 'environment' } },
      video.value ?? undefined,
      (result) => {
        if (result && !done) {
          done = true
          emit('decoded', result.getText())
        }
      },
    )
  } catch {
    // Kein Kamera-Zugriff (verweigert/nicht vorhanden) - keine Details loggen.
    error.value = 'Kamera nicht verfügbar oder Zugriff verweigert.'
  }
})

onBeforeUnmount(() => {
  controls?.stop()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black">
    <video ref="video" class="min-h-0 w-full flex-1 object-cover" autoplay playsinline muted />
    <div class="flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
      <p v-else class="text-sm text-white/80">Data-Matrix-Code des Medikationsplans ins Bild halten …</p>
      <button class="btn btn-wide" type="button" @click="emit('cancel')">Abbrechen</button>
    </div>
  </div>
</template>
