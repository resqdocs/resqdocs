import { computed, ref } from 'vue'
import { compareVersions } from './firmwareUpdate.ts'
import type { OtaManifest, PicoStatus } from './picoTypes'

/**
 * Firmware-Aktualitaets-Check (#134), pure/testbare Logik: huckepack auf
 * ohnehin erfolgreiche Bridge-Kontakte (KEIN Auto-Connect). Die Vite-/
 * Singleton-Anbindung lebt in useFirmwareNotice.ts (import.meta.glob ist
 * in node-Tests nicht ladbar - gleiche Trennung wie firmwareUpdate/
 * useFirmwareUpdate).
 */

/** Min. Abstand zwischen Hintergrund-Checks (Drossel gegen Request-Spam). */
export const CHECK_INTERVAL_MS = 5 * 60 * 1000

interface Deps {
  manifest: OtaManifest | null
  fetchStatus: () => Promise<PicoStatus>
  now?: () => number
}

export function createFirmwareNotice(deps: Deps) {
  const now = deps.now ?? (() => Date.now())

  const bridgeVersion = ref<string | null>(null)
  const otaSupported = ref(false)
  const dismissed = ref(false) // pro Sitzung; naechster App-Start zeigt erneut
  let lastCheck = 0
  let checking = false

  /** Update nur anbieten, wenn die Bridge OTA kann UND aelter ist (#134). */
  const updateAvailable = computed(() => {
    if (!deps.manifest || !otaSupported.value || !bridgeVersion.value) return false
    return compareVersions(deps.manifest.version, bridgeVersion.value) > 0
  })
  const visible = computed(() => updateAvailable.value && !dismissed.value)

  /** Bereits geladenen Status uebernehmen (Einstellungen) - ungedrosselt, kein Request. */
  function reportStatus(status: PicoStatus): void {
    bridgeVersion.value = status.fwVersion
    otaSupported.value = status.otaSupported === true
    lastCheck = now()
  }

  /**
   * Nach einem erfolgreichen Bridge-Kontakt aufrufen (fire-and-forget).
   * Holt /status im Hintergrund, hoechstens alle CHECK_INTERVAL_MS;
   * Fehler werden geschluckt (der Kontakt selbst war ja erfolgreich).
   */
  async function checkAfterContact(): Promise<void> {
    if (!deps.manifest) return // nichts gebuendelt -> nichts zu vergleichen
    if (checking || now() - lastCheck < CHECK_INTERVAL_MS) return
    checking = true
    try {
      reportStatus(await deps.fetchStatus())
    } catch {
      // still: Hintergrund-Check darf nie stoeren (kein Logging, Policy)
    } finally {
      checking = false
    }
  }

  function dismiss(): void {
    dismissed.value = true
  }

  return { manifest: deps.manifest, bridgeVersion, updateAvailable, visible, reportStatus, checkAfterContact, dismiss }
}

export type FirmwareNotice = ReturnType<typeof createFirmwareNotice>
