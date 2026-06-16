// usePznLibrary.ts — Vue-Anbindung (Singleton) der nutzergepflegten PZN-Bibliothek.
//
// Kapselt das Repository (Capacitor Preferences) + die reine Mengen-Logik. KEIN
// Netzzugriff, KEINE automatische PZN→Name-Auflösung (Bezeichnungen kommen nur vom
// Nutzer). Getrennt vom Einsatzentwurf/Protokoll (#173).
import { ref } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { createPznLibraryRepository } from './pznLibraryRepository'
import {
  addManyDecoupled,
  addOne as addOnePure,
  addPzn,
  emptyLibrary,
  exportLibrary,
  getLabel as getLabelPure,
  hasPzn,
  importMerge,
  listSorted,
  normalizePzn,
  parseImport,
  removePzn,
  setLabel as setLabelPure,
  type PznEntry,
  type PznLibrary,
} from './pznLibrary'

function create() {
  const repo = createPznLibraryRepository(preferencesAdapter)
  const lib = ref<PznLibrary>(emptyLibrary())
  let loaded = false

  async function ensureLoaded(): Promise<void> {
    if (loaded) return
    lib.value = await repo.load()
    loaded = true
  }
  async function persist(): Promise<void> {
    await repo.save(lib.value)
  }

  /** Sortierte Liste (nach PZN) — keine Einfüge-Reihenfolge nach außen. */
  function list(): PznEntry[] {
    return listSorted(lib.value)
  }

  /** Eigene Bezeichnung zu einer PZN (Re-Scan-Vorbefüllung); null wenn unbekannt. */
  function ownLabel(pzn: string): string | null {
    return getLabelPure(lib.value, pzn)
  }

  async function add(raw: string, label?: string): Promise<void> {
    lib.value = addPzn(lib.value, raw, label)
    await persist()
  }
  /**
   * Einzel-Transfer aus dem Protokoll: GENAU EINE PZN (bewusste Nutzerhandlung,
   * kein Bulk). Dedup + Konfliktregel (vorhandenes Label gewinnt). KEINE
   * Gruppierung/Reihenfolge/Zeit/Fall-Verknüpfung. Liefert das Ergebnis zurück:
   * 'invalid' (keine PZN), 'added' (neu) oder 'exists' (war schon da) — nur fürs UI-Feedback.
   */
  async function addOne(raw: string, label?: string): Promise<'invalid' | 'added' | 'exists'> {
    if (!normalizePzn(raw)) return 'invalid'
    const already = hasPzn(lib.value, raw)
    lib.value = addOnePure(lib.value, raw, label)
    await persist()
    return already ? 'exists' : 'added'
  }
  async function setLabel(pzn: string, label: string): Promise<void> {
    lib.value = setLabelPure(lib.value, pzn, label)
    await persist()
  }
  async function remove(pzn: string): Promise<void> {
    lib.value = removePzn(lib.value, pzn)
    await persist()
  }
  /** Plan-/Mehrfach-Scan ENTKOPPELT übernehmen (Reihenfolge/Gruppierung/Zeit fallen weg). */
  async function addMany(rawPzns: string[]): Promise<void> {
    lib.value = addManyDecoupled(lib.value, rawPzns)
    await persist()
  }

  /** Backup: Export als JSON-String (nur PZN + Bezeichnungen, sortiert). */
  function exportJson(): string {
    return JSON.stringify(exportLibrary(lib.value), null, 2)
  }
  /** Backup: Import/Restore (Mengen-Vereinigung; keine Linkage). false wenn ungültig. */
  async function importJson(text: string): Promise<boolean> {
    let incoming: PznLibrary | null = null
    try {
      incoming = parseImport(JSON.parse(text))
    } catch {
      incoming = null
    }
    if (!incoming) return false
    lib.value = importMerge(lib.value, incoming)
    await persist()
    return true
  }

  return { lib, list, ensureLoaded, ownLabel, add, addOne, setLabel, remove, addMany, exportJson, importJson }
}

let shared: ReturnType<typeof create> | null = null
export function usePznLibrary() {
  if (!shared) shared = create()
  return shared
}
