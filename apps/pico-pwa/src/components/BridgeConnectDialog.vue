<script setup lang="ts">
// „Mit ResQDocs-Bridge verbinden“: geöffnet aus dem Einsatz, wenn keine Bridge verbunden ist.
// Drei Schritte als Symbole (einstecken, WLAN, fertig) und EIN Hauptknopf: „Mit Bridge-WLAN verbinden“ lässt
// das Handy dem WLAN der Bridge direkt beitreten (bridgeWifi.ts). WLAN-Name und Passwort stehen unter
// „Von Hand verbinden“ zum Abschreiben (das Passwort ist für alle Bridges gleich und bewusst öffentlich).
// „WLAN-Einstellungen öffnen“ gibt es nur auf Android: iOS lässt den Sprung auf die WLAN-Seite offiziell
// nicht zu (siehe DeviceSection). Kann das Gerät nicht direkt beitreten (Browser, ältere Geräte), bleibt nur
// der Weg von Hand, dann gleich aufgeklappt. Sobald die Bridge erreichbar ist, schließt das Fenster von selbst.
// Kein ⓘ (InfoTip) hier: Seine Erklärung hängt am body und läge unter diesem modalen Fenster.
import { computed, nextTick, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import { useBridgeWifi } from '@/pico/bridgeWifi'
import BridgePasswordCopy from '@/components/BridgePasswordCopy.vue'
import { bridgeConnectRequest, openBridgePage } from '@/composables/useBridgePage'
import { haptic } from '@/shell/haptics'

type Phase = 'idle' | 'joining' | 'connected' | 'failed'

const dialog = ref<HTMLDialogElement | null>(null)
const joinButton = ref<HTMLButtonElement | null>(null)
const recheckButton = ref<HTMLButtonElement | null>(null)
const { reachable, checking, check } = useBridgeConnection()
const { supported, joining, joinBridgeWifi } = useBridgeWifi()
const platform = Capacitor.getPlatform()
const phase = ref<Phase>('idle')
const message = ref('')
/** Abbrechen ist kein Fehler: neutrale Farbe. */
const messageIsError = ref(false)
const manualOpen = ref(false)
const rechecking = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

/** Direkt beitreten geht nur in der App und dort erst ab Android 10; sonst bleibt der Weg von Hand. */
const canJoin = computed(() => supported.value !== false)
const busy = computed(() => phase.value === 'joining' || joining.value)
/** Für Vorleser: derselbe Zustand, den die Symbole zeigen. */
const stateText = computed(() => (phase.value === 'joining' ? 'Wird verbunden …' : phase.value === 'connected' ? 'Verbunden' : message.value))

function stopCloseTimer(): void {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
}
/** Kurz „Verbunden“ zeigen, dann schließen. */
function closeSoon(): void {
  phase.value = 'connected'
  haptic('bridgeConnected')
  message.value = ''
  stopCloseTimer()
  closeTimer = setTimeout(() => dialog.value?.close(), 900)
}

watch(bridgeConnectRequest, () => {
  stopCloseTimer()
  phase.value = 'idle'
  message.value = ''
  messageIsError.value = false
  manualOpen.value = !canJoin.value
  dialog.value?.showModal()
  // Fokus auf die Hauptaktion (WebKit setzt ihn bei Knöpfen nicht von selbst); ohne Ring nach einem Tipp.
  void nextTick(() => (canJoin.value ? joinButton.value : recheckButton.value)?.focus({ preventScroll: true }))
})
watch(reachable, (ok) => {
  if (ok === true && dialog.value?.open) closeSoon()
})

async function join(): Promise<void> {
  if (busy.value) return
  phase.value = 'joining'
  message.value = ''
  const result = await joinBridgeWifi()
  if (result.status === 'connected') {
    if (dialog.value?.open) closeSoon()
    return
  }
  phase.value = 'failed'
  messageIsError.value = result.status === 'error'
  if (result.status === 'unsupported') {
    manualOpen.value = true
    message.value = 'Hier bitte von Hand verbinden.'
  } else {
    message.value = result.status === 'cancelled' ? 'Nicht verbunden.' : result.message
  }
}
async function openWifiSettings(): Promise<void> {
  try {
    await NativeSettings.open({ optionAndroid: AndroidSettings.Wifi, optionIOS: IOSSettings.App })
  } catch {
    /* nur nativ verfügbar */
  }
}
async function recheck(): Promise<void> {
  if (rechecking.value || busy.value) return
  rechecking.value = true
  message.value = ''
  try {
    // Läuft gerade die Prüfung im Hintergrund, gilt ihr Ergebnis (sie ist höchstens wenige Sekunden alt).
    // So bleibt der Knopf immer bedienbar, statt während jeder Hintergrund-Prüfung gesperrt zu sein.
    const running = checking.value
    while (checking.value) await new Promise((resolve) => setTimeout(resolve, 150))
    if (running ? reachable.value === true : await check(true)) return
    phase.value = 'failed'
    messageIsError.value = true
    message.value = 'Bridge noch nicht erreichbar.'
  } finally {
    rechecking.value = false
  }
}
function moreSettings(): void {
  dialog.value?.close()
  openBridgePage()
}
</script>

<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" aria-label="Mit ResQDocs-Bridge verbinden" data-bridge-connect @close="stopCloseTimer">
    <div class="modal-box relative max-h-none space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-circle absolute right-2 top-2 min-h-11 min-w-11 p-0"
        aria-label="Schließen"
        @click="dialog?.close()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="size-6 shrink-0" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <h3 class="pr-10 text-base font-semibold">Mit ResQDocs-Bridge verbinden</h3>

      <!-- Drei Schritte als Symbole; die Linie dazwischen zeigt die Reihenfolge. Der Zustand steht an den
           Symbolen selbst: Während des Beitritts trägt das WLAN den Akzent, am Ende wird der Haken grün. -->
      <ol class="flex items-start" data-bridge-steps>
        <li class="relative flex-1 space-y-2 text-center after:absolute after:left-[calc(50%+2.25rem)] after:right-[calc(-50%+2.25rem)] after:top-7 after:h-0.5 after:rounded-full after:bg-base-300 after:content-['']">
          <span class="inline-grid size-14 place-items-center rounded-full transition-colors bg-base-200 text-base-content" aria-hidden="true">
            <!-- Dasselbe Stick-Icon wie in der Kopfleiste und bei „Auf Knopf speichern“. -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" class="size-7">
              <path d="M8.75 16.75h6.5v5.5h-6.5z" />
              <path d="M10.6 18.7h1.1V20h-1.1zM12.3 18.7h1.1V20h-1.1z" fill="currentColor" stroke="none" />
              <rect x="6.25" y="1.75" width="11.5" height="15" rx="3" />
              <circle cx="12" cy="8.5" r="2.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <p class="-mx-2 text-[13px] leading-tight">Bridge einstecken</p>
        </li>
        <li class="relative flex-1 space-y-2 text-center after:absolute after:left-[calc(50%+2.25rem)] after:right-[calc(-50%+2.25rem)] after:top-7 after:h-0.5 after:rounded-full after:bg-base-300 after:content-['']">
          <span class="inline-grid size-14 place-items-center rounded-full transition-colors" :class="phase === 'joining' ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content'" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-7" :class="{ 'animate-pulse': phase === 'joining' }">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </span>
          <p class="-mx-2 text-[13px] leading-tight" :class="{ 'text-primary': phase === 'joining' }">{{ phase === 'joining' ? 'Wird verbunden …' : 'WLAN verbinden' }}</p>
        </li>
        <li class="relative flex-1 space-y-2 text-center">
          <span class="inline-grid size-14 place-items-center rounded-full transition-colors" :class="phase === 'connected' ? 'bg-success text-success-content' : 'bg-base-200 text-base-content'" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-7">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <p class="-mx-2 text-[13px] leading-tight" :class="{ 'text-success': phase === 'connected' }">{{ phase === 'connected' ? 'Verbunden' : 'Fertig' }}</p>
        </li>
      </ol>

      <div v-if="canJoin || message" class="space-y-2">
        <button
          v-if="canJoin"
          type="button"
          class="btn btn-primary min-h-12 w-full gap-2"
          ref="joinButton"
          :disabled="busy || phase === 'connected'"
          data-bridge-join
          @click="join"
        >
          <span v-if="busy" class="loading loading-spinner loading-sm"></span>
          Mit Bridge-WLAN verbinden
        </button>
        <p v-if="message" class="text-center text-sm" :class="messageIsError ? 'text-error' : 'text-base-content/75'" data-bridge-message>{{ message }}</p>
      </div>
      <!-- Auf beiden Plattformen: Das Bridge-WLAN hat kein Internet. -->
      <p class="text-center text-xs text-base-content/75" data-bridge-no-internet>Solange verbunden, hat die App kein Internet.</p>
      <p class="sr-only" role="status" aria-live="polite" data-bridge-state>{{ stateText }}</p>

      <details class="rounded-lg bg-base-200" :open="manualOpen" data-bridge-manual @toggle="manualOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Von Hand verbinden
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 transition-transform" :class="{ 'rotate-180': manualOpen }" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div class="space-y-3 px-3 pb-3 text-sm">
          <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
            <dt class="text-base-content/75">WLAN</dt>
            <dd><code class="select-text font-mono">ResQDocs-…</code></dd>
            <dt class="text-base-content/75">Passwort</dt>
            <dd><BridgePasswordCopy /></dd>
          </dl>
          <p v-if="platform !== 'android'" class="text-xs text-base-content/75">In den Einstellungen des Handys unter WLAN wählen.</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="platform === 'android'"
              type="button"
              class="btn btn-outline btn-sm min-h-11"
              data-open-wifi
              @click="openWifiSettings"
            >WLAN-Einstellungen öffnen</button>
            <button type="button" class="btn btn-sm min-h-11" :class="canJoin ? 'btn-outline' : 'btn-primary'" :disabled="rechecking" ref="recheckButton" data-bridge-recheck @click="recheck">
              <span v-if="rechecking" class="loading loading-spinner loading-sm"></span>
              Verbindung prüfen
            </button>
          </div>
        </div>
      </details>

      <div class="text-center">
        <button type="button" class="link link-hover min-h-11 px-3 text-sm text-base-content/75" @click="moreSettings">Weitere Einstellungen</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">Schließen</button></form>
  </dialog>
</template>
