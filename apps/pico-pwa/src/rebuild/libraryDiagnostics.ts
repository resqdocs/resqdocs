// libraryDiagnostics.ts — READ-ONLY Zustandsdiagnose der Vorlagen-Bibliothek (rework_protocols).
//
// Zweck (1.2.1-Vorfall): dem Nutzer/Support sichtbar machen, OB Vorlagen auf der Platte liegen und ob
// sie lesbar sind — OHNE etwas zu verändern. Entscheidend ist die Unterscheidung:
//   rawRows > 0 & readableRows == 0  -> Daten SIND da, aber unlesbar (defektes JSON / Migrationsstand) =
//                                       potenziell wiederherstellbar; der Datenverlust-Schutz greift und
//                                       verhindert, dass ein Seed/replaceAll sie löscht.
//   rawRows == 0                     -> Tabelle wirklich leer (Daten weg oder Neuinstallation).
//
// Read-only-Garantie: DIESE Funktion setzt NUR SELECT/PRAGMA-Reads ab — kein CREATE/INSERT/UPDATE/DELETE,
// kein runMigrations(). getSharedCapacitorSqlClient() öffnet die DB + migriert NUR beim allerersten Aufruf
// (memoisierte Promise). Der App-Boot ruft es IMMER vor jeder UI (main.ts -> configureNativeRepositories +
// protocolPersistence.init), d. h. die Verbindung ist hier stets bereits geöffnet/migriert bzw. die Promise
// bereits (evtl. mit Fehler) aufgelöst — die Diagnose ist nie der Erst-Öffner und löst daher NIE eine
// Migration aus. Schlug die Boot-Migration fehl, liefert der memoisierte Aufruf denselben Fehler (kein neuer
// Schreibversuch) -> hier gefangen -> error-Feld. Bewusst NICHT über das aktive Repository gelesen: schlug der
// Boot-Load fehl, ist activeRepo ein Memory-Repo und meldete fälschlich 0 — wir brauchen die ECHTEN On-Disk-Zahlen.
import { Capacitor } from '@capacitor/core'

export interface LibraryDiagnostics {
  platform: string
  native: boolean
  /** geteilte SQLite-Verbindung erreichbar (false = Memory-Fallback / Plugin-Fehler) */
  sqliteAvailable: boolean
  /** PRAGMA user_version — Migrationsstand (LATEST siehe sqliteMigrations); null = nicht ermittelbar */
  migrationVersion: number | null
  /** existiert die Tabelle rework_protocols überhaupt */
  tableExists: boolean
  /** ROH-Zeilenzahl rework_protocols (jede Zeile, auch unlesbare) */
  rawRows: number | null
  /** davon lesbar (JSON parst zu gültigem Container-Baum) */
  readableRows: number | null
  /** Zeilen rework_blocks (Bausteine); null = Tabelle fehlt/nicht zählbar */
  blockRows: number | null
  /** Zeilen pzn_entries (persönliche PZN-Bibliothek); null = Tabelle fehlt/nicht zählbar */
  pznRows: number | null
  /** Zeilen library_snippets (Mustertexte); null = Tabelle fehlt/nicht zählbar */
  snippetRows: number | null
  /** gesetzt, wenn die Diagnose selbst scheiterte (z. B. SQLite nicht verfügbar) */
  error?: string
}

/** Grundform-Check identisch zu isValidProtocolTree (bewusst dupliziert, um KEINE Schreibpfade zu importieren). */
function looksLikeContainer(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const n = x as Record<string, unknown>
  return n.type === 'container' && typeof n.id === 'string' && Array.isArray(n.children)
}

export async function collectLibraryDiagnostics(): Promise<LibraryDiagnostics> {
  const platform = Capacitor.getPlatform()
  const native = Capacitor.isNativePlatform()
  const base: LibraryDiagnostics = {
    platform,
    native,
    sqliteAvailable: false,
    migrationVersion: null,
    tableExists: false,
    rawRows: null,
    readableRows: null,
    blockRows: null,
    pznRows: null,
    snippetRows: null,
  }
  if (!native) return { ...base, error: 'Web/Dev — keine native SQLite-Bibliothek (In-Memory)' }

  try {
    const { getSharedCapacitorSqlClient } = await import('@/storage/sqlite/capacitorSqlClient')
    const client = await getSharedCapacitorSqlClient()

    const uv = await client.query('PRAGMA user_version')
    const rawVersion = uv[0]?.user_version
    const migrationVersion = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion)

    const tbl = await client.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='rework_protocols'",
    )
    const tableExists = tbl.length > 0

    let rawRows: number | null = null
    let readableRows: number | null = null
    if (tableExists) {
      const rows = await client.query('SELECT protocol_json FROM rework_protocols')
      rawRows = rows.length
      let ok = 0
      for (const row of rows) {
        if (typeof row.protocol_json !== 'string') continue
        try {
          if (looksLikeContainer(JSON.parse(row.protocol_json))) ok++
        } catch {
          /* defektes JSON -> nicht lesbar */
        }
      }
      readableRows = ok
    }

    // Zeilenzahlen der ANDEREN Subsysteme derselben geteilten DB (Vorfall betraf auch PZN + evtl. mehr).
    // COUNT(*) ist hier sicher: laeuft NUR nativ (echtes Plugin, kein Test-Fake). Fehlt eine Tabelle
    // (alter Schemastand), liefert countOf null statt zu scheitern.
    const countOf = async (table: string): Promise<number | null> => {
      try {
        const rows = await client.query(`SELECT COUNT(*) AS n FROM ${table}`)
        const n = rows[0]?.n
        const num = typeof n === 'number' ? n : Number(n)
        return Number.isFinite(num) ? num : null
      } catch {
        return null
      }
    }
    const [blockRows, pznRows, snippetRows] = await Promise.all([
      countOf('rework_blocks'),
      countOf('pzn_entries'),
      countOf('library_snippets'),
    ])

    return {
      platform,
      native,
      sqliteAvailable: true,
      migrationVersion: Number.isFinite(migrationVersion) ? migrationVersion : null,
      tableExists,
      rawRows,
      readableRows,
      blockRows,
      pznRows,
      snippetRows,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
