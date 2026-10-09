<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType, type Result } from '@zxing/library'
import { useStorage } from '@/storage/useStorage'
import { effectiveScannerMode } from '@/medplan/scannerMode'
import { useRearCamera } from '@/medplan/useRearCamera'
import { nativeScannerAvailable, scanNative } from '@/medplan/nativeScanner'
import { normalizeScanFormat, type ScanProfile, type ScanResult } from '@/medplan/scanProfiles'

/**
 * DAS Kamera-Overlay der App - ein Pfad fuer alle Scans, keine getrennten Kamera-Pfade je Anwendungsfall.
 * Was gescannt wird, sagt das Profil (scanProfiles.ts): BMP_PROFILE, PACKAGE_PROFILE, QR_PROFILE.
 *
 *  - In der App (Android, iOS): NUR der native Vollbild-Scanner (CameraX bzw. AVFoundation + ZXing-C++).
 *    Er laeuft als eigener Bildschirm ueber diesem Overlay; hierher kommt nur Ergebnis oder Abbruch.
 *  - Im Browser (PWA): JS-Scanner (@zxing/browser) ueber getUserMedia mit Linsenwahl (useRearCamera),
 *    Torch, Tap-to-Refokus und dem Schnellumschalter Standard/Optimiert (settings.scannerMode):
 *      'webview_standard'  = Reader ohne Hints, Default-Intervall, einfache Constraints
 *      'webview_optimized' = TRY_HARDER, 120 ms, hoehere Wunschaufloesung, Dauerfokus, 8-s-Hinweis
 *
 * Netzwerk-Policy: dekodiert wird lokal; der Roh-String wird nur emittiert, nie geloggt/gespeichert.
 * Was der Aufrufer daraus extrahiert (PZN, Transfer-Link, BMP), ist seine Sache.
 */
const props = defineProps<{ profile: ScanProfile }>()
const emit = defineEmits<{ decoded: [result: ScanResult]; cancel: [] }>()

const SLOW_HINT_MS = 8000
const REFOCUS_RETURN_MS = 700

/** zxing-js kennt kein eigenes PZN-Format; Code 39 deckt den PZN-Strichcode ab. */
const WEB_FORMATS: Partial<Record<ScanProfile['formats'][number], BarcodeFormat>> = {
  DataMatrix: BarcodeFormat.DATA_MATRIX,
  QRCode: BarcodeFormat.QR_CODE,
  Code39: BarcodeFormat.CODE_39,
}

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
const activeMode = ref<'webview_standard' | 'webview_optimized'>('webview_optimized')
const nativeAvailable = nativeScannerAvailable()
let controls: IScannerControls | null = null
let done = false
// true ab onBeforeUnmount: schliesst das Kamera-Leck, wenn das Overlay WAEHREND des getUserMedia-Starts
// geschlossen wird (controls ist bis nach dem await null -> das stop() im Teardown liefe ins Leere).
let disposed = false
let slowTimer: ReturnType<typeof setTimeout> | undefined
let refocusBusy = false
let refocusTimer: ReturnType<typeof setTimeout> | undefined
let pulseKey = 0

// Kameraauswahl und Ist-Zustands-Meldung, nur auf Android-WebView aktiv (siehe useRearCamera).
const { diagnose, keinFokus, umschaltbar, constraintsFor, switchCamera, noteActualTrack } = useRearCamera()
let switching = false

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
 * auf continuous. Der Track wird bei JEDEM Tap frisch geholt (restartScanner tauscht den Stream).
 * iOS/Unsupported: der Guard greift vor jedem applyConstraints -> stiller No-op.
 */
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
  // Reset haengt am Timer, NICHT am await -> refocusBusy kann nicht haengenbleiben, falls
  // applyConstraints auf einer wackligen Kamera-HAL nie resolved.
  refocusTimer = setTimeout(() => {
    const back = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
    // Torch-Re-Assert ERST, nachdem continuous gesetzt ist: manche Androids loeschen beim
    // Fokus-applyConstraints den Torch.
    void track.applyConstraints(back)
      .catch(() => {})
      .finally(() => {
        if (torchOn.value && controls?.switchTorch) void controls.switchTorch(true).catch(() => {})
      })
    refocusBusy = false
  }, REFOCUS_RETURN_MS)
}

