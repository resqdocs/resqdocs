// useReworkCaseDraft.ts — duenner Vue-/Capacitor-Wrapper um reworkCaseDraftController: bindet den
// Preferences-Adapter (iOS UserDefaults -> uebersteht App-Schliessen/Crash/Akku-Tod, KEINE WKWebView-
// Eviction) und die caseDraftTtlHours aus den Settings an die reine Controller-Logik. Singleton -> EINE
// Quelle fuer Restore, Auto-Save, Loeschen UND die laufende Ablaufpruefung.
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { useStorage } from '@/storage/useStorage'
import { createReworkCaseDraftRepository } from '@resqdocs/protocol-core/caseDraftRepository'
import { createReworkCaseDraftController, type ReworkCaseDraftController } from './reworkCaseDraftController'

let shared: ReworkCaseDraftController | null = null

export function useReworkCaseDraft(): ReworkCaseDraftController {
  if (!shared) {
    const storage = useStorage()
    const repo = createReworkCaseDraftRepository(preferencesAdapter)
    shared = createReworkCaseDraftController(repo, {
      ttlHours: () => storage.settings.caseDraftTtlHours,
    })
  }
  return shared
}
