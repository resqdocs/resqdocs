// capacitorSqlClient.ts — nativer SqlClient über @capacitor-community/sqlite (DR-0004).
//
// Die EINZIGE Stelle, die das SQLite-Plugin berührt. Wird von useStorage NUR auf
// nativen Plattformen DYNAMISCH importiert (Code-Split) — der Web-Build/-Runtime
// lädt das native Plugin nicht. UI/Repositories kennen nur SqlClient/LibraryRepository.
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { SqlClient, SqlRow } from './sqlClient'
import type { LibraryRepository } from '../types'
import { runMigrations } from './sqliteMigrations'
import { createLibraryRepositoryOnClient } from './sqliteLibraryRepository'

const DB_NAME = 'resqdocs-library'

export async function createCapacitorSqlClient(): Promise<SqlClient> {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await db.open()

  // Transaktions-Mutex auf der GETEILTEN Verbindung. Library- und PZN-Backend teilen
  // EINE Verbindung; bulkPut yieldet zwischen den Zeilen. Ohne Serialisierung könnten
  // zwei Transaktionen (z. B. Import + Backfill) verschränken → auf iOS ein rohes,
  // verschachteltes „BEGIN TRANSACTION" (Android wirft „Already in transaction", iOS hat
  // KEINEN Guard) → Crash, und der Rollback würde die andere Transaktion mit zerstören.
  let txChain: Promise<unknown> = Promise.resolve()

  return {
    // transaction=false: das Plugin wickelt Einzelstatements NICHT in eine eigene
    // BEGIN/COMMIT-Klammer — SQLite committet im Autocommit. Echtes Bündeln läuft
    // über transaction() (sonst gäbe es „BEGIN innerhalb BEGIN" → Geräte-Crash).
    async execute(statement) {
      await db.execute(statement, false)
    },
    async run(statement, values = []) {
      await db.run(statement, values, false)
    },
    async query(statement, values = []) {
      const res = await db.query(statement, values)
      return (res.values ?? []) as SqlRow[]
    },
    transaction(work) {
      const runTx = txChain.then(async () => {
        // Defensiv + plattform-symmetrisch: nie ein verschachteltes BEGIN absetzen.
        const active = await db.isTransactionActive()
        if (active.result) {
          throw new Error('SqlClient.transaction: bereits eine Transaktion auf der geteilten Verbindung aktiv')
        }
        await db.beginTransaction()
        try {
          await work()
          await db.commitTransaction()
        } catch (err) {
          // Ein fehlschlagender Rollback darf die EIGENTLICHE Ursache nicht verdecken.
          try {
            await db.rollbackTransaction()
          } catch {
            /* Rollback-Fehler schlucken; err bleibt die gemeldete Ursache */
          }
          throw err
        }
      })
      // Die Kette nach einem Fehler weiterlaufen lassen (nächste Transaktion nicht blockieren).
      txChain = runTx.catch(() => {})
      return runTx
    },
  }
}

// EINE Verbindung zur DB 'resqdocs-library', geteilt von Library- UND PZN-Backend
// (das Plugin erlaubt pro DB-Name nur eine Verbindung). Memoisiert — und die
// Migrationen laufen GENAU EINMAL pro Session hier, NICHT in den Subsystemen. So
// können Library- und PZN-Init nicht nebenläufig migrieren (sonst würde z. B. das
// nicht-idempotente v4 `ALTER ADD COLUMN` doppelt laufen → „duplicate column").
let sharedClient: Promise<SqlClient> | null = null
export function getSharedCapacitorSqlClient(): Promise<SqlClient> {
  if (!sharedClient) {
    sharedClient = (async () => {
      const client = await createCapacitorSqlClient()
      await runMigrations(client)
      return client
    })()
  }
  return sharedClient
}

/** Liefert das LibraryRepository auf der geteilten (bereits migrierten) Verbindung. */
export async function createSqliteLibraryRepository(): Promise<LibraryRepository> {
  const client = await getSharedCapacitorSqlClient()
  return createLibraryRepositoryOnClient(client)
}