function finish(result: ScanResult): void {
  if (done) return
  done = true
  if (slowTimer) clearTimeout(slowTimer)
  emit('decoded', result)
}

/** Nativer Scanner (eigene Activity/ViewController). Technische Angaben nur, wenn in den Einstellungen gewuenscht. */
async function runNative(): Promise<void> {
  const r = await scanNative(props.profile, { showDiagnostics: storage.settings.scannerDiagnostics })
  if (r.status === 'found') {
    finish({ text: r.raw, format: r.format })
  } else if (r.status === 'cancelled') {
    emit('cancel')
  } else if (r.status === 'denied') {
    error.value = 'Kamerazugriff verweigert. Bitte in den Systemeinstellungen für ResQDocs erlauben.'
  } else {
    error.value = `${r.message}.`
  }
}

function webHints(tryHarder: boolean): Map<DecodeHintType, unknown> {
  const h = new Map<DecodeHintType, unknown>()
  const formats = props.profile.formats.map((f) => WEB_FORMATS[f]).filter((f): f is BarcodeFormat => f !== undefined)
  h.set(DecodeHintType.POSSIBLE_FORMATS, formats)
  if (tryHarder) h.set(DecodeHintType.TRY_HARDER, true)
  return h
}

async function startScanner(): Promise<void> {
  error.value = null
  if (nativeAvailable) {
    await runNative()
    return
  }
  const optimized = effectiveScannerMode(storage.settings.scannerMode, false) === 'webview_optimized'
  activeMode.value = optimized ? 'webview_optimized' : 'webview_standard'
  try {
    const reader = optimized
      ? new BrowserMultiFormatReader(webHints(true), { delayBetweenScanAttempts: 120 })
      : new BrowserMultiFormatReader(webHints(false))
    // Linsenwahl statt „irgendeine Ruecklinse": ohne sie greift die WebView auf Mehrlinsen-Geraeten
    // oft zur Ultraweitwinkel-Linse mit Fixfokus, die auf Scanabstand nie scharf wird (siehe useRearCamera).
    const videoConstraints = await constraintsFor(optimized)
    if (disposed) return
    const c = await reader.decodeFromConstraints(
      { audio: false, video: videoConstraints },
      video.value ?? undefined,
      (result: Result | undefined) => {
        if (result && !done) {
          finish({ text: result.getText(), format: normalizeScanFormat(BarcodeFormat[result.getBarcodeFormat()]) })
        }
      },
    )
    // Wurde das Overlay waehrend des Kamera-Starts geschlossen, den gerade erhaltenen Stream sofort stoppen.
    if (disposed) {
      c.stop()
      return
    }
    controls = c
    noteActualTrack(currentVideoTrack()) // was ist wirklich angekommen (Aufloesung, Linse)?
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

/** Notausgang, wenn die automatisch gewaehlte Linse nicht taugt. switchCamera merkt die neue Wahl,
 *  restartScanner liest sie beim naechsten constraintsFor wieder ein. */
async function onSwitchCamera(): Promise<void> {
  if (switching || done) return
  switching = true
  try {
    if (!(await switchCamera(activeMode.value === 'webview_optimized'))) return
    await restartScanner()
  } finally {
    switching = false
  }
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

onMounted(() => void startScanner())

onBeforeUnmount(() => {
  disposed = true
  if (slowTimer) clearTimeout(slowTimer)
  if (refocusTimer) clearTimeout(refocusTimer)
  controls?.stop() // schaltet Torch automatisch aus
})
</script>

<template>
  <!-- Root in Theme-Farbe (matcht hell/dunkel/resqdocs); nur der Kamera-Bereich bleibt dunkel. -->
  <div class="fixed inset-0 z-50 flex flex-col bg-base-100">
    <!-- Kamerabild + Orientierungsrahmen (rein dekorativ, dekodiert wird das ganze Bild).
         Tap auf den Kamera-Bereich = Refokus (nur wo unterstuetzt; passiv, ohne preventDefault). -->
    <div
      class="relative min-h-0 w-full flex-1 bg-black"
      :class="{ 'cursor-pointer': focusTapSupported }"
      @pointerdown="refocus"
    >
      <video ref="video" class="h-full w-full object-cover" autoplay playsinline muted />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <!-- Rahmen durch BEIDE Viewport-Masse begrenzt -> auch im Querformat sinnvoll. Bewusst NICHT
             groesser: ein formatfuellender Rahmen liess den Code auf ca. 6 cm heranholen - naeher, als viele
             Hauptkameras scharfstellen. Breit (3:2) fuer Strichcodes auf Packungen, sonst quadratisch. -->
        <div
          class="border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]"
          :class="profile.frame === 'wide'
            ? 'aspect-[3/2] w-[min(82vw,90vh)] max-w-sm rounded-xl'
            : 'aspect-square w-[min(55vw,55vh)] max-w-[18rem] rounded-2xl'"
        />
      </div>
      <!-- Tap-Puls: reines visuelles Ack an der Tippstelle (nur wenn Refokus unterstuetzt wird). -->
      <div
        v-if="pulse"
        :key="pulse.key"
        class="focus-pulse pointer-events-none absolute h-16 w-16 rounded-full border-2 border-white/90"
        :style="{ left: pulse.x + 'px', top: pulse.y + 'px' }"
      />
    </div>

    <!-- Steuerleiste in Theme-Farben (daisyUI base-100/base-content). Kompakt, Safe-Area beachtet. -->
    <div class="flex flex-col items-stretch gap-1 bg-base-100 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <p v-if="error" class="text-center text-sm text-error">{{ error }}</p>
      <template v-else>
        <p class="truncate text-center text-xs text-base-content/70">{{ profile.hint }}</p>
        <p v-if="profile.note" class="text-center text-[11px] text-base-content/55">{{ profile.note }}</p>
        <p v-if="keinFokus" class="truncate text-center text-[11px] text-warning">
          Diese Kamera kann nicht scharfstellen — Abstand ca. 20 cm halten.
        </p>
        <p v-else-if="focusTapSupported" class="truncate text-center text-[11px] text-base-content/50">Zum Scharfstellen aufs Kamerabild tippen.</p>
        <button
          v-if="diagnose"
          class="mx-auto max-w-full px-2 py-1 text-center text-[11px] leading-snug text-base-content/50"
          :class="umschaltbar ? 'underline decoration-dotted underline-offset-2' : 'cursor-default'"
          type="button"
          :disabled="!umschaltbar"
          @click="onSwitchCamera"
        >
          {{ diagnose }}<template v-if="umschaltbar"> — andere Kamera</template>
        </button>
        <p v-if="slowHint" class="truncate text-center text-[11px] text-base-content/50">Abstand langsam verändern, Reflexionen vermeiden.</p>
      </template>

      <!-- Links: Schliessen (X) · Mitte: Scanner-Modus (nur Browser) · Rechts: Taschenlampe.
           BEWUSST KEINE daisyUI-.btn-Klassen fuer die Icon-Buttons: .btn/.btn-ghost setzen eigene
           Farbvariablen (auch fuer SVGs) und machten die Icons unsichtbar. -->
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

        <div v-if="!nativeAvailable" class="inline-flex shrink-0 overflow-hidden rounded-full bg-base-300 text-sm font-medium" role="group" aria-label="Scanner-Modus">
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
