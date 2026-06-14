import { useStorage } from '@/storage/useStorage'
import { useMedicationLookup } from './useMedicationLookup'
import { createPznNotice, type PznNotice } from './pznNotice'

/**
 * Singleton-Anbindung des PZN-Aktualitaets-Hinweises (Muster useFirmwareNotice):
 * Banner und Einstellungen teilen denselben Zustand. Logik (testbar): pznNotice.ts.
 * Der optionale Hintergrund-Check laeuft NUR bei aktivem Opt-in (settings.pznAutoCheck).
 */
let shared: PznNotice | null = null

export function usePznNotice(): PznNotice {
  if (!shared) {
    const storage = useStorage()
    const lookup = useMedicationLookup()
    shared = createPznNotice({
      getState: () => ({ version: lookup.state.version, fetchedAt: lookup.state.fetchedAt }),
      autoCheckEnabled: () => storage.settings.pznAutoCheck,
      fetchRemoteVersion: () => lookup.fetchRemoteVersion(),
    })
  }
  return shared
}
