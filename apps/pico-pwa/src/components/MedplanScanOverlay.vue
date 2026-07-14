<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserDatamatrixCodeReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'
import { useStorage } from '@/storage/useStorage'
import { effectiveScannerMode } from '@/medplan/scannerMode'

/**
 * Kamera-Overlay fuer den BMP-Scan (#36): reiner JS-Scanner (@zxing/browser,
 * Data Matrix) ueber getUserMedia - laeuft in iOS-WKWebView, Android-WebView,
 * Huawei (kein Google-Dienst) und im Browser. Netzwerk-Policy: ZXing dekodiert
 * lokal, nichts verlaesst das Geraet; der Roh-String wird nur emittiert.
 *
 * Bedien-UX (#166): Orientierungsrahmen + Hilfetext + optionaler Torch-Button.
 *
 * Scanner-Modus (#170): die Einstellung `settings.scannerMode` ist die ZENTRALE
 * Quelle. Hier konkret nutzbar (nativ noch nicht verfuegbar):
 *  - 'webview_standard'  = bisheriger Pfad: BrowserDatamatrixCodeReader ohne Hints,
 *    Default-Intervall, einfache Constraints, kein Dauerfokus, kein 8-s-Hinweis.
 *  - 'webview_optimized' = #171-Tuning: TRY_HARDER, 120 ms, hoehere Wunschaufloesung,
 *    Dauerfokus best-effort, 8-s-Hinweis.
 * Der Schnellumschalter unten aendert dieselbe Einstellung und startet den Scanner
 * neu (sauberer Neustart statt Live-Umkonfiguration).
 */
const emit = defineEmits<{ decoded: [raw: string]; cancel: [] }>()

const SLOW_HINT_MS = 8000

const storage = useStorage()
const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
const torchSupported = ref(false)
const torchOn = ref(false)
const slowHint = ref(false)
/** Tap-to-Refocus verfuegbar? Nur Android/Chrome; iOS-WebKit meldet kein focusMode -> false. */
const focusTapSupported = ref(false)
/** Kurzer visueller Tap-Puls an der Tippstelle (rein kosmetisch, kein pointsOfInterest). */
const pulse = ref<{ x: number; y: number; key: number } | null>(null)
/** Aktuell laufende konkrete Strategie (fuer den Schnellumschalter). */
const activeMode = ref<'webview_standard' | 'webview_optimized'>('webview_optimized')
let controls: IScannerControls | null = null
let done = false
let slowTimer: ReturnType<typeof setTimeout> | undefined
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

/** Dauerfokus NUR setzen, wenn die Kamera ihn meldet (best-effort, iOS oft nicht). */
function applyContinuousFocus(): void {
  const track = currentVideoTrack()
  if (track && focusModes(track).includes('continuous')) {
    const c = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    void track.applyConstraints(c).catch(() => {})
  }
}

/** Tap-to-Refocus NUR, wenn BEIDE Modi vorhanden sind: single-shot zum Antriggern UND continuous
 *  zum Zuruecksetzen. Ohne continuous koennten wir einen Sweep ausloesen, den wir nicht rueckgaengig
 *  machen koennen -> Fokus bliebe gelockt, was grosse Matrizen kaputt macht. */
function detectFocusTapSupport(): void {
  const modes = focusModes(currentVideoTrack())
  focusTapSupported.value = modes.includes('single-shot') && modes.includes('continuous')
}

/**
 * Nutzer-initiierter Refokus (Tap-to-Focus): EIN single-shot-AF-Sweep, danach GARANTIERT zurueck
 * auf continuous. Nie automatisch -> der optimierte Scan-Pfad bleibt exakt wie bisher. Der Track
 * wird bei JEDEM Tap frisch geholt (restartScanner tauscht den Stream). iOS/Unsupported: der Guard
 * greift vor jedem applyConstraints -> stiller No-op, kein Throw, keine Affordance.
 */
function refocus(ev: PointerEvent): void {
  const track = currentVideoTrack()
  const modes = focusModes(track)
  if (!track || !modes.includes('single-shot') || !modes.includes('continuous')) return
  if (refocusBusy) return
  refocusBusy = true

  // Visuelles Tap-Ack an der Tippstelle (Fokus ist global, kein Koordinaten-Fokus).
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  pulse.value = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, key: ++pulseKey }

  const single = { advanced: [{ focusMode: 'single-shot' }] } as unknown as MediaTrackConstraints
  void track.applyConstraints(single).catch(() => {})
  // Reset haengt am Timer, NICHT am await -> refocusBusy kann nicht haengenbleiben, falls
  // applyConstraints auf einer wackligen Kamera-HAL nie resolved.
  refocusTimer = setTimeout(() => {
    const back = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    // Torch-Re-Assert ERST, nachdem continuous gesetzt ist (.finally): manche Androids loeschen
    // beim Fokus-applyConstraints den Torch; unsequenziert koennte switchTorch(true) vor dem
    // Loeschen laufen und der Blitz bliebe aus, waehrend torchOn 'an' zeigt.
    void track.applyConstraints(back)
      .catch(() => {})
      .finally(() => {
        if (torchOn.value && controls?.switchTorch) void controls.switchTorch(true).catch(() => {})
      })
    refocusBusy = false
  }, REFOCUS_RETURN_MS)
}

