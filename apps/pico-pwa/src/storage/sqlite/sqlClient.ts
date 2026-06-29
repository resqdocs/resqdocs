// sqlClient.ts — minimale SQL-Client-Abstraktion (DR-0004, #13-F2).
//
// Migrationen und das Library-Repository sprechen NUR gegen dieses Interface.
// So sind sie gegen einen Fake-SQL-Client (node:test) prüfbar, während das echte
// native SQLite (@capacitor-community/sqlite) in capacitorSqlClient.ts liegt.

// Der Vertrag lebt jetzt im Kern (@resqdocs/protocol-core/adapters) - EINE Quelle der Wahrheit.
// Hier nur re-exportiert, damit die bestehenden App-Importe (capacitorSqlClient, Migrationen,
// Repositories) unveraendert bleiben.
export type { SqlClient, SqlRow } from '@resqdocs/protocol-core/adapters'
