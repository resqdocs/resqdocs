import { computed, ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { createTypingTracker, shouldKeepAwake, type ProgressSnapshot, type TypingTracker } from './typingProgress'
import { setKeepAwake } from './keepAwake'
import type { TypingControl } from './picoTypes'

/**
 * Fortschritt des Tippens auf der Bridge - geteilter Zustand (Singleton wie useBridgeConnection), damit
 * der Balken auf allen Tabs derselbe ist. Die Logik liegt in typingProgress.ts (ohne Vue testbar); hier
 * nur Zeitgeber und der Anschluss an den gekapselten picoClient. Es laufen nur Zahlen durch, kein Text.
 *
 * Die Bridge tippt unabhaengig von dieser Anzeige: schliessen oder WLAN verlassen bricht nichts ab.
 */
const snapshot = ref<ProgressSnapshot | null>(null)
const visible = ref(false)
const controlling = ref(false)

let tracker: TypingTracker | null = null
let generation = 0 // jeder Start erhoeht sie; alte Schleifen beenden sich daran
let pollTimer: ReturnType<typeof setTimeout> | null = null
let uiTimer: ReturnType<typeof setInterval> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** Wie oft die Anzeige zwischen zwei Abfragen fortgeschrieben wird. */
const UI_REFRESH_MS = 200
/** „Fertig"/„Abgebrochen" bleibt so lange stehen, bevor die Anzeige von selbst verschwindet. */
const HIDE_AFTER_END_MS = 5000

function stopTimers(): void {
  if (pollTimer) clearTimeout(pollTimer)
  if (uiTimer) clearInterval(uiTimer)
  if (hideTimer) clearTimeout(hideTimer)
  pollTimer = uiTimer = hideTimer = null
}

function refresh(): void {
  if (tracker) snapshot.value = tracker.snapshot()
  // Bildschirm an, solange die Bridge nachweislich tippt und die Anzeige offen ist.
  setKeepAwake(shouldKeepAwake(snapshot.value, visible.value))
}

function onFinished(gen: number): void {
  if (gen !== generation) return
  if (pollTimer) clearTimeout(pollTimer)
  if (uiTimer) clearInterval(uiTimer)
  pollTimer = uiTimer = null
  refresh()
  hideTimer = setTimeout(() => {
    if (gen !== generation) return
    visible.value = false
    setKeepAwake(false)
  }, HIDE_AFTER_END_MS)
}

export function useTypingProgress() {
  const storage = useStorage()
  const client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)

  /** Nach einem erfolgreich angenommenen Sendeauftrag aufrufen. `total` = Zeichen des gesendeten Textes. */
  function start(input: { total: number; delayMs: number }): void {
    stopTimers()
    const gen = ++generation
    const t = createTypingTracker(input, {
      now: () => Date.now(),
      fetchStatus: () => client.typeStatus(),
      control: (action) => client.typeControl(action),
    })
    tracker = t
    visible.value = true
    refresh()
    if (t.isFinished()) {
      onFinished(gen)
      return
    }
    uiTimer = setInterval(() => {
      if (gen !== generation) return
      refresh()
      if (t.isFinished()) onFinished(gen)
    }, UI_REFRESH_MS)
    const loop = async (): Promise<void> => {
      if (gen !== generation) return
      const more = await t.poll()
      if (gen !== generation) return
      refresh()
      if (!more) {
        onFinished(gen)
        return
      }
      pollTimer = setTimeout(() => void loop(), t.nextPollInMs())
    }
    void loop()
  }

  /** Anhalten, Fortsetzen oder Abbrechen an die Bridge schicken. */
  async function control(action: TypingControl): Promise<void> {
    const t = tracker
    if (!t || controlling.value) return
    const gen = generation
    controlling.value = true
    try {
      await t.control(action)
    } finally {
      controlling.value = false
    }
    if (gen !== generation) return
    refresh()
    if (t.isFinished()) onFinished(gen)
  }

  /** Nur die Anzeige schliessen. Die Bridge tippt weiter. */
  function dismiss(): void {
    visible.value = false
    setKeepAwake(false)
  }

  /** true, solange die Bridge nachweislich noch an diesem Auftrag arbeitet (tippt oder angehalten ist). */
  const busy = computed(() => {
    const s = snapshot.value
    return !!s && s.source === 'live' && (s.phase === 'typing' || s.phase === 'paused')
  })

  return { snapshot, visible, controlling, busy, start, control, dismiss }
}
