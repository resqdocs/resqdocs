<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserQRCodeReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'

/**
 * Kamera-Overlay zum Scannen eines QR-Codes (Vorlagen-Transfer). Reiner JS-Scanner (@zxing/browser,
 * BrowserQRCodeReader) über getUserMedia — läuft in iOS-WKWebView, Android-WebView und im Browser.
 * Netzwerk-Policy: ZXing dekodiert lokal, nichts verlässt das Gerät; der Roh-String wird nur emittiert.
 *
 * Bewusst schlanker als MedplanScanOverlay: QR ist robuster als Data Matrix, daher EIN Modus (kein
 * Standard/Optimiert-Umschalter, keine hohe Wunschauflösung). Kamera-/Torch-/Tap-to-Refokus-Logik ist
 * 1:1 übernommen (alles MediaStreamTrack-/WKWebView-gebunden, nicht Reader-spezifisch).
 */
const emit = defineEmits<{ decoded: [raw: string]; cancel: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
const torchSupported = ref(false)
const torchOn = ref(false)
/** Tap-to-Refocus verfügbar? Nur Android/Chrome; iOS-WebKit meldet kein focusMode -> false. */
const focusTapSupported = ref(false)
/** Kurzer visueller Tap-Puls an der Tippstelle (rein kosmetisch). */
const pulse = ref<{ x: number; y: number; key: number } | null>(null)
let controls: IScannerControls | null = null
let done = false
// true ab onBeforeUnmount: schliesst das Kamera-Leck, wenn das Overlay WÄHREND des getUserMedia-Starts
// geschlossen wird (controls ist bis nach dem await null -> das stop() im Teardown liefe ins Leere und
// der danach ankommende, lebende Stream bliebe für immer an).
let disposed = false
let refocusBusy = false
let refocusTimer: ReturnType<typeof setTimeout> | undefined
let pulseKey = 0
const REFOCUS_RETURN_MS = 700

function currentVideoTrack(): MediaStreamTrack | null {
  const stream = video.value?.srcObject
  if (!(stream instanceof MediaStream)) return null
  return stream.getVideoTracks()[0] ?? null
}
function focusModes(track: MediaStreamTrack | null): string[] {
  const caps = track?.getCapabilities?.() as unknown as { focusMode?: string[] } | undefined
  return caps?.focusMode ?? []
}
function applyContinuousFocus(): void {
  const track = currentVideoTrack()
  if (track && focusModes(track).includes('continuous')) {
    const c = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    void track.applyConstraints(c).catch(() => {})
  }
}
function detectFocusTapSupport(): void {
  const modes = focusModes(currentVideoTrack())
  focusTapSupported.value = modes.includes('single-shot') && modes.includes('continuous')
}

/** Nutzer-initiierter Refokus (Tap-to-Focus): EIN single-shot-Sweep, danach GARANTIERT zurück auf
 *  continuous. Guard verhindert einen Sweep, den man nicht rückgängig machen kann (iOS: stiller No-op). */
function refocus(ev: PointerEvent): void {
  const track = currentVideoTrack()
  const modes = focusModes(track)
  if (!track || !modes.includes('single-shot') || !modes.includes('continuous')) return
  if (refocusBusy) return
  refocusBusy = true
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  pulse.value = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, key: ++pulseKey }
  const single = { advanced: [{ focusMode: 'single-shot' }] } as unknown as MediaTrackConstraints
  void track.applyConstraints(single).catch(() => {})
  refocusTimer = setTimeout(() => {
    const back = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    void track
      .applyConstraints(back)
      .catch(() => {})
      .finally(() => {
        if (torchOn.value && controls?.switchTorch) void controls.switchTorch(true).catch(() => {})
      })
    refocusBusy = false
  }, REFOCUS_RETURN_MS)
}

async function startScanner(): Promise<void> {
  error.value = null
  try {
    const reader = new BrowserQRCodeReader(
      new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]),
      { delayBetweenScanAttempts: 150 },
    )
    const c = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: 'environment' } },
      video.value ?? undefined,
      (result) => {
        if (result && !done) {
          done = true
          emit('decoded', result.getText())
        }
      },
    )
    // Wurde das Overlay während des Kamera-Starts geschlossen, den gerade erhaltenen Stream sofort stoppen.
    if (disposed) {
      c.stop()
      return
    }
    controls = c
    torchSupported.value = typeof controls.switchTorch === 'function'
    detectFocusTapSupport()
    applyContinuousFocus()
  } catch {
    error.value = 'Kamera nicht verfügbar oder Zugriff verweigert.'
  }
}

async function toggleTorch(): Promise<void> {
  if (!controls?.switchTorch) return
  const next = !torchOn.value
  try {
    await controls.switchTorch(next)
    torchOn.value = next
  } catch {
    /* Torch-Fehler still: Scan funktioniert ohne. */
  }
}

onMounted(startScanner)
onBeforeUnmount(() => {
  disposed = true
  if (refocusTimer) clearTimeout(refocusTimer)
  controls?.stop() // stoppt den MediaStream, schaltet Torch mit aus (falls Start schon fertig war)
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-base-100">
    <div
      class="relative min-h-0 w-full flex-1 bg-black"
      :class="{ 'cursor-pointer': focusTapSupported }"
      @pointerdown="refocus"
    >
      <video ref="video" class="h-full w-full object-cover" autoplay playsinline muted />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="aspect-square w-[min(55vw,55vh)] max-w-[18rem] rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
      </div>
      <div
        v-if="pulse"
        :key="pulse.key"
        class="focus-pulse pointer-events-none absolute h-16 w-16 rounded-full border-2 border-white/90"
        :style="{ left: pulse.x + 'px', top: pulse.y + 'px' }"
      />
    </div>

    <div class="flex flex-col items-stretch gap-1 bg-base-100 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-center text-sm text-error">{{ error }}</p>
      <template v-else>
        <p class="truncate text-center text-xs text-base-content/70">QR-Code des Transfer-Links in den Rahmen halten</p>
        <p v-if="focusTapSupported" class="truncate text-center text-[11px] text-base-content/50">Zum Scharfstellen aufs Kamerabild tippen.</p>
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

        <button
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
          :class="!torchSupported ? 'bg-base-200 text-base-content/40' : torchOn ? 'bg-warning text-warning-content' : 'bg-base-300 text-base-content'"
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

<style scoped>
.focus-pulse {
  animation: focus-pulse 0.5s ease-out forwards;
}
@keyframes focus-pulse {
  from {
    transform: translate(-50%, -50%) scale(1.4);
    opacity: 0.9;
  }
  to {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0;
  }
}
</style>
