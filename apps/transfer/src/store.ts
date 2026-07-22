// Blob-Store ueber node:sqlite. Der Dienst speichert AUSSCHLIESSLICH opake Chiffrate + Ablauf + Burn-
// Flag — kein Klartext, kein Schluessel, KEINE IP-Spalte (Datenminimierung strukturell). node:sqlite ist
// synchron und der Server single-threaded -> Lesen+Loeschen laufen nicht ineinander (Burn ist atomar).
import type { DatabaseSync } from 'node:sqlite'
import { timingSafeEqual } from 'node:crypto'
import { newId, newDeleteToken } from './ids.ts'

/** Erlaubte TTL-Stufen (Sekunden): 1 h / 24 h / 7 d. Burn ist ein UNABHAENGIGES Flag; auch ein
 *  Burn-Blob hat einen Ablauf als Netz gegen nie-abgerufene Eintraege. */
export const TTL_STAGES = [3600, 86400, 604800] as const
export const MAX_TTL = 604800
export const MAX_BLOB_BYTES = 512 * 1024
/** Obergrenze fuer die Anzahl gleichzeitig gespeicherter Blobs — Schutz vor unbegrenztem Disk-Wachstum
 *  ueber das (bis zu 7 Tage lange) TTL-Fenster. Bei Erreichen wird ZUERST Abgelaufenes weggeraeumt, dann
 *  abgelehnt (kein Evicting fremder gueltiger Blobs). Ueber TRANSFER_MAX_BLOBS konfigurierbar; begrenzt die
 *  DB grob auf maxBlobs * 512 KB. */
export const DEFAULT_MAX_BLOBS = 20000
/** Harte Obergrenze fuer die SUMME aller gespeicherten Chiffrate — deckelt das DB-File unabhaengig von der
 *  Blob-ANZAHL. Ohne diese Grenze koennte ein Angreifer mit lauter 512-KB-Blobs (bei 7-Tage-TTL) die Platte
 *  fluten; mit ihr ist der Verbrauch hart auf maxTotalBytes begrenzt. Ueber TRANSFER_MAX_TOTAL_BYTES konfigurierbar. */
export const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024

export class BlobTooLargeError extends Error {}
/** Der Store ist an seiner Kapazitaetsgrenze (auch nach Wegraeumen Abgelaufener) -> 507. */
export class StoreFullError extends Error {}

/** Angeforderte TTL auf die naechstniedrige erlaubte Stufe begrenzen (min. 1 h, max. 7 d). */
export function clampTtl(seconds: number): number {
  if (!Number.isFinite(seconds)) return TTL_STAGES[0]
  let chosen = TTL_STAGES[0]
  for (const s of TTL_STAGES) if (seconds >= s) chosen = s
  return chosen
}

export interface StoredMeta {
  id: string
  code: string
  deleteToken: string
  expiresAt: number // unix (Sekunden)
}

function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  return Uint8Array.from(v as ArrayLike<number>)
}

