// useMedicationLookup.ts - PZN→Name-Aufloesung, offline-first (#11).
//
// Quelle: das CC0-Community-Woerterbuch, ausgeliefert als statisches, versioniertes
// Artefakt ueber die offizielle Webseite (manifest.json + Daten-Datei). Der Lookup
// laeuft IMMER rein lokal aus dem Cache; der Sync ist NUTZERINITIIERT (Button in den
// Einstellungen) und laedt nur bei neuer Version - der einzige erlaubte Remote-Abruf
// neben der Bridge (SECURITY.md).
// Community-Daten sind UNVERIFIZIERT: Aufloesungen werden als 'community'
// markiert angezeigt (pruefbarer Entwurf).
import { computed, reactive } from 'vue'
import type { HttpAdapter } from '../pico/picoTypes.ts'
import type { KeyValueAdapter } from '../storage/types.ts'
import { loadDictionary, saveDictionary, type MedicationDictionary } from './medicationStore.ts'
import { PZN_DICTIONARY_ENABLED } from './featureFlags.ts'

/**
 * Manifest des PZN-Woerterbuchs, ausgeliefert ueber die offizielle Webseite
 * (statisch, HTTPS, kein Token). Das Daten-Artefakt liegt relativ daneben
 * (manifest.file). Seam: spaeter als Einstellung ueberschreibbar.
 */
export const PZN_MANIFEST_URL = 'https://resqdocs.app/pzn/manifest.json'

interface LookupState {
  loaded: boolean
  busy: boolean
  error: string | null
  version: number | null
  count: number
  updated: string | null
  fetchedAt: string | null
}

export function createMedicationLookup(
  http: HttpAdapter,
  kv: KeyValueAdapter,
  manifestUrl = PZN_MANIFEST_URL,
  // Deaktiviert per Default (IFA/DSGVO, featureFlags). Injizierbar, damit der
  // erhaltene Code-Pfad hinter dem Flag testbar bleibt.
  enabled: boolean = PZN_DICTIONARY_ENABLED,
) {
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
    // Deaktiviert (IFA/DSGVO): kein Wörterbuch laden, keine Auflösung. Code bleibt.
    if (!enabled) { state.loaded = true; return }
    const d = await loadDictionary(kv)
    if (d) applyDictionary(d)
    state.loaded = true
  }

  /**
   * Rein lokale Aufloesung; null wenn unbekannt/kein Woerterbuch.
   *
   * PZN-Schluessel sind 8-stellig (mit fuehrender Null), BMP liefert sie aber oft
   * ohne fuehrende Null (z. B. "2953075"). Aufloesung:
   * - exakter Treffer wird bevorzugt (bestehende 8-stellige Werte unveraendert);
   * - sonst wird der Wert getrimmt und auf Ziffern reduziert;
   * - rein numerische Werte mit WENIGER als 8 Stellen werden links mit Nullen
   *   aufgefuellt (padStart) und nachgeschlagen;
   * - Werte mit MEHR als 8 Ziffern werden NICHT gekuerzt -> kein Treffer (null);
   * - leere/nicht-numerische Eingaben liefern null.
   */
  function resolve(pzn: string): string | null {
    // Deaktiviert (IFA/DSGVO): KEINE automatische PZN→Name-Auflösung.
    if (!enabled) return null
    if (!pzn) return null
    const direct = entries[pzn]
    if (direct !== undefined) return direct
    const digits = pzn.trim().replace(/\D/g, '')
    if (!digits) return null
    // Kein Truncate: >8 Ziffern bleiben unveraendert und treffen den 8-stelligen
    // Key nicht -> null (lieber kein Treffer als ein falscher).
    return entries[digits.padStart(8, '0')] ?? null
  }

  /** Daten-Artefakt liegt relativ zum Manifest (gleiches Verzeichnis). */
  function resolveDataUrl(file: string): string {
    return manifestUrl.replace(/[^/]*$/, '') + file
  }

  /**
   * Nur die (winzige) Manifest-Version lesen - fuer den optionalen
   * Hintergrund-Aktualitaets-Check (pznNotice, Opt-in). Laedt NICHT die Daten-
   * Datei. Liefert die Remote-Version oder null (Fehler/404/ungueltig werden
   * geschluckt - der Check darf nie stoeren). Einzige Remote-URL bleibt das
   * Manifest dieser App-Konstante (SECURITY.md, Single Source).
   */
  async function fetchRemoteVersion(): Promise<number | null> {
    // Deaktiviert (IFA/DSGVO): KEIN Netzabruf.
    if (!enabled) return null
    try {
      const mf = await http.get(manifestUrl, { connectTimeout: 8000, readTimeout: 8000 })
      if (mf.status < 200 || mf.status >= 300) return null
      const manifest = (typeof mf.data === 'string' ? JSON.parse(mf.data) : mf.data) as { version?: unknown }
      return typeof manifest?.version === 'number' ? manifest.version : null
    } catch {
      return null
    }
  }

  /**
   * Nutzerinitiierter Sync: Manifest pruefen, Daten-Artefakt nur bei neuer
   * Version laden. Liefert eine kurze Statusmeldung.
   */
  async function syncNow(): Promise<string> {
    // Deaktiviert (IFA/DSGVO): KEIN Download eines PZN-Datenbestands.
    if (!enabled) return 'PZN-Wörterbuch deaktiviert.'
    state.busy = true
    state.error = null
    try {
      await ensureLoaded()
      const mf = await http.get(manifestUrl, { connectTimeout: 8000, readTimeout: 8000 })
      if (mf.status === 404) return 'Noch keine Daten veröffentlicht.'
      if (mf.status < 200 || mf.status >= 300) throw new Error(`Manifest-Abruf fehlgeschlagen (HTTP ${mf.status})`)
      const manifest = (typeof mf.data === 'string' ? JSON.parse(mf.data) : mf.data) as {
        version: number; count: number; updated: string; file: string
      }
      if (!manifest?.file || typeof manifest.version !== 'number') return 'Ungültiges Manifest - Datenquelle prüfen.'
      if (state.version !== null && manifest.version <= state.version) {
        return `Bereits aktuell (Version ${state.version}, ${state.count} Einträge).`
      }
      const res = await http.get(resolveDataUrl(manifest.file), { connectTimeout: 8000, readTimeout: 30000 })
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

  return { state, status, ensureLoaded, resolve, syncNow, fetchRemoteVersion }
}

// --- App-Singleton (UI greift nur hierueber zu) --------------------------------
import { capacitorHttpAdapter } from '../pico/httpAdapter.ts'
import { preferencesAdapter } from '../storage/preferencesAdapter.ts'

let shared: ReturnType<typeof createMedicationLookup> | null = null
export function useMedicationLookup() {
  if (!shared) shared = createMedicationLookup(capacitorHttpAdapter, preferencesAdapter)
  return shared
}
