import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from './httpAdapter'
import { createPicoClient } from './picoClient'
import { createFirmwareNotice, type FirmwareNotice } from './firmwareNotice'
import { bundledManifest } from './firmwareAsset'

/**
 * Singleton-Anbindung des Firmware-Aktualitaets-Checks (#134, Muster
 * useDisclaimer): Einsatz, Header und Einstellungen teilen denselben
 * Hinweis-Zustand. Logik (testbar): firmwareNotice.ts.
 */
let shared: FirmwareNotice | null = null

export function useFirmwareNotice(): FirmwareNotice {
  if (!shared) {
    const storage = useStorage()
    const client = createPicoClient(capacitorHttpAdapter, () => storage.settings.picoBaseUrl)
    shared = createFirmwareNotice({ manifest: bundledManifest(), fetchStatus: () => client.status() })
  }
  return shared
}
