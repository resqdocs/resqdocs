<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType, type Result } from '@zxing/library'
import { useStorage } from '@/storage/useStorage'
import { effectiveScannerMode } from '@/medplan/scannerMode'
import type { PackageBarcodeFormat } from '@/medications/packageScan'

/**
 * Packungs-Scan-Overlay (#167): EINE Medikamentenpackung scannen. Getrennt vom
 * BMP-Scanner (MedplanScanOverlay), damit der BMP-Pfad unangetastet bleibt.
 * Multi-Format-Reader, aber bewusst NUR Code 39 + Data Matrix (POSSIBLE_FORMATS).
 * Optik/Steuerung identisch zu #172 (Rahmen, X, Standard/Optimiert, Torch, theme-treu).
 * Netzwerk-Policy: ZXing dekodiert lokal; der Roh-String wird nur emittiert, nie
 * geloggt/gespeichert. Die PZN-Extraktion (datensparsam) passiert beim Aufrufer.
 */
const emit = defineEmits<{ decoded: [payload: { text: string; format: PackageBarcodeFormat }]; cancel: [] }>()

const SLOW_HINT_MS = 8000

const storage = useStorage()
const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
const torchSupported = ref(false)
const torchOn = ref(false)
const slowHint = ref(false)
const activeMode = ref<'webview_standard' | 'webview_optimized'>('webview_optimized')
let controls: IScannerControls | null = null
let done = false
let slowTimer: ReturnType<typeof setTimeout> | undefined

function packageHints(tryHarder: boolean): Map<DecodeHintType, unknown> {
  const h = new Map<DecodeHintType, unknown>()
  h.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX])
  if (tryHarder) h.set(DecodeHintType.TRY_HARDER, true)
  return h
}

function mapFormat(f: BarcodeFormat): PackageBarcodeFormat {
  if (f === BarcodeFormat.CODE_39) return 'code39'
  if (f === BarcodeFormat.DATA_MATRIX) return 'datamatrix'
  return 'unknown'
}

function applyContinuousFocus(): void {
  const stream = video.value?.srcObject
  if (!(stream instanceof MediaStream)) return
  const track = stream.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() as unknown as { focusMode?: string[] } | undefined
  if (caps?.focusMode?.includes('continuous')) {
    const c = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    void track.applyConstraints(c).catch(() => {})
  }
}

async function startScanner(): Promise<void> {
  error.value = null
  const eff = effectiveScannerMode(storage.settings.scannerMode)
  const optimized = eff === 'webview_optimized'
  activeMode.value = optimized ? 'webview_optimized' : 'webview_standard'
  try {
    const reader = optimized
      ? new BrowserMultiFormatReader(packageHints(true), { delayBetweenScanAttempts: 120 })
      : new BrowserMultiFormatReader(packageHints(false))
    const videoConstraints: MediaTrackConstraints = optimized
      ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: 'environment' }
    controls = await reader.decodeFromConstraints(
      { audio: false, video: videoConstraints },
      video.value ?? undefined,
      (result: Result | undefined) => {
        if (result && !done) {
          done = true
          if (slowTimer) clearTimeout(slowTimer)
          emit('decoded', { text: result.getText(), format: mapFormat(result.getBarcodeFormat()) })
        }
      },
    )
    torchSupported.value = typeof controls.switchTorch === 'function'
    if (optimized) {
      applyContinuousFocus()
      slowTimer = setTimeout(() => { slowHint.value = true }, SLOW_HINT_MS)
    }
  } catch {
    error.value = 'Kamera nicht verfügbar oder Zugriff verweigert.'
  }
}

async function restartScanner(): Promise<void> {
  try { controls?.stop() } catch { /* egal */ }
  controls = null
  if (slowTimer) clearTimeout(slowTimer)
  done = false
  slowHint.value = false
  torchOn.value = false
  torchSupported.value = false
  await startScanner()
}

async function switchMode(m: 'webview_standard' | 'webview_optimized'): Promise<void> {
  if (activeMode.value === m) return
  storage.settings.scannerMode = m
  void storage.saveSettings()
  await restartScanner()
}

async function toggleTorch(): Promise<void> {
  if (!controls?.switchTorch) return
  const next = !torchOn.value
  try {
    await controls.switchTorch(next)
    torchOn.value = next
  } catch { /* still */ }
}

onMounted(startScanner)
onBeforeUnmount(() => {
  if (slowTimer) clearTimeout(slowTimer)
  controls?.stop()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-base-100">
    <div class="relative min-h-0 w-full flex-1 bg-black">
      <video ref="video" class="h-full w-full object-cover" autoplay playsinline muted />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <!-- Packungs-Scan (#167): barcode-orientierter, rechteckiger Rahmen (breiter als hoch)
             - unterscheidet sich bewusst vom grossen quadratischen BMP-Rahmen, passt fuer
             Code 39 (1D) und noch fuer Data Matrix auf Packungen. BMP-Overlay bleibt unveraendert. -->
        <div class="aspect-[3/2] w-[min(82vw,90vh)] max-w-sm rounded-xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
      </div>
    </div>

    <div class="flex flex-col items-stretch gap-1 bg-base-100 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-center text-sm text-error">{{ error }}</p>
      <template v-else>
        <p class="text-center text-xs text-base-content/80">Barcode auf der Medikamentenpackung scannen</p>
        <p class="text-center text-[11px] text-base-content/55">Es wird nur die PZN übernommen — Seriennummer, Charge und Verfalldatum nicht.</p>
        <p v-if="slowHint" class="text-center text-[11px] text-base-content/45">Abstand langsam verändern, Reflexionen vermeiden.</p>
      </template>

      <div class="flex items-center justify-between gap-2">
        <button
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-base-300 text-base-content active:bg-base-content/20"
          type="button"
          aria-label="Scanner schließen"
          @click="emit('cancel')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="h-6 w-6" aria-hidden="true">
            <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" />
          </svg>
        </button>

        <div class="inline-flex shrink-0 overflow-hidden rounded-full bg-base-300 text-sm font-medium" role="group" aria-label="Scanner-Modus">
          <button
            class="px-3.5 py-2"
            :class="activeMode === 'webview_standard' ? 'bg-primary text-primary-content' : 'text-base-content'"
            type="button"
            :aria-pressed="activeMode === 'webview_standard'"
            @click="switchMode('webview_standard')"
          >Standard</button>
          <button
            class="px-3.5 py-2"
            :class="activeMode === 'webview_optimized' ? 'bg-primary text-primary-content' : 'text-base-content'"
            type="button"
            :aria-pressed="activeMode === 'webview_optimized'"
            @click="switchMode('webview_optimized')"
          >Optimiert</button>
        </div>

        <button
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
          :class="!torchSupported
            ? 'bg-base-200 text-base-content/40'
            : torchOn ? 'bg-warning text-warning-content' : 'bg-base-300 text-base-content'"
          type="button"
          :disabled="!torchSupported"
          :aria-pressed="torchOn"
          aria-label="Taschenlampe ein-/ausschalten"
          @click="toggleTorch"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6" aria-hidden="true">
            <path d="M13 2 4.5 13.5a.6.6 0 0 0 .5.95H10l-1 8.5a.3.3 0 0 0 .54.22L19.5 10.5a.6.6 0 0 0-.5-.95H14l1-7.3a.3.3 0 0 0-.54-.25z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
