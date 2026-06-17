// pznLibraryRepository.ts — Persistenz der nutzergepflegten PZN-Bibliothek.
//
// EIGENER Key, GETRENNT von Einsatzentwurf (#173, case.draft.temp), Protokoll/
// Library und dem (deaktivierten) alten Wörterbuch (medications.dictionary). Keine
// gemeinsame Transaktion. Speicherform = Export-Form (sortierte Menge), damit auch
// im Storage keine Einfüge-Reihenfolge/Linkage liegt.
import { exportLibrary, parseImport, emptyLibrary, type PznLibrary } from './pznLibrary.ts'
import type { KeyValueAdapter } from '../storage/types.ts'

export const PZN_LIBRARY_KEY = 'pzn.library'

export interface PznLibraryRepository {
  load(): Promise<PznLibrary>
  save(lib: PznLibrary): Promise<void>
  clear(): Promise<void>
}

export function createPznLibraryRepository(adapter: KeyValueAdapter): PznLibraryRepository {
  return {
    async load() {
      const raw = await adapter.get(PZN_LIBRARY_KEY)
      if (!raw) return emptyLibrary()
      try {
        return parseImport(JSON.parse(raw)) ?? emptyLibrary()
      } catch {
        return emptyLibrary()
      }
    },
    async save(lib) {
      await adapter.set(PZN_LIBRARY_KEY, JSON.stringify(exportLibrary(lib)))
    },
    async clear() {
      await adapter.remove(PZN_LIBRARY_KEY)
    },
  }
}
