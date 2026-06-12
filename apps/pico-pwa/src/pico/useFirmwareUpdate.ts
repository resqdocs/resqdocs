import { computed, ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { compareVersions, runFirmwareUpdate, type UpdatePhase } from './firmwareUpdate'
import { bundledManifest, loadBundledFirmware } from './firmwareAsset'
import type { PicoStatus } from './picoTypes'

/**
 * Composable fuer das OTA-Firmware-Update (#130). Duenne Vue-Anbindung:
 * die Logik lebt in firmwareUpdate.ts (pur, getestet), die Artefakte in
 * firmwareAsset.ts. KEINE HTTP-Logik in Komponenten.
 */
export function useFirmwareUpdate() {
  const storage = useStorage()
  const client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)

  /** Manifest der mitgelieferten Firmware (null: keine gebuendelt). */
  const manifest = bundledManifest()

  const phase = ref<UpdatePhase | 'idle' | 'error'>('idle')
  const progress = ref(0) // 0..1 (Upload-Anteil)
  const error = ref<string | null>(null)
  const running = computed(() => phase.value !== 'idle' && phase.value !== 'done' && phase.value !== 'error')

  /** Einordnung fuer die UI, abhaengig vom zuletzt abgerufenen /status. */
  function updateFor(status: PicoStatus | null): 'no-bundle' | 'no-status' | 'unsupported' | 'available' | 'up-to-date' {
    if (!manifest) return 'no-bundle'
    if (!status) return 'no-status'
    // Aeltere Firmware (0.2.0) kennt das Feld nicht; false = LittleFS fehlt.
    if (status.otaSupported !== true) return 'unsupported'
    return compareVersions(manifest.version, status.fwVersion) > 0 ? 'available' : 'up-to-date'
  }

  /** Kompletter Update-Lauf; bei Erfolg ist die Bridge mit neuer Version zurueck. */
  async function start(): Promise<{ ok: boolean; error?: string }> {
    if (!manifest) return { ok: false, error: 'Keine Firmware gebuendelt' }
    error.value = null
    progress.value = 0
    phase.value = 'uploading'
    try {
      const firmware = await loadBundledFirmware()
      await runFirmwareUpdate(client, manifest, firmware, {
        onProgress: (sent, total) => { progress.value = total > 0 ? sent / total : 0 },
        onPhase: (p) => { phase.value = p },
      })
      return { ok: true }
    } catch (e) {
      phase.value = 'error'
      error.value = (e as Error).message
      return { ok: false, error: error.value }
    }
  }

  function reset(): void {
    phase.value = 'idle'
    progress.value = 0
    error.value = null
  }

  return { manifest, phase, progress, error, running, updateFor, start, reset }
}
