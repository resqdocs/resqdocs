// pznLibraryBackend.ts — async Persistenz-Abstraktion der PZN-Bibliothek (#194/#195).
//
// EINE async Schnittstelle, zwei Implementierungen:
//  - nativ (iOS/Android): SQLite (pznLibraryNativeBackend.ts) — skaliert auf ~317k,
//    granulare Writes, SQL-Paging/Suche.
//  - Web/Dev: Capacitor Preferences als ein JSON-Blob, vollständig im Speicher
//    (hier, createPreferencesPznBackend) — Web ist kein Skalierungsziel.
//
// Alle fachliche Logik (Sanitizing, feste Kategorien, Merge-/Konfliktregeln) liegt in
// der geteilten reinen pznLibrary.ts; die Backends sind reine Persistenz.
import type { KeyValueAdapter } from '../storage/types.ts'
import { PZN_LIBRARY_KEY } from './pznLibraryRepository.ts'
import {
  count as countPure,
  emptyLibrary,
  exportLibrary,
  filterEntries,
  getEntry as getEntryPure,
  listSorted,
  normalizePzn,
  parseImport,
  removePzn,
  setCategory as setCategoryPure,
  setLabel as setLabelPure,
  setNote as setNotePure,
  setWirkstoff as setWirkstoffPure,
  sortEntries,
  upsertEntry,
  type ImportMode,
  type PznEntry,
  type PznEntryData,
  type PznLibrary,
} from './pznLibrary.ts'

export interface PznPageOpts {
  offset: number
  limit: number
  dir?: 'asc' | 'desc'
}

/** Async Persistenz der PZN-Bibliothek. Liste/Suche/Count laufen seitenweise. */
export interface PznLibraryBackend {
  ensureReady(): Promise<void>
  count(): Promise<number>
  getEntry(pzn: string): Promise<PznEntry | null>
  page(opts: PznPageOpts): Promise<PznEntry[]>
  search(query: string, opts: { offset: number; limit: number }): Promise<PznEntry[]>
  allSorted(): Promise<PznEntry[]>
  setEntry(pzn: string, data: PznEntryData): Promise<void>
  setWirkstoff(pzn: string, wirkstoff: string): Promise<void>
  setLabel(pzn: string, label: string): Promise<void>
  setCategory(pzn: string, category: string): Promise<void>
  setNote(pzn: string, note: string): Promise<void>
  remove(pzn: string): Promise<void>
  clear(): Promise<void>
  /** Import/Backfill: 'overwrite' = Import gewinnt, 'skip' = Duplikate überspringen. Nie Löschung. */
  bulkPut(
    entries: PznEntry[],
    mode: ImportMode,
    chunkSize?: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void>
}

/**
 * Web-/Fallback-Backend: hält die gesamte Bibliothek im Speicher und persistiert sie
 * als EIN Preferences-JSON-Blob (wie bisher). Für Web ausreichend (kein Skalierungsfall);
 * nutzt die reine pznLibrary.ts-Logik, damit Verhalten 1:1 zum nativen Backend passt.
 */
export function createPreferencesPznBackend(adapter: KeyValueAdapter): PznLibraryBackend {
  let lib: PznLibrary = emptyLibrary()
  let loaded = false
  const persist = (): Promise<void> => adapter.set(PZN_LIBRARY_KEY, JSON.stringify(exportLibrary(lib)))

  return {
    async ensureReady() {
      if (loaded) return
      const raw = await adapter.get(PZN_LIBRARY_KEY)
      if (raw) {
        try {
          lib = parseImport(JSON.parse(raw)) ?? emptyLibrary()
        } catch {
          lib = emptyLibrary()
        }
      }
      loaded = true
    },
    async count() {
      return countPure(lib)
    },
    async getEntry(pzn) {
      return getEntryPure(lib, pzn)
    },
    async page({ offset, limit, dir = 'asc' }) {
      return sortEntries(listSorted(lib), 'pzn', dir).slice(offset, offset + limit)
    },
    async search(query, { offset, limit }) {
      return filterEntries(listSorted(lib), query).slice(offset, offset + limit)
    },
    async allSorted() {
      return listSorted(lib)
    },
    async setEntry(pzn, data) {
      lib = upsertEntry(lib, pzn, { wirkstoff: data.wirkstoff, label: data.label, category: data.category, note: data.note })
      await persist()
    },
    async setWirkstoff(pzn, wirkstoff) {
      lib = setWirkstoffPure(lib, pzn, wirkstoff)
      await persist()
    },
    async setLabel(pzn, label) {
      lib = setLabelPure(lib, pzn, label)
      await persist()
    },
    async setCategory(pzn, category) {
      lib = setCategoryPure(lib, pzn, category)
      await persist()
    },
    async setNote(pzn, note) {
      lib = setNotePure(lib, pzn, note)
      await persist()
    },
    async remove(pzn) {
      lib = removePzn(lib, pzn)
      await persist()
    },
    async clear() {
      lib = emptyLibrary()
      await persist()
    },
    async bulkPut(entries, mode, _chunkSize, onProgress) {
      let i = 0
      for (const e of entries) {
        const norm = normalizePzn(e.pzn)
        i++
        if (norm && !(mode === 'skip' && norm in lib.entries)) {
          lib = upsertEntry(lib, norm, { wirkstoff: e.wirkstoff, label: e.label, category: e.category, note: e.note })
        }
        if (i % 500 === 0) onProgress?.(i, entries.length)
      }
      await persist()
      onProgress?.(entries.length, entries.length)
    },
  }
}
