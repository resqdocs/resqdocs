import { ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { useFirmwareNotice } from './useFirmwareNotice'

/**
 * Geteilter Verbindungszustand zur Pico-Bridge (#157). Singleton-Modul-State nach
 * dem Muster von firmwareNotice — EINE Quelle der Wahrheit für Header und Einsatz-
 * Tab, statt pro Komponente ein eigenes `reachable`. Spricht ausschließlich über
 * den gekapselten picoClient (keine HTTP-Logik in Komponenten, kein Logging).
 *
 * Adaptives Polling: zügig solange (noch) nicht erreichbar, ruhig wenn verbunden,
 * pausiert im Hintergrund (App minimiert). Zusätzlich ereignisgesteuert (App-Start,
 * Einsatz-Tab, Senden, Tippen auf den Indikator); der Throttle fasst rasche
 * Mehrfach-Trigger zusammen. Singleton-Timer -> kein Doppel-Poll.
 */

// Modul-State (Singleton) — über alle Composable-Aufrufe geteilt.
const reachable = ref<boolean | null>(null) // null = noch nicht geprüft
const checking = ref(false)
let lastCheck = 0
const MIN_INTERVAL_MS = 2000 // ohne force höchstens alle 2 s (Start + Tabwechsel bündeln)

// Adaptives Hintergrund-Polling (Singleton-Timer): zügig solange nicht erreichbar, danach ruhig.
const POLL_DISCONNECTED_MS = 5000
const POLL_CONNECTED_MS = 25000
let pollTimer: ReturnType<typeof setTimeout> | null = null
let polling = false
let pollGen = 0 // Generation: start/stop erhöht sie -> alte (in-flight) Schleifen-Iterationen sterben

export function useBridgeConnection() {
  const storage = useStorage()
  // Base-URL live aus den Einstellungen (wie usePicoDevice) — gekapselte Schicht.
  const client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)
  const firmwareNotice = useFirmwareNotice()

  /**
   * Prüft die Erreichbarkeit (GET /health). `force` umgeht den Throttle (Button,
   * Sendefehler-Diagnose). Gibt zurück, ob die Bridge erreichbar ist.
   */
  async function check(force = false): Promise<boolean> {
    // Läuft schon eine Prüfung (z. B. Hintergrund-Poll), nutzt ein Tippen auf den Indikator deren
    // Ergebnis mit — der Zustand aktualisiert sich danach korrekt (kein zweiter paralleler Request).
    if (checking.value) return reachable.value === true
    if (!force && Date.now() - lastCheck < MIN_INTERVAL_MS) return reachable.value === true
    checking.value = true
    try {
      const ok = await client.health()
      reachable.value = ok
      lastCheck = Date.now()
      // Firmware-Check huckepack auf den erfolgreichen Kontakt (#134, gedrosselt).
      if (ok) void firmwareNotice.checkAfterContact()
      return ok
    } finally {
      checking.value = false
    }
  }

  /** Zustand von außen setzen (z. B. erfolgreicher /type- oder /status-Kontakt). */
  function markReachable(value: boolean): void {
    reachable.value = value
    if (value) lastCheck = Date.now()
  }

  function pollDelay(): number {
    return reachable.value === true ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS
  }

  /** Adaptives Hintergrund-Polling starten (idempotent — global nur EINE Schleife). */
  function startPolling(): void {
    if (polling) return
    polling = true
    const gen = ++pollGen // diese Schleife gehört zu dieser Generation
    const loop = async (): Promise<void> => {
      if (gen !== pollGen) return
      try {
        // im Hintergrund (App minimiert) nicht pollen — spart Akku/Netz, läuft beim Zurückkehren weiter.
        if (document.visibilityState === 'visible') await check()
      } finally {
        // immer neu planen (auch falls check() je wirft) — aber nur, solange diese Generation aktiv ist.
        if (gen === pollGen) pollTimer = setTimeout(() => void loop(), pollDelay())
      }
    }
    pollTimer = setTimeout(() => void loop(), pollDelay())
  }

  /** Polling stoppen (App-Unmount). */
  function stopPolling(): void {
    polling = false
    pollGen += 1 // laufende (in-flight) Schleifen-Iteration invalidieren (Stop-Race / HMR-Doppelmount)
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  }

  return { reachable, checking, check, markReachable, startPolling, stopPolling }
}
