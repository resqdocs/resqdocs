// sqliteMigrations.ts — versionierte, idempotente Migrationsschicht (#13-F2.1).
//
// Nutzt SQLite `PRAGMA user_version` als Schema-Versionsmarker (kein
// Migrationsframework, keine Dependency). `runMigrations` wendet nur Migrationen
// mit Version > aktueller user_version an und setzt user_version hoch — dadurch
// idempotent. Aktuell nur library.protocols. Keine Patientendaten, kein caseState.
//
// Quelle: https://sqlite.org/pragma.html#pragma_user_version
import type { SqlClient } from './sqlClient'

export const LIBRARY_PROTOCOLS_TABLE = 'library_protocols'
export const LIBRARY_BLOCKS_TABLE = 'library_blocks'
export const LIBRARY_SNIPPETS_TABLE = 'library_snippets'

export interface Migration {
  version: number
  statements: string[]
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS library_protocols (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         schema_version TEXT NOT NULL,
         protocol_json TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );`,
    ],
  },
  {
    // #13-F3: neutrale Bausteine + Snippets.
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS library_blocks (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         block_json TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );`,
      `CREATE TABLE IF NOT EXISTS library_snippets (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         text TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );`,
    ],
  },
]

/** Höchste definierte Schema-Version. */
export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)

export async function getUserVersion(client: SqlClient): Promise<number> {
  const rows = await client.query('PRAGMA user_version')
  const v = rows[0]?.user_version ?? rows[0]?.['user_version']
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Initialisiert/aktualisiert das Schema auf LATEST_VERSION. Idempotent (über
 * user_version). Meldet Fehler klar. Gibt die erreichte Version zurück.
 */
export async function runMigrations(client: SqlClient): Promise<number> {
  let current = await getUserVersion(client)
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    try {
      for (const statement of migration.statements) await client.execute(statement)
      // PRAGMA akzeptiert keine gebundenen Parameter → Version ist eine feste Zahl.
      await client.execute(`PRAGMA user_version = ${migration.version}`)
    } catch (err) {
      throw new Error(`SQLite-Migration v${migration.version} fehlgeschlagen: ${(err as Error).message}`)
    }
    current = migration.version
  }
  return current
}