export function createStore(
  db: DatabaseSync,
  now: () => number = () => Date.now(),
  maxBlobs: number = DEFAULT_MAX_BLOBS,
  maxTotalBytes: number = DEFAULT_MAX_TOTAL_BYTES,
) {
  // DSGVO/Datensparsamkeit: geloeschte Inhalte mit Null ueberschreiben (keine Spuren im DB-File) UND
  // freigegebene Seiten sofort ans OS zurueckgeben (Datei waechst nicht mit dem Durchsatz). auto_vacuum
  // MUSS vor der ersten Tabelle gesetzt werden. Zusaetzlich haelt der Dienst ohnehin nur Chiffrat — eine
  // etwaige physische Restspur waere ohne den (nie gespeicherten) Schluessel wertlos.
  db.exec('PRAGMA auto_vacuum = FULL;')
  db.exec('PRAGMA secure_delete = ON;')
  db.exec(`CREATE TABLE IF NOT EXISTS blobs (
    id           TEXT PRIMARY KEY,
    ciphertext   BLOB NOT NULL,
    expires_at   INTEGER NOT NULL,
    burn         INTEGER NOT NULL,
    delete_token TEXT NOT NULL
  )`)
  const nowSec = (): number => Math.floor(now() / 1000)
  const countBlobs = (): number => (db.prepare('SELECT COUNT(*) AS n FROM blobs').get() as { n: number }).n
  const totalBytes = (): number =>
    (db.prepare('SELECT COALESCE(SUM(LENGTH(ciphertext)), 0) AS n FROM blobs').get() as { n: number }).n
  // Nach JEDEM Loeschen das WAL sofort auschecken, damit das (mit secure_delete genullte) Chiffrat nicht bis
  // zum naechsten 60-s-Sweep als alter WAL-Frame auf der Platte liegen bleibt — „spurlos/sofort" gilt damit
  // wirklich pro Loeschung, nicht nur im Sweep-Takt. PASSIVE ist nicht-blockierend; bei :memory:/ohne WAL ein
  // No-Op. Der Server ist single-threaded/synchron -> kein offener Reader -> PASSIVE checkpointet vollstaendig.
  const checkpoint = (): void => {
    // TRUNCATE (nicht PASSIVE): setzt das -wal-File wirklich auf 0 zurueck, sodass kein alter Frame mit dem
    // (in der Haupt-DB per secure_delete genullten) Chiffrat physisch liegen bleibt. Server ist single-
    // threaded/synchron -> kein offener Reader -> TRUNCATE blockiert nicht. Ohne WAL/bei :memory: ein No-Op.
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);') } catch { /* ohne WAL/bei :memory: bedeutungslos */ }
  }
  const cap = (needed: number): boolean =>
    countBlobs() >= maxBlobs || totalBytes() + needed > maxTotalBytes

  return {
    /** Chiffrat ablegen. Wirft BlobTooLargeError > 512 KB. TTL wird auf eine erlaubte Stufe geclampt. */
    put(ciphertext: Uint8Array, ttlSeconds: number, burn: boolean): StoredMeta {
      if (ciphertext.length > MAX_BLOB_BYTES) throw new BlobTooLargeError()
      // Kapazitaets-Schutz (Anzahl UND Gesamt-Bytes): an der Grenze ZUERST Abgelaufenes wegraeumen; bleibt es
      // voll, ablehnen (507). Kein Evicting fremder gueltiger Blobs — ein wartender legitimer Transfer darf
      // nicht verdraengt werden.
      if (cap(ciphertext.length)) {
        db.prepare('DELETE FROM blobs WHERE expires_at <= ?').run(nowSec())
        checkpoint() // wie ueberall: nach dem Loeschen sofort auschecken, kein WAL-Rest bis zum Sweep
        if (cap(ciphertext.length)) throw new StoreFullError()
      }
      const id = newId()
      const deleteToken = newDeleteToken()
      const expiresAt = nowSec() + clampTtl(ttlSeconds)
      db.prepare('INSERT INTO blobs (id, ciphertext, expires_at, burn, delete_token) VALUES (?, ?, ?, ?, ?)').run(
        id,
        ciphertext,
        expiresAt,
        burn ? 1 : 0,
        deleteToken,
      )
      return { id, code: id, deleteToken, expiresAt }
    },

    /** Chiffrat holen. Abgelaufen -> null + aufraeumen. Burn -> nach dem Ausliefern SOFORT loeschen
     *  (single-threaded/synchron -> ein zweiter GET bekommt null). null = nicht vorhanden/abgelaufen/verbrannt. */
    get(id: string): Uint8Array | null {
      const row = db.prepare('SELECT ciphertext, burn, expires_at FROM blobs WHERE id = ?').get(id) as
        | { ciphertext: unknown; burn: number; expires_at: number }
        | undefined
      if (!row) return null
      if (row.expires_at <= nowSec()) {
        db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
        checkpoint()
        return null
      }
      if (row.burn) {
        db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
        checkpoint()
      }
      return toBytes(row.ciphertext)
    },

    /** Vorzeitig loeschen — nur mit dem passenden Token (kein Enumerieren fremder Blobs). Token-Vergleich
     *  konstantzeitig (Defense-in-Depth gegen Timing), Sofort-Checkpoint nach dem Loeschen. */
    remove(id: string, deleteToken: string): boolean {
      const row = db.prepare('SELECT delete_token FROM blobs WHERE id = ?').get(id) as
        | { delete_token: string }
        | undefined
      if (!row) return false
      const a = Buffer.from(row.delete_token)
      const b = Buffer.from(deleteToken)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return false
      db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
      checkpoint()
      return true
    },

    /** Abgelaufene (auch nie abgerufene) Blobs wegraeumen. Gibt die Anzahl geloeschter Zeilen zurueck. */
    sweep(): number {
      const n = db.prepare('DELETE FROM blobs WHERE expires_at <= ?').run(nowSec()).changes as number
      if (n) checkpoint()
      return n
    },

    /** Nur fuer Tests/Diagnose. */
    count(): number {
      return countBlobs()
    },
  }
}

export type BlobStore = ReturnType<typeof createStore>
