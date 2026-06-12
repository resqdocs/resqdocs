// useMedicationLookup.ts - PZN→Name-Aufloesung, offline-first (#11).
//
// Quelle: das CC0-Community-Woerterbuch (resqdocs-pzn-data), als versioniertes
// Release-Artefakt. Der Lookup laeuft IMMER rein lokal aus dem Cache; der Sync
// ist NUTZERINITIIERT (Button in den Einstellungen) und laedt nur bei neuer
// Version - der einzige erlaubte Remote-Abruf neben der Bridge (SECURITY.md).
// Community-Daten sind UNVERIFIZIERT: Aufloesungen werden als 'community'
// markiert angezeigt (pruefbarer Entwurf).
import { computed, reactive } from 'vue'
import type { HttpAdapter } from '../pico/picoTypes.ts'
import type { KeyValueAdapter } from '../storage/types.ts'
import { loadDictionary, saveDictionary, type MedicationDictionary } from './medicationStore.ts'

/** Release-API des Daten-Repos (oeffentlich, kein Token). Seam: spaeter als Einstellung. */
export const PZN_RELEASES_API =
  'https://api.github.com/repos/resqdocs/pzn-data/releases/latest'

interface LookupState {
  loaded: boolean
  busy: boolean
  error: string | null
  version: number | null
  count: number
  updated: string | null
  fetchedAt: string | null
}

export function createMedicationLookup(http: HttpAdapter, kv: KeyValueAdapter, apiUrl = PZN_RELEASES_API) {
  const state = reactive<LookupState>({
    loaded: false, busy: false, error: null,
    version: null, count: 0, updated: null, fetchedAt: null,
  })
  let entries: Record<string, string> = {}

  function applyDictionary(d: MedicationDictionary): void {
    entries = d.entries
    state.version = d.version
    state.count = d.count
    state.updated = d.updated
    state.fetchedAt = d.fetchedAt
  }

  /** Cache laden (einmalig, offline). */
  async function ensureLoaded(): Promise<void> {
    if (state.loaded) return
    const d = await loadDictionary(kv)
    if (d) applyDictionary(d)
    state.loaded = true
  }

  /** Rein lokale Aufloesung; null wenn unbekannt/kein Woerterbuch. */
  function resolve(pzn: string): string | null {
    return entries[pzn] ?? null
  }

  /**
   * Nutzerinitiierter Sync: Manifest des neuesten Releases pruefen, Artefakt
   * nur bei neuer Version laden. Liefert eine kurze Statusmeldung.
   */
  async function syncNow(): Promise<string> {
    state.busy = true
    state.error = null
    try {
      await ensureLoaded()
      const rel = await http.get(apiUrl, { connectTimeout: 8000, readTimeout: 8000 })
      if (rel.status === 404) return 'Noch kein Release im Daten-Repo.'
      if (rel.status < 200 || rel.status >= 300) throw new Error(`Release-Abfrage fehlgeschlagen (HTTP ${rel.status})`)
      const relData = (typeof rel.data === 'string' ? JSON.parse(rel.data) : rel.data) as {
        assets?: { name: string; browser_download_url: string }[]
      }
      const manifestAsset = relData.assets?.find((a) => a.name === 'manifest.json')
      if (!manifestAsset) return 'Release ohne manifest.json - Daten-Repo pruefen.'
      const mf = await http.get(manifestAsset.browser_download_url, { connectTimeout: 8000, readTimeout: 8000 })
      const manifest = (typeof mf.data === 'string' ? JSON.parse(mf.data) : mf.data) as {
        version: number; count: number; updated: string; file: string
      }
      if (state.version !== null && manifest.version <= state.version) {
        return `Bereits aktuell (Version ${state.version}, ${state.count} Einträge).`
      }
      const dataAsset = relData.assets?.find((a) => a.name === manifest.file)
      if (!dataAsset) return `Artefakt ${manifest.file} fehlt im Release.`
      const res = await http.get(dataAsset.browser_download_url, { connectTimeout: 8000, readTimeout: 30000 })
      if (res.status < 200 || res.status >= 300) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`)
      const artifact = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as {
        version: number; updated: string; count: number; entries: Record<string, string>
      }
      const dict: MedicationDictionary = {
        version: artifact.version,
        count: artifact.count,
        updated: artifact.updated,
        fetchedAt: new Date().toISOString(),
        entries: artifact.entries ?? {},
      }
      await saveDictionary(kv, dict)
      applyDictionary(dict)
      return `Aktualisiert auf Version ${dict.version} (${dict.count} Einträge).`
    } catch (e) {
      state.error = (e as Error).message
      return `Aktualisierung fehlgeschlagen: ${state.error}`
    } finally {
      state.busy = false
    }
  }

  const status = computed(() =>
    state.version === null
      ? 'Kein Wörterbuch geladen.'
      : `Version ${state.version} · ${state.count} Einträge · Datenstand ${state.updated?.slice(0, 10) ?? '?'}`,
  )

  return { state, status, ensureLoaded, resolve, syncNow }
}

// --- App-Singleton (UI greift nur hierueber zu) --------------------------------
import { capacitorHttpAdapter } from '../pico/httpAdapter.ts'
import { preferencesAdapter } from '../storage/preferencesAdapter.ts'

let shared: ReturnType<typeof createMedicationLookup> | null = null
export function useMedicationLookup() {
  if (!shared) shared = createMedicationLookup(capacitorHttpAdapter, preferencesAdapter)
  return shared
}
