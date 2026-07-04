// pznLibrarySqliteRepository.ts — SQLite-Backend der PZN-Bibliothek (#194/#195).
//
// Reine Logik gegen den SqlClient (KEIN Capacitor-Import) → gegen echtes
// In-Memory-SQLite (node:sqlite) testbar. Granulare Einzelzeilen-Writes statt
// Voll-Blob; Lesen/Suchen/Paging laufen SQL-seitig (skaliert auf ~317k Einträge).
//
// DSGVO/Entkopplung: Tabelle `pzn_entries` trägt KEINE Zeit-/Reihenfolge-/Quelle-
// Spalte; sortiert/paginiert wird ausschließlich nach `pzn` (nie rowid/Einfüge-
// reihenfolge). Sanitizing (Längen, feste Kategorienliste) läuft über die geteilte
// reine Logik (`pznLibrary.ts`) VOR jedem Write — die Tabelle speichert nie
// ungeprüften Text. Suche hier per LIKE (Increment 1a); FTS5 folgt additiv (v4).
import type { SqlClient, SqlRow } from '../storage/sqlite/sqlClient'
import {
  normalizePzn,
  sanitizeWirkstoff,
  sanitizeStaerke,
  sanitizeLabel,
  sanitizeCategory,
  sanitizeNote,
  type PznEntry,
  type PznEntryData,
  type ImportMode,
} from './pznLibrary.ts'

const TABLE = 'pzn_entries'
const COLS = 'pzn, wirkstoff, staerke, label, category, note'

function toEntry(r: SqlRow): PznEntry {
  return {
    pzn: String(r.pzn ?? ''),
    wirkstoff: String(r.wirkstoff ?? ''),
    staerke: String(r.staerke ?? ''),
    label: String(r.label ?? ''),
    category: String(r.category ?? ''),
    note: String(r.note ?? ''),
  }
}

export interface PznPageOpts {
  offset: number
  limit: number
  dir?: 'asc' | 'desc'
  /** Nur Eintraege OHNE Wirkstaerke (Nachpflege-Arbeitsvorrat, #264). */
  missingStaerke?: boolean
}

