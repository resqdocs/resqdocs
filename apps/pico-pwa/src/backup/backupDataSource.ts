// backupDataSource.ts — App-Verdrahtung der Backup-Ports auf die echten Repos (nativ). Trennt die vier
// Datensätze sauber: Protokolle/Bausteine über die Rework-Provider, Snippets über useStorage-LibraryRepo,
// PZN direkt über den geteilten SQLite-Client. Reine Persistenz-Schicht; die Live-UI-Reloads macht useBackup.
import { resolveProtocolRepository, resolveBlockRepository, getPersistenceDegradedReason } from '@resqdocs/protocol-core-ui/repositoryProvider'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import { useStorage } from '../storage/useStorage.ts'
import { getSharedCapacitorSqlClient } from '../storage/sqlite/capacitorSqlClient.ts'
import { createPznLibrarySqliteRepository } from '../medications/pznLibrarySqliteRepository.ts'
import { fromEntries, listSorted, emptyLibrary, type PznLibrary } from '../medications/pznLibrary.ts'
import type { BackupDataSource } from './backupService.ts'
import type { RestoreTargets } from './backup.ts'

/** Read-Quelle für den Envelope-Bau. */
export function createAppBackupDataSource(app: { version: string; build?: string }): BackupDataSource {
  return {
    degradedReason: () => getPersistenceDegradedReason(),
    loadProtocols: async () => (await resolveProtocolRepository()).loadAll(),
    loadBlocks: async () => (await resolveBlockRepository()).loadAll(),
    loadSnippets: async (): Promise<SnippetPayload[]> => {
      const storage = useStorage()
      await storage.initLibrary()
      const rows = await storage.getLibraryRepository().loadSnippets()
      return rows.map((s) => ({ title: s.title, text: s.text }))
    },
    loadPzn: async (): Promise<PznLibrary | null> => {
      const repo = createPznLibrarySqliteRepository(await getSharedCapacitorSqlClient())
      const entries = await repo.allSorted()
      return entries.length === 0 ? null : fromEntries(entries)
    },
    appInfo: () => app,
  }
}

/** Additive/ersetzende Restore-Ziele auf den echten Repos (nativ). Der additive Schutz kommt aus backup.ts
 *  (kollisionsfreie ids); die Reset-Methoden werden NUR im Ersetzen-Modus aufgerufen. */
export function createAppRestoreTargets(now: () => string = () => new Date().toISOString()): RestoreTargets {
  const lib = async () => {
    const storage = useStorage()
    await storage.initLibrary()
    return storage.getLibraryRepository()
  }
  const pzn = async () => createPznLibrarySqliteRepository(await getSharedCapacitorSqlClient())

  return {
    loadProtocols: async () => (await resolveProtocolRepository()).loadAll(),
    saveProtocol: async (t) => (await resolveProtocolRepository()).save(t),
    loadBlocks: async () => (await resolveBlockRepository()).loadAll(),
    saveBlock: async (t) => (await resolveBlockRepository()).save(t),
    existingSnippetIds: async () => (await (await lib()).loadSnippets()).map((s) => s.id),
    saveSnippet: async (s) => {
      const ts = now()
      await (await lib()).saveSnippet({ id: s.id, title: s.title, text: s.text, createdAt: ts, updatedAt: ts })
    },
    loadPzn: async () => fromEntries(await (await pzn()).allSorted()),
    savePzn: async (l) => {
      // die gemergte Bibliothek persistieren (Superset des aktuellen Stands -> 'overwrite' schreibt sie fest).
      await (await pzn()).bulkPut(listSorted(l), 'overwrite')
    },
    // Schlanker Restore-Pfad: nur das Eingehende additiv schreiben (INSERT OR IGNORE = lokal gewinnt), chunked
    // mit Fortschritt — derselbe bewährte bulkPut, den der eigenständige PZN-Import nutzt. KEIN Voll-Read/Merge.
    putPzn: async (l, onProgress) => {
      await (await pzn()).bulkPut(listSorted(l), 'skip', undefined, onProgress)
    },
    countPzn: async () => (await pzn()).count(),
    resetProtocols: async () => (await resolveProtocolRepository()).reset(),
    resetBlocks: async () => (await resolveBlockRepository()).reset(),
    resetSnippets: async () => {
      const repo = await lib()
      for (const s of await repo.loadSnippets()) await repo.deleteSnippet(s.id)
    },
    resetPzn: async () => {
      await (await pzn()).clear()
    },
  }
}

/** Leere PZN-Bibliothek (für Aufrufer, die einen Default brauchen). */
export const emptyPznLibrary = emptyLibrary
