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
 * Kein Dauer-Polling: geprüft wird ereignisgesteuert (App-Start, Öffnen des
 * Einsatz-Tabs, beim Senden); der Throttle fasst rasche Mehrfach-Trigger zusammen.
 */

// Modul-State (Singleton) — über alle Composable-Aufrufe geteilt.
const reachable = ref<boolean | null>(null) // null = noch nicht geprüft
const checking = ref(false)
let lastCheck = 0
const MIN_INTERVAL_MS = 2000 // ohne force höchstens alle 2 s (Start + Tabwechsel bündeln)

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

  return { reachable, checking, check, markReachable }
}
