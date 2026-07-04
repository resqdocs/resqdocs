// pznLibraryNativeBackend.ts — natives SQLite-Backend der PZN-Bibliothek (#194/#195).
//
// Wird vom Composable NUR auf nativen Plattformen DYNAMISCH importiert (Code-Split) —
// zieht capacitorSqlClient (das native Plugin), das der Web-Build nicht lädt. Öffnet die
// GETEILTE DB-Verbindung, führt Migrationen aus, macht einen einmaligen, idempotenten
// Backfill aus dem alten Preferences-Blob (Blob bleibt als Fallback erhalten) und
// adaptiert das reine SQLite-Repo auf die PznLibraryBackend-Schnittstelle.
import type { KeyValueAdapter } from '../storage/types.ts'
import { getSharedCapacitorSqlClient } from '../storage/sqlite/capacitorSqlClient'
import {
  createPznLibrarySqliteRepository,
  type PznSqliteRepository,
} from './pznLibrarySqliteRepository.ts'
import { PZN_LIBRARY_KEY } from './pznLibraryRepository.ts'
import { listSorted, parseImport } from './pznLibrary.ts'
import type { PznLibraryBackend } from './pznLibraryBackend.ts'

export function createNativePznBackend(adapter: KeyValueAdapter): PznLibraryBackend {
  let ready: Promise<PznSqliteRepository> | null = null

  async function init(): Promise<PznSqliteRepository> {
    // Migrationen liefen bereits in getSharedCapacitorSqlClient (genau einmal).
    const client = await getSharedCapacitorSqlClient()
    const repo = createPznLibrarySqliteRepository(client)
    // Einmal-Backfill aus dem alten Preferences-Blob, NUR wenn die Tabelle leer ist
    // (idempotent). BEST-EFFORT: ein Fehler hier darf das Backend NIE lahmlegen — die
    // Tabelle bleibt nutzbar, der Nutzer kann neu erfassen/importieren.
    try {
      if ((await repo.count()) === 0) {
        const raw = await adapter.get(PZN_LIBRARY_KEY)
        if (raw) {
          let incoming = null
          try {
            incoming = parseImport(JSON.parse(raw))
          } catch {
            incoming = null
          }
          if (incoming) await repo.bulkPut(listSorted(incoming), 'overwrite')
        }
      }
    } catch {
      // Backfill best-effort; Tabelle bleibt nutzbar.
    }
    return repo
  }

  function repo(): Promise<PznSqliteRepository> {
    if (!ready) ready = init()
    return ready
  }

  return {
    async ensureReady() {
      await repo()
    },
    async count() {
      return (await repo()).count()
    },
    async countMissingStaerke() {
      return (await repo()).countMissingStaerke()
    },
    async getEntry(pzn) {
      return (await repo()).getEntry(pzn)
    },
    async page(opts) {
      return (await repo()).page(opts)
    },
    async search(query, opts) {
      return (await repo()).search(query, opts)
    },
    async allSorted() {
      return (await repo()).allSorted()
    },
    async setEntry(pzn, data) {
      return (await repo()).setEntry(pzn, data)
    },
    async setWirkstoff(pzn, wirkstoff) {
      return (await repo()).setWirkstoff(pzn, wirkstoff)
    },
    async setStaerke(pzn, staerke) {
      return (await repo()).setStaerke(pzn, staerke)
    },
    async setLabel(pzn, label) {
      return (await repo()).setLabel(pzn, label)
    },
    async setCategory(pzn, category) {
      return (await repo()).setCategory(pzn, category)
    },
    async setNote(pzn, note) {
      return (await repo()).setNote(pzn, note)
    },
    async remove(pzn) {
      return (await repo()).remove(pzn)
    },
    async clear() {
      return (await repo()).clear()
    },
    async bulkPut(entries, mode, chunkSize, onProgress) {
      return (await repo()).bulkPut(entries, mode, chunkSize, onProgress)
    },
  }
}
