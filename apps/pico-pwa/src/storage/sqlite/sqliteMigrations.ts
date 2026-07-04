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
export const PZN_ENTRIES_TABLE = 'pzn_entries'
export const REWORK_PROTOCOLS_TABLE = 'rework_protocols'
export const REWORK_BLOCKS_TABLE = 'rework_blocks'

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
  {
    // #194/#195: PZN-Bibliothek als DSGVO-entkoppelte Menge eindeutiger PZN.
    // BEWUSST OHNE created_at/updated_at und ohne jede Reihenfolge-/Quelle-Spalte:
    // die Tabelle darf NICHT rekonstruieren, welche PZN zusammen erfasst wurden.
    // pzn ist der natürliche Schlüssel (Set/Dedup); sortiert/paginiert wird NUR nach pzn,
    // nie nach rowid/Einfügereihenfolge.
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS pzn_entries (
         pzn TEXT PRIMARY KEY NOT NULL,
         label TEXT NOT NULL DEFAULT '',
         category TEXT NOT NULL DEFAULT '',
         note TEXT NOT NULL DEFAULT ''
       );`,
    ],
  },
  {
    // #194: PZN-Bibliothek um den Wirkstoff erweitern (wichtiger als die Bezeichnung).
    // Additiv via ALTER (frische DBs aus v3 wie bestehende Dev-DBs erhalten die Spalte);
    // bestehende Zeilen bekommen den Default ''.
    version: 4,
    statements: [
      `ALTER TABLE pzn_entries ADD COLUMN wirkstoff TEXT NOT NULL DEFAULT '';`,
    ],
  },
  {
    // #195: FTS5-Volltextindex für flüssige Suche bei ~317k. External-content über
    // pzn_entries (keine Datenverdopplung), gehalten durch AFTER-Trigger; `rebuild`
    // indiziert vorhandene Zeilen einmalig. DSGVO: pzn_fts.rowid dient NUR dem Join,
    // wird NIE ausgegeben/sortiert — kanonische Ordnung bleibt ORDER BY pzn. Alles
    // IF NOT EXISTS → idempotent/race-sicher.
    version: 5,
    statements: [
      `CREATE VIRTUAL TABLE IF NOT EXISTS pzn_fts USING fts5(wirkstoff, label, category, note, content='pzn_entries', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');`,
      // WICHTIG: Die drei Trigger MÜSSEN EINZEILIG bleiben (kein internes ";\n").
      // Der Android-Plugin-Splitter (getStatementsArray) zerschneidet Statements an
      // ";\n" und würde mehrzeilige BEGIN…END-Trigger zerreißen → execSQL wirft → die
      // ganze Migration bricht auf JEDEM Android-Start ab. Einzeilig ⇒ 1 Element ⇒ ok.
      `CREATE TRIGGER IF NOT EXISTS pzn_fts_ai AFTER INSERT ON pzn_entries BEGIN INSERT INTO pzn_fts(rowid, wirkstoff, label, category, note) VALUES (new.rowid, new.wirkstoff, new.label, new.category, new.note); END;`,
      `CREATE TRIGGER IF NOT EXISTS pzn_fts_ad AFTER DELETE ON pzn_entries BEGIN INSERT INTO pzn_fts(pzn_fts, rowid, wirkstoff, label, category, note) VALUES ('delete', old.rowid, old.wirkstoff, old.label, old.category, old.note); END;`,
      `CREATE TRIGGER IF NOT EXISTS pzn_fts_au AFTER UPDATE ON pzn_entries BEGIN INSERT INTO pzn_fts(pzn_fts, rowid, wirkstoff, label, category, note) VALUES ('delete', old.rowid, old.wirkstoff, old.label, old.category, old.note); INSERT INTO pzn_fts(rowid, wirkstoff, label, category, note) VALUES (new.rowid, new.wirkstoff, new.label, new.category, new.note); END;`,
      `INSERT INTO pzn_fts(pzn_fts) VALUES('rebuild');`,
    ],
  },
  {
    // Rework: eigene Tabelle fuer die Rework-Protokoll-Bibliothek - Container-Baeume
    // (rebuild/model.ts) als JSON. BEWUSST getrennt von library_protocols (dev-Protocol-Format);
    // beide koexistieren in derselben DB, die Formate duerfen sich NICHT vermischen.
    // Einzelnes CREATE TABLE (kein internes ";\n") -> Android-Splitter-sicher.
    version: 6,
    statements: [
      `CREATE TABLE IF NOT EXISTS rework_protocols (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         protocol_json TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );`,
    ],
  },
  {
    // Reihenfolge der Rework-Vorlagen persistieren (Slice 3): eigene Spalte statt Sortierung ueber
    // updated_at -> stabile, vom Nutzer kontrollierbare Reihenfolge. ALTER ist via duplicate-column-
    // Guard (runMigrations) gegen Doppellauf abgesichert; einzelnes Statement -> Android-splitter-sicher.
    version: 7,
    statements: [
      `ALTER TABLE rework_protocols ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;`,
    ],
  },
  {
    // #262: PZN-Bibliothek um die Wirkstärke erweitern (eigenes nutzergepflegtes Sachfeld
    // statt im Namen/Label vermischt). Additiv via ALTER wie v4 (wirkstoff); bestehende
    // Zeilen bekommen den Default ''. BEWUSST OHNE FTS-Anpassung: FTS5 kennt kein
    // ALTER ADD COLUMN, ein Drop+Rebuild lohnt für ein kurzes Zahlenfeld nicht —
    // die Suche matcht die Stärke nicht (Name/Wirkstoff/Kategorie/Bemerkung reichen).
    version: 8,
    statements: [
      `ALTER TABLE pzn_entries ADD COLUMN staerke TEXT NOT NULL DEFAULT '';`,
    ],
  },
  {
    // Rework Slice 2: eigene Tabelle fuer wiederverwendbare Bausteine (Bloecke) - v1-Container-Baeume
    // (rebuild/model.ts) als JSON, GLEICHES Format wie rework_protocols, nur bewusst getrennt gehalten.
    // BEWUSST ohne order_index (stabile Sortierung ueber created_at). Einzelnes CREATE TABLE (kein
    // internes ";\n") -> Android-Splitter-sicher (vgl. v6).
    version: 9,
    statements: [
      `CREATE TABLE IF NOT EXISTS rework_blocks (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         block_json TEXT NOT NULL,
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
      for (const statement of migration.statements) {
        try {
          await client.execute(statement)
        } catch (err) {
          // ALTER ... ADD COLUMN ist nicht idempotent: existiert die Spalte bereits
          // (z. B. durch einen nebenläufigen/vorherigen Lauf), als erledigt behandeln.
          if (/duplicate column/i.test((err as Error).message)) continue
          throw err
        }
      }
      // PRAGMA akzeptiert keine gebundenen Parameter → Version ist eine feste Zahl.
      await client.execute(`PRAGMA user_version = ${migration.version}`)
    } catch (err) {
      throw new Error(`SQLite-Migration v${migration.version} fehlgeschlagen: ${(err as Error).message}`)
    }
    current = migration.version
  }
  return current
}
