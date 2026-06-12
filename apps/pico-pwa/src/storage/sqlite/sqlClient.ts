// sqlClient.ts — minimale SQL-Client-Abstraktion (DR-0004, #13-F2).
//
// Migrationen und das Library-Repository sprechen NUR gegen dieses Interface.
// So sind sie gegen einen Fake-SQL-Client (node:test) prüfbar, während das echte
// native SQLite (@capacitor-community/sqlite) in capacitorSqlClient.ts liegt.

export interface SqlRow {
  [column: string]: unknown
}

export interface SqlClient {
  /** DDL/Statement ohne Parameter/Rückgabe (z. B. CREATE TABLE). */
  execute(statement: string): Promise<void>
  /** Schreibendes Statement mit Parametern (INSERT/UPDATE/DELETE). */
  run(statement: string, values?: unknown[]): Promise<void>
  /** Lesendes Statement → Zeilen. */
  query(statement: string, values?: unknown[]): Promise<SqlRow[]>
}
