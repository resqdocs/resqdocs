// useTemporaryCaseDraft.ts — Capacitor-/Settings-Bindung + Singleton des
// temporären Einsatzentwurfs (#173). Die eigentliche Logik (inkl. Race-Schutz
// und TTL) liegt entkoppelt + testbar in temporaryCaseDraftController.ts.
//
// Ablaufprüfung erfolgt: beim Start (restore), beim Resume/periodisch (checkExpiry),
// vor dem Laden (im Repository) und vor jedem Speichern (persistNow prüft den
// vorherigen Stand). Reines Öffnen/Anzeigen/Navigieren verlängert die TTL NICHT —
// nur echte Änderungen rufen markChanged().
import { useStorage } from '@/storage/useStorage'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { createTemporaryCaseDraftRepository } from './temporaryCaseDraftRepository'
import { createTemporaryCaseDraftController } from './temporaryCaseDraftController'

function create() {
  const storage = useStorage()
  return createTemporaryCaseDraftController({
    repo: createTemporaryCaseDraftRepository(preferencesAdapter),
    ttlHours: () => storage.settings.caseDraftTtlHours,
  })
}

let shared: ReturnType<typeof create> | null = null

/** Singleton — EINE Quelle für Einsatz-Runtime, App-Lifecycle und Einstellungen. */
export function useTemporaryCaseDraft() {
  if (!shared) shared = create()
  return shared
}
