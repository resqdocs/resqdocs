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
  return {
    async execute(statement) {
      await db.execute(statement)
    },
    async run(statement, values = []) {
      await db.run(statement, values)
    },
    async query(statement, values = []) {
      const res = await db.query(statement, values)
      return (res.values ?? []) as SqlRow[]
    },
  }
}

/** Verbindet SQLite, führt Migrationen aus und liefert das LibraryRepository. */
export async function createSqliteLibraryRepository(): Promise<LibraryRepository> {
  const client = await createCapacitorSqlClient()
  await runMigrations(client)
  return createLibraryRepositoryOnClient(client)
}