export interface PznSqliteRepository {
  count(): Promise<number>
  /** Anzahl Eintraege ohne Wirkstaerke (Fortschritts-Zaehler der Nachpflege, #264). */
  countMissingStaerke(): Promise<number>
  getEntry(pzn: string): Promise<PznEntry | null>
  page(opts: PznPageOpts): Promise<PznEntry[]>
  search(query: string, opts: { offset: number; limit: number; missingStaerke?: boolean }): Promise<PznEntry[]>
  allSorted(): Promise<PznEntry[]>
  setEntry(pzn: string, data: PznEntryData): Promise<void>
  setWirkstoff(pzn: string, wirkstoff: string): Promise<void>
  setStaerke(pzn: string, staerke: string): Promise<void>
  setLabel(pzn: string, label: string): Promise<void>
  setCategory(pzn: string, category: string): Promise<void>
  setNote(pzn: string, note: string): Promise<void>
  remove(pzn: string): Promise<void>
  clear(): Promise<void>
  /**
   * Bulk-Übernahme (Import/Backfill) in gechunkten Transaktionen. `mode` mappt direkt
   * auf SQL: 'overwrite' → INSERT OR REPLACE (Import gewinnt), 'skip' → INSERT OR IGNORE
   * (Duplikate überspringen). Nicht-importierte Einträge bleiben (kein DELETE).
   */
  bulkPut(
    entries: PznEntry[],
    mode: ImportMode,
    chunkSize?: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void>
}

/**
 * Gibt dem Renderer einen Frame, damit die Import-Progressbar tatsächlich neu zeichnet
 * (#218). Im WebView via requestAnimationFrame; sonst (node:test) Fallback setTimeout(0) —
 * beide nur ein kurzer Macrotask-Yield. Wird in bulkPut NUR ZWISCHEN committeten Chunk-
 * Transaktionen aufgerufen (nach dem awaiteten client.transaction → Verbindung idle),
 * nie innerhalb einer offenen Transaktion.
 */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

export function createPznLibrarySqliteRepository(client: SqlClient): PznSqliteRepository {
  async function pageQuery(offset: number, limit: number, dir: 'asc' | 'desc' = 'asc', missingStaerke = false): Promise<PznEntry[]> {
    const ord = dir === 'desc' ? 'DESC' : 'ASC'
    const where = missingStaerke ? `WHERE staerke = ''` : ''
    const rows = await client.query(
      `SELECT ${COLS} FROM ${TABLE} ${where} ORDER BY pzn ${ord} LIMIT ? OFFSET ?`,
      [limit, offset],
    )
    return rows.map(toEntry)
  }

  async function setField(pzn: string, col: 'wirkstoff' | 'staerke' | 'label' | 'category' | 'note', value: string): Promise<void> {
    const norm = normalizePzn(pzn)
    if (!norm) return
    // Nur vorhandene Zeile ändern (UPDATE ist No-Op, falls die PZN fehlt) — wie setLabel/… in pznLibrary.ts.
    await client.run(`UPDATE ${TABLE} SET ${col} = ? WHERE pzn = ?`, [value, norm])
  }

  return {
    async count() {
      const rows = await client.query(`SELECT COUNT(*) AS n FROM ${TABLE}`)
      const n = Number(rows[0]?.n ?? 0)
      return Number.isFinite(n) ? n : 0
    },

    async countMissingStaerke() {
      const rows = await client.query(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE staerke = ''`)
      const n = Number(rows[0]?.n ?? 0)
      return Number.isFinite(n) ? n : 0
    },

    async getEntry(pzn) {
      const norm = normalizePzn(pzn)
      if (!norm) return null
      const rows = await client.query(`SELECT ${COLS} FROM ${TABLE} WHERE pzn = ?`, [norm])
      return rows[0] ? toEntry(rows[0]) : null
    },

    page({ offset, limit, dir, missingStaerke }) {
      return pageQuery(offset, limit, dir, missingStaerke)
    },

    async search(query, { offset, limit, missingStaerke }) {
      const q = query.trim()
      if (!q) return pageQuery(offset, limit, 'asc', missingStaerke)
      const pznNeedle = `%${q}%`
      // Nachpflege-Filter als zusaetzliche Bedingung in BEIDEN Zweigen (LIKE + FTS-Join).
      const missing = missingStaerke ? `AND staerke = ''` : ''
      const missingB = missingStaerke ? `AND b.staerke = ''` : ''
      // FTS5 über die Textfelder (Wirkstoff/Bezeichnung/Kategorie/Bemerkung): nur
      // alphanumerische Tokens, jeweils als PRÄFIX (Token*) — verhindert FTS-Syntaxfehler
      // bei Sonderzeichen. Die PZN (Ziffern) matcht ein FTS-Präfix nicht mittig, daher
      // separat per LIKE auf pzn, mit dem FTS-Treffer VEREINIGT. Reihenfolge IMMER nach pzn
      // (FTS-rowid dient nur dem Join, wird nie ausgegeben/sortiert).
      const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
      if (tokens.length === 0) {
        const rows = await client.query(
          `SELECT ${COLS} FROM ${TABLE} WHERE pzn LIKE ? ${missing} ORDER BY pzn ASC LIMIT ? OFFSET ?`,
          [pznNeedle, limit, offset],
        )
        return rows.map(toEntry)
      }
      const match = tokens.map((t) => `${t}*`).join(' ')
      const rows = await client.query(
        `SELECT ${COLS} FROM ${TABLE} WHERE pzn LIKE ? ${missing}
         UNION
         SELECT b.pzn, b.wirkstoff, b.staerke, b.label, b.category, b.note
           FROM pzn_fts f JOIN ${TABLE} b ON b.rowid = f.rowid
           WHERE pzn_fts MATCH ? ${missingB}
         ORDER BY pzn ASC LIMIT ? OFFSET ?`,
        [pznNeedle, match, limit, offset],
      )
      return rows.map(toEntry)
    },

    async allSorted() {
      const rows = await client.query(`SELECT ${COLS} FROM ${TABLE} ORDER BY pzn ASC`)
      return rows.map(toEntry)
    },

    async setEntry(pzn, data) {
      const norm = normalizePzn(pzn)
      if (!norm) return
      // Upsert via ON CONFLICT DO UPDATE (NICHT INSERT OR REPLACE): so feuert bei
      // bestehender PZN der UPDATE-Trigger (FTS bleibt konsistent) und die rowid bleibt
      // stabil. REPLACE würde den DELETE-Trigger ohne recursive_triggers überspringen
      // → stale FTS-Einträge.
      await client.run(
        `INSERT INTO ${TABLE} (${COLS}) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(pzn) DO UPDATE SET
           wirkstoff = excluded.wirkstoff, staerke = excluded.staerke, label = excluded.label,
           category = excluded.category, note = excluded.note`,
        [norm, sanitizeWirkstoff(data.wirkstoff), sanitizeStaerke(data.staerke), sanitizeLabel(data.label), sanitizeCategory(data.category), sanitizeNote(data.note)],
      )
    },

    setWirkstoff(pzn, wirkstoff) {
      return setField(pzn, 'wirkstoff', sanitizeWirkstoff(wirkstoff))
    },
    setStaerke(pzn, staerke) {
      return setField(pzn, 'staerke', sanitizeStaerke(staerke))
    },
    setLabel(pzn, label) {
      return setField(pzn, 'label', sanitizeLabel(label))
    },
    setCategory(pzn, category) {
      return setField(pzn, 'category', sanitizeCategory(category))
    },
    setNote(pzn, note) {
      return setField(pzn, 'note', sanitizeNote(note))
    },

    async remove(pzn) {
      const norm = normalizePzn(pzn)
      if (!norm) return
      await client.run(`DELETE FROM ${TABLE} WHERE pzn = ?`, [norm])
    },

    async clear() {
      await client.run(`DELETE FROM ${TABLE}`)
    },

    async bulkPut(entries, mode, chunkSize = 1000, onProgress) {
      // In Blöcken à chunkSize, jeder Block in EINER Transaktion (über client.transaction
      // — kein manuelles BEGIN, das mit der Plugin-Auto-Transaktion kollidieren würde):
      // bei 317k entscheidend, sonst committet SQLite jede Zeile einzeln (fsync pro Zeile).
      // chunkSize 1000 (statt 5000): feinere Fortschritts-Schritte (#218) ohne Transaktions-
      // strukturänderung — je Block weiterhin eine eigene, vollständig committete Transaktion.
      // mode: overwrite = Upsert (ON CONFLICT DO UPDATE, FTS-Trigger-konsistent, Import
      // gewinnt) / skip = INSERT OR IGNORE (Duplikate überspringen). KEIN INSERT OR REPLACE
      // (würde ohne recursive_triggers den DELETE-Trigger überspringen → stale FTS).
      const sql = mode === 'skip'
        ? `INSERT OR IGNORE INTO ${TABLE} (${COLS}) VALUES (?, ?, ?, ?, ?, ?)`
        : `INSERT INTO ${TABLE} (${COLS}) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(pzn) DO UPDATE SET
             wirkstoff = excluded.wirkstoff, staerke = excluded.staerke, label = excluded.label,
             category = excluded.category, note = excluded.note`
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize)
        await client.transaction(async () => {
          for (const e of chunk) {
            const norm = normalizePzn(e.pzn)
            if (!norm) continue
            await client.run(sql, [
              norm,
              sanitizeWirkstoff(e.wirkstoff),
              sanitizeStaerke(e.staerke),
              sanitizeLabel(e.label),
              sanitizeCategory(e.category),
              sanitizeNote(e.note),
            ])
          }
        })
        onProgress?.(Math.min(i + chunkSize, entries.length), entries.length)
        // Paint-Yield ZWISCHEN den Chunks (#218): nach dem COMMIT, Verbindung idle — lässt die
        // Progressbar zeichnen, statt erst am Import-Ende. Insert-/Transaktion/FTS unverändert.
        await yieldToPaint()
      }
    },
  }
}