async function startScanner(): Promise<void> {
  error.value = null
  // Einstellung -> konkrete Strategie (nativ nicht verfuegbar -> webview_*).
  const eff = effectiveScannerMode(storage.settings.scannerMode)
  const optimized = eff === 'webview_optimized'
  activeMode.value = optimized ? 'webview_optimized' : 'webview_standard'
  try {
    const reader = optimized
      ? new BrowserDatamatrixCodeReader(
          new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]),
          { delayBetweenScanAttempts: 120 },
        )
      : new BrowserDatamatrixCodeReader()
    const videoConstraints: MediaTrackConstraints = optimized
      ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: 'environment' }
    controls = await reader.decodeFromConstraints(
      { audio: false, video: videoConstraints },
      video.value ?? undefined,
      (result) => {
        if (result && !done) {
          done = true
          if (slowTimer) clearTimeout(slowTimer)
          emit('decoded', result.getText())
        }
      },
    )
    torchSupported.value = typeof controls.switchTorch === 'function'
    detectFocusTapSupport()
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
  if (refocusTimer) clearTimeout(refocusTimer)
  refocusBusy = false
  done = false
  slowHint.value = false
  torchOn.value = false
  torchSupported.value = false
  focusTapSupported.value = false
  pulse.value = null
  await startScanner()
}

/** Schnellumschalter: aendert die zentrale Einstellung und startet neu. */
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
  } catch {
    // Torch-Fehler still: Scan funktioniert ohne; Zustand nicht umschalten.
  }
}

onMounted(startScanner)

onBeforeUnmount(() => {
  if (slowTimer) clearTimeout(slowTimer)
  if (refocusTimer) clearTimeout(refocusTimer)
  controls?.stop() // schaltet Torch automatisch aus
})
</script>

<template>
  <!-- Root in Theme-Farbe (matcht hell/dunkel/resqdocs); nur der Kamera-Bereich bleibt dunkel. -->
  <div class="fixed inset-0 z-50 flex flex-col bg-base-100">
    <!-- Kamerabild + Orientierungsrahmen (Rahmen rein dekorativ, blockiert Tap/Decode nicht).
         Tap auf den Kamera-Bereich = Refokus (nur wo unterstuetzt; passiv, ohne preventDefault). -->
    <div
      class="relative min-h-0 w-full flex-1 bg-black"
      :class="{ 'cursor-pointer': focusTapSupported }"
      @pointerdown="refocus"
    >
      <video ref="video" class="h-full w-full object-cover" autoplay playsinline muted />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <!-- Rahmen durch BEIDE Viewport-Maße begrenzt -> auch im Querformat sinnvoll. -->
        <div class="aspect-square w-[min(55vw,55vh)] max-w-[18rem] rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
      </div>
      <!-- Tap-Puls: reines visuelles Ack an der Tippstelle (nur wenn Refokus unterstuetzt wird). -->
      <div
        v-if="pulse"
        :key="pulse.key"
        class="focus-pulse pointer-events-none absolute h-16 w-16 rounded-full border-2 border-white/90"
        :style="{ left: pulse.x + 'px', top: pulse.y + 'px' }"
      />
    </div>

    <!-- Steuerleiste in Theme-Farben (daisyUI base-100/base-content) -> immer sichtbar + passend.
         Kompakt, eine Zeile, auch im Querformat. Safe-Area beachtet. -->
    <div class="flex flex-col items-stretch gap-1 bg-base-100 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-center text-sm text-error">{{ error }}</p>
      <template v-else>
        <p class="truncate text-center text-xs text-base-content/70">BMP-Code flach in den Rahmen halten · Reflexionen vermeiden</p>
        <p v-if="focusTapSupported" class="truncate text-center text-[11px] text-base-content/50">Zum Scharfstellen aufs Kamerabild tippen.</p>
        <p v-if="slowHint" class="truncate text-center text-[11px] text-base-content/50">Abstand langsam verändern, Reflexionen vermeiden.</p>
      </template>

      <!-- Links: Schließen (X) · Mitte: Scanner-Modus · Rechts: Taschenlampe (Icon).
           BEWUSST KEINE daisyUI-.btn-Klassen fuer die Icon-Buttons: .btn/.btn-ghost
           setzen eigene Farbvariablen (auch fuer SVGs) und machten die Icons unsichtbar.
           Stattdessen plain Buttons mit explizitem bg-base-300 + text-base-content
           (theme-aware, aber garantiert kontrastreich); SVG erbt via currentColor. -->
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

<style scoped>
/* Tap-Puls: kurz aufblitzender Ring an der Tippstelle als Rueckmeldung fuer den Refokus. */
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
