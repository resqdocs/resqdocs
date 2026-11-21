// Blob-Store ueber node:sqlite. Der Dienst speichert AUSSCHLIESSLICH opake Chiffrate + Ablauf + Burn-
// Flag — kein Klartext, kein Schluessel, KEINE IP-Spalte (Datenminimierung strukturell). node:sqlite ist
// synchron und der Server single-threaded -> Lesen+Loeschen laufen nicht ineinander (Burn ist atomar).
import type { DatabaseSync } from 'node:sqlite'
import { timingSafeEqual } from 'node:crypto'
import { newId, newDeleteToken, newShortCode } from './ids.ts'

/** Ergebnis eines Abrufs. busy = ein anderes Gerät hat den „1× lesen“-Link gerade reserviert. */
export type FetchResult =
  | { kind: 'ok'; blob: Uint8Array; claimToken?: string; priorOpens: number }
  | { kind: 'missing' }
  | { kind: 'busy' }

function sameToken(stored: string | null, given: string): boolean {
  if (!stored) return false
  const a = Buffer.from(stored)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

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

/** „1× lesen“ mit Reservierung: so lange gehört ein abgerufener Link dem öffnenden Gerät. Übernimmt es den Inhalt,
 *  wird der Link verbraucht; bricht es ab (oder meldet sich nicht mehr), gilt er danach wieder. */
export const CLAIM_SECONDS = 600

/** Kurzlinks: Nach dem Ende des Inhalts bleibt ein Code noch so lange gesperrt, bevor er neu vergeben wird. So
 *  öffnet ein alter Kurzlink aus einem Chat nie den Inhalt eines anderen. */
export const SHORT_LOCK_SECONDS = 30 * 86400

/** Ergebnis beim Auflösen eines Kurzlinks. expired = Code bekannt, Inhalt aber abgelaufen oder übernommen. */
export type ShortResult = { kind: 'ok'; target: string } | { kind: 'expired' } | { kind: 'missing' }

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
  // Reservierung für „1× lesen“ (nachgerüstet; bestehende Datenbanken bekommen die Spalten beim Start).
  const cols = new Set((db.prepare('PRAGMA table_info(blobs)').all() as { name: string }[]).map((c) => c.name))
  if (!cols.has('claim_token')) db.exec('ALTER TABLE blobs ADD COLUMN claim_token TEXT')
  if (!cols.has('claim_until')) db.exec('ALTER TABLE blobs ADD COLUMN claim_until INTEGER')
  if (!cols.has('opens')) db.exec('ALTER TABLE blobs ADD COLUMN opens INTEGER NOT NULL DEFAULT 0')
  // Kurzlinks (resq.li/<code>): Ziel ist der lange Link MIT Schlüssel. Er wird gelöscht, sobald der Inhalt weg ist
  // (abgelaufen, übernommen, gelöscht); danach bleibt nur der gesperrte Code bis lock_until.
  db.exec(`CREATE TABLE IF NOT EXISTS shorts (
    code       TEXT PRIMARY KEY,
    blob_id    TEXT NOT NULL,
    target     TEXT,
    lock_until INTEGER NOT NULL
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS shorts_blob ON shorts (blob_id)')
  /** Kurzlink-Ziel eines gelöschten Inhalts sofort entfernen (Schlüssel nicht länger als nötig speichern). */
  const dropTarget = (blobId: string): void => {
    db.prepare('UPDATE shorts SET target = NULL WHERE blob_id = ? AND target IS NOT NULL').run(blobId)
  }
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

  const api = {
    /** Chiffrat ablegen. Wirft BlobTooLargeError > 512 KB. TTL wird auf eine erlaubte Stufe geclampt. */
    put(ciphertext: Uint8Array, ttlSeconds: number, burn: boolean): StoredMeta {
      if (ciphertext.length > MAX_BLOB_BYTES) throw new BlobTooLargeError()
      // Kapazitaets-Schutz (Anzahl UND Gesamt-Bytes): an der Grenze ZUERST Abgelaufenes wegraeumen; bleibt es
      // voll, ablehnen (507). Kein Evicting fremder gueltiger Blobs — ein wartender legitimer Transfer darf
      // nicht verdraengt werden.
      if (cap(ciphertext.length)) {
        db.prepare('DELETE FROM blobs WHERE expires_at <= ?').run(nowSec())
        db.prepare('UPDATE shorts SET target = NULL WHERE target IS NOT NULL AND blob_id NOT IN (SELECT id FROM blobs)').run()
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

    /** Chiffrat holen. Abgelaufen -> missing + aufraeumen.
     *  „1× lesen“ ohne claim (Empfangsseite, ältere Apps, Editor): nach dem Ausliefern SOFORT löschen, wie bisher.
     *  „1× lesen“ mit claim: nicht löschen, sondern für CLAIM_SECONDS reservieren und ein Token ausgeben; erst
     *  consume() verbraucht den Link, release() gibt ihn frei. Während einer Reservierung bekommt jeder andere
     *  Abruf busy. priorOpens zählt frühere Abrufe, die nicht übernommen wurden (der Empfänger sieht so, dass
     *  jemand anderes den Link schon geöffnet hatte). Single-threaded/synchron -> atomar. */
    fetch(id: string, opts: { claim?: boolean } = {}): FetchResult {
      const row = db.prepare('SELECT ciphertext, burn, expires_at, claim_until, opens FROM blobs WHERE id = ?').get(id) as
        | { ciphertext: unknown; burn: number; expires_at: number; claim_until: number | null; opens: number }
        | undefined
      if (!row) return { kind: 'missing' }
      const t = nowSec()
      if (row.expires_at <= t) {
        db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
        dropTarget(id)
        checkpoint()
        return { kind: 'missing' }
      }
      if (!row.burn) return { kind: 'ok', blob: toBytes(row.ciphertext), priorOpens: 0 }
      if (row.claim_until !== null && row.claim_until > t) return { kind: 'busy' }
      if (!opts.claim) {
        db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
        dropTarget(id)
        checkpoint()
        return { kind: 'ok', blob: toBytes(row.ciphertext), priorOpens: row.opens }
      }
      const claimToken = newDeleteToken()
      db.prepare('UPDATE blobs SET claim_token = ?, claim_until = ?, opens = opens + 1 WHERE id = ?').run(
        claimToken,
        Math.min(t + CLAIM_SECONDS, row.expires_at),
        id,
      )
      return { kind: 'ok', blob: toBytes(row.ciphertext), claimToken, priorOpens: row.opens }
    },

    /** Wie fetch ohne claim; null = nicht vorhanden/abgelaufen/verbrannt/reserviert. */
    get(id: string): Uint8Array | null {
      const r = api.fetch(id)
      return r.kind === 'ok' ? r.blob : null
    },

    /** Reservierten „1× lesen“-Link verbrauchen (Inhalt übernommen). Nur mit dem passenden Token. */
    consume(id: string, claimToken: string): boolean {
      const row = db.prepare('SELECT claim_token FROM blobs WHERE id = ?').get(id) as { claim_token: string | null } | undefined
      if (!row || !sameToken(row.claim_token, claimToken)) return false
      db.prepare('DELETE FROM blobs WHERE id = ?').run(id)
      dropTarget(id)
      checkpoint()
      return true
    },

    /** Reservierung aufheben (abgebrochen): der Link gilt wieder. Nur mit dem passenden Token. */
    release(id: string, claimToken: string): boolean {
      const row = db.prepare('SELECT claim_token FROM blobs WHERE id = ?').get(id) as { claim_token: string | null } | undefined
      if (!row || !sameToken(row.claim_token, claimToken)) return false
      db.prepare('UPDATE blobs SET claim_token = NULL, claim_until = NULL WHERE id = ?').run(id)
      return true
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
      dropTarget(id)
      checkpoint()
      return true
    },

    /** Abgelaufene (auch nie abgerufene) Blobs wegraeumen. Gibt die Anzahl geloeschter Zeilen zurueck. */
    sweep(): number {
      const t = nowSec()
      const n = db.prepare('DELETE FROM blobs WHERE expires_at <= ?').run(t).changes as number
      // Kurzlinks: Ziele ohne Inhalt leeren, abgelaufene Sperren freigeben.
      const m =
        (db.prepare('UPDATE shorts SET target = NULL WHERE target IS NOT NULL AND blob_id NOT IN (SELECT id FROM blobs)').run().changes as number) +
        (db.prepare('DELETE FROM shorts WHERE lock_until <= ?').run(t).changes as number)
      if (n || m) checkpoint()
      return n
    },

    /** Kurzlink zu einem langen Link anlegen. blobId muss ein vorhandener, nicht abgelaufener Inhalt sein; gibt es
     *  für ihn schon einen Kurzlink, kommt derselbe zurück (ein Kurzlink je Inhalt). null = Inhalt nicht (mehr) da. */
    shorten(blobId: string, target: string): { code: string; expiresAt: number } | null {
      const blob = db.prepare('SELECT expires_at FROM blobs WHERE id = ?').get(blobId) as { expires_at: number } | undefined
      const t = nowSec()
      if (!blob || blob.expires_at <= t) return null
      // Ein Kurzlink je Inhalt: ein zweiter Aufruf bekommt denselben Code (bei anderem Ziel wird es ersetzt; nur wer
      // die Blob-ID kennt, kann das). So wächst die Tabelle höchstens mit der Zahl der Inhalte.
      const existing = db.prepare('SELECT code, target FROM shorts WHERE blob_id = ?').get(blobId) as { code: string; target: string | null } | undefined
      if (existing) {
        if (existing.target !== target) db.prepare('UPDATE shorts SET target = ? WHERE code = ?').run(target, existing.code)
        return { code: existing.code, expiresAt: blob.expires_at }
      }
      // Gesperrte Codes zählen mit: höchstens 4 Kurzlinks je möglichem Inhalt.
      const count = (): number => (db.prepare('SELECT COUNT(*) AS n FROM shorts').get() as { n: number }).n
      if (count() >= maxBlobs * 4) {
        // Voll: die ältesten nur noch gesperrten Codes (ohne Ziel) vorzeitig freigeben, damit niemand das Anlegen
        // für alle auf Wochen blockieren kann. Laufende Kurzlinks bleiben; ihre Zahl ist durch die Inhalte begrenzt.
        db.prepare('DELETE FROM shorts WHERE code IN (SELECT code FROM shorts WHERE target IS NULL ORDER BY lock_until LIMIT ?)').run(Math.max(1, Math.floor(maxBlobs / 4)))
        if (count() >= maxBlobs * 4) throw new StoreFullError()
      }
      // Freie Codes: gesperrte und laufende sind belegt. Bei ~460 Mio. Codes ist ein Treffer selten.
      for (let i = 0; i < 20; i++) {
        const code = newShortCode()
        const taken = db.prepare('SELECT 1 FROM shorts WHERE code = ?').get(code)
        if (taken) continue
        db.prepare('INSERT INTO shorts (code, blob_id, target, lock_until) VALUES (?, ?, ?, ?)').run(code, blobId, target, blob.expires_at + SHORT_LOCK_SECONDS)
        return { code, expiresAt: blob.expires_at }
      }
      throw new StoreFullError()
    },

    /** Kurzlink eines Inhalts zurücknehmen (Haken beim Teilen wieder entfernt): das Ziel mit dem Schlüssel wird
     *  sofort gelöscht, der Code bleibt gesperrt. Nur mit dem Lösch-Token des Inhalts. */
    unshorten(blobId: string, deleteToken: string): boolean {
      const row = db.prepare('SELECT delete_token FROM blobs WHERE id = ?').get(blobId) as { delete_token: string } | undefined
      if (!row || !sameToken(row.delete_token, deleteToken)) return false
      dropTarget(blobId)
      checkpoint()
      return true
    },

    /** Kurzlink auflösen. Ist der Inhalt weg, wird das Ziel gelöscht und expired gemeldet. */
    resolve(code: string): ShortResult {
      const row = db.prepare('SELECT blob_id, target FROM shorts WHERE code = ?').get(code) as { blob_id: string; target: string | null } | undefined
      if (!row) return { kind: 'missing' }
      if (row.target === null) return { kind: 'expired' }
      const blob = db.prepare('SELECT expires_at FROM blobs WHERE id = ?').get(row.blob_id) as { expires_at: number } | undefined
      if (!blob || blob.expires_at <= nowSec()) {
        dropTarget(row.blob_id)
        checkpoint()
        return { kind: 'expired' }
      }
      return { kind: 'ok', target: row.target }
    },

    /** Nur fuer Tests/Diagnose. */
    count(): number {
      return countBlobs()
    },
  }
  return api
}

export type BlobStore = ReturnType<typeof createStore>
