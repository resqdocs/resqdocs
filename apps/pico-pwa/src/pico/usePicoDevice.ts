import { ref, computed } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { useFirmwareNotice } from './useFirmwareNotice'
import { useBridgeConnection } from './useBridgeConnection'
import type { OsMode, PicoStatus } from './picoTypes'

/**
 * Composable für den Gerät/Pico-Bereich (#14-B). Kapselt die Pico-Kommunikation
 * über picoClient — KEINE HTTP-Logik in Komponenten. Kein Auto-Connect, kein
 * Auto-Send. Der Testtext lebt NUR im RAM (wird nicht persistiert).
 */
export function usePicoDevice() {
  const storage = useStorage()
  // Base-URL live aus den App-Einstellungen (über die gekapselte Storage-Schicht).
  const client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)

  const reachable = ref<boolean | null>(null)
  const status = ref<PicoStatus | null>(null)
  const testText = ref('') // flüchtig, niemals persistiert
  const os = ref<OsMode>((storage.settings.defaultOs as OsMode) ?? 'win_de')
  const busy = ref(false)
  const error = ref<string | null>(null)

  const baseUrl = computed(() => storage.settings.picoBaseUrl)

  function setBaseUrl(url: string): void {
    storage.saveSettings({ picoBaseUrl: url })
  }

  const firmwareNotice = useFirmwareNotice()
  // Geteilter Verbindungszustand (#157): Einstellungen-Prüfungen halten auch den
  // Header-Indikator aktuell, damit beide nicht auseinanderlaufen.
  const bridge = useBridgeConnection()

  async function checkHealth(): Promise<void> {
    busy.value = true
    error.value = null
    try {
      reachable.value = await client.health()
      bridge.markReachable(reachable.value)
      // Firmware-Check huckepack auf den erfolgreichen Kontakt (#134, gedrosselt).
      if (reachable.value) void firmwareNotice.checkAfterContact()
    } finally {
      busy.value = false
    }
  }

  async function fetchStatus(): Promise<void> {
    busy.value = true
    error.value = null
    try {
      status.value = await client.status()
      reachable.value = true
      bridge.markReachable(true)
      firmwareNotice.reportStatus(status.value) // bereits geladen - kein Extra-Request (#134)
    } catch (e) {
      status.value = null
      reachable.value = false
      bridge.markReachable(false)
      error.value = (e as Error).message
    } finally {
      busy.value = false
    }
  }

  async function sendTest(): Promise<{ ok: boolean; typed?: number; error?: string }> {
    busy.value = true
    error.value = null
    try {
      const r = await client.typeText({ text: testText.value, os: os.value })
      return { ok: true, typed: r.typed }
    } catch (e) {
      error.value = (e as Error).message
      return { ok: false, error: error.value }
    } finally {
      busy.value = false
    }
  }

  /** POST /config (#17): setzt die SSID-ID. Bei Erfolg startet der AP neu. */
  async function setSsidId(ssidId: string): Promise<{ ok: boolean; restartRequired?: boolean; error?: string }> {
    busy.value = true
    error.value = null
    try {
      const r = await client.setConfig({ ssidId: ssidId.trim() })
      // Nach dem AP-Neustart ist der alte Status nicht mehr aussagekräftig.
      if (r.restartRequired) {
        status.value = null
        reachable.value = null
      }
      return { ok: r.ok, restartRequired: r.restartRequired }
    } catch (e) {
      error.value = (e as Error).message
      return { ok: false, error: error.value }
    } finally {
      busy.value = false
    }
  }

  return { reachable, status, testText, os, busy, error, baseUrl, setBaseUrl, checkHealth, fetchStatus, sendTest, setSsidId }
}
