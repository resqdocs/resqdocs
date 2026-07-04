// adapters.ts — Host-Adapter-Vertraege des Kerns (@resqdocs/protocol-core).
//
// Der Kern ist plattform-/framework-neutral und kennt KEINE konkrete Persistenz.
// Repositories nehmen diese Interfaces per Injektion; der Host (Mobile-App, Online-
// Editor, Tests) stellt die konkrete Implementierung (Capacitor Preferences/SQLite,
// localStorage/IndexedDB, Fake). Strukturell identisch zu den App-Storage-Interfaces
// -> bestehende Host-Adapter sind ohne Anpassung kompatibel.

/** Minimaler Key-Value-Adapter (z. B. ueber Capacitor Preferences, localStorage oder Fake). */
export interface KeyValueAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Eine gelesene SQL-Zeile (Spaltenname -> Wert). */
export interface SqlRow {
  [column: string]: unknown
}

/** Minimale SQL-Client-Abstraktion; Repositories sprechen NUR gegen dieses Interface. */
export interface SqlClient {
  /** DDL/Statement ohne Parameter/Rueckgabe (z. B. CREATE TABLE). */
  execute(statement: string): Promise<void>
  /** Schreibendes Statement mit Parametern (INSERT/UPDATE/DELETE). */
  run(statement: string, values?: unknown[]): Promise<void>
  /** Lesendes Statement -> Zeilen. */
  query(statement: string, values?: unknown[]): Promise<SqlRow[]>
  /** Buendelt mehrere Schreibvorgaenge in EINER Transaktion (Atomaritaet). */
  transaction(work: () => Promise<void>): Promise<void>
}
