import { reactive, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { preferencesAdapter } from './preferencesAdapter'
import { createSettingsRepository } from './settingsRepository'
import { createMemoryLibraryRepository } from './memoryLibraryRepository'
import { DEFAULT_SETTINGS, type AppSettings, type LibraryRepository } from './types'

/**
 * Gekapselte Storage-Schicht (DR-0004).
 *
 * - **Settings:** Capacitor Preferences (über preferencesAdapter) — #13-F1.
 * - **Library:** auf nativen Plattformen **SQLite** (#13-F2, dynamisch geladen),
 *   im Web-Dev **In-Memory-Fallback** — beide hinter demselben
 *   LibraryRepository-Interface (kein UI-/Session-Code ändert sich).
 *
 * UI/Composables greifen NIE direkt auf Preferences/SQLite/Browser-Storage zu.
 * `caseState` bleibt flüchtig und ist NICHT Teil des Storage.
 */
const settingsRepo = createSettingsRepository(preferencesAdapter)

let shared: ReturnType<typeof create> | null = null

function create() {
  const settings = reactive<AppSettings>({ ...DEFAULT_SETTINGS })
  /** true, sobald loadSettings() durch ist (#147): UI, die von persistierten
   *  Settings abhaengt (z. B. Onboarding-Tour), wartet darauf - sonst rendert
   *  sie kurz auf Basis der Defaults und verschwindet wieder. */
  const settingsLoaded = ref(false)

  // Library: Default In-Memory; auf nativer Plattform via initLibrary() → SQLite.
  let libraryRepo: LibraryRepository = createMemoryLibraryRepository()
  const libraryMode = ref<'memory' | 'sqlite'>('memory')
  let libraryInit: Promise<void> | null = null

  async function loadSettings(): Promise<void> {
    try {
      Object.assign(settings, await settingsRepo.loadSettings())
    } finally {
      settingsLoaded.value = true
    }
  }
  async function saveSettings(patch?: Partial<AppSettings>): Promise<void> {
    if (patch) Object.assign(settings, patch)
    await settingsRepo.saveSettings({ ...settings })
  }
  async function resetSettings(): Promise<void> {
    await settingsRepo.resetSettings()
    Object.assign(settings, DEFAULT_SETTINGS)
  }

  /** Auf nativer Plattform SQLite verbinden (einmalig); sonst Memory-Fallback. */
  async function initLibrary(): Promise<void> {
    if (libraryInit) return libraryInit
    libraryInit = (async () => {
      if (!Capacitor.isNativePlatform()) return // Web-Dev: Memory (DR-0004, keine jeep-sqlite-Dependency)
      try {
        const { createSqliteLibraryRepository } = await import('./sqlite/capacitorSqlClient')
        libraryRepo = await createSqliteLibraryRepository()
        libraryMode.value = 'sqlite'
      } catch (err) {
        // SQLite nicht verfügbar ⇒ Memory-Fallback; Fehler sichtbar machen.
        console.error('SQLite-Library nicht verfügbar, nutze In-Memory:', err)
        libraryMode.value = 'memory'
      }
    })()
    return libraryInit
  }
  function getLibraryRepository(): LibraryRepository {
    return libraryRepo
  }

  /** Löscht ALLE Library-Inhalte (Protokolle, Bausteine, Snippets) — NICHT die Settings. */
  async function resetLibrary(): Promise<void> {
    await initLibrary()
    await libraryRepo.resetLibrary()
  }

  return {
    settings,
    settingsLoaded,
    loadSettings,
    saveSettings,
    resetSettings,
    settingsRepo,
    // Library (#13-F2): Backend gekapselt, Modus für UI-Anzeige.
    libraryMode,
    initLibrary,
    getLibraryRepository,
    resetLibrary,
  }
}

export function useStorage() {
  if (!shared) shared = create()
  return shared
}
