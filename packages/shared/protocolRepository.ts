// Persistenz-Vertrag der Rework-Protokoll-BIBLIOTHEK: Container-Baeume (rebuild/model.ts).
// BEWUSST getrennt vom dev-LibraryRepository (dev-Protocol-Format) - eigene Tabelle
// `rework_protocols` ueber DIESELBE bewaehrte SQLite-Plumbing (sqlClient/Migrationen). Reine Logik
// gegen den SqlClient (Fake-/node-test-bar); Memory-Variante fuer Web-Dev + Tests.
// NUR Vorlagen-Definitionen (keine Patientendaten, kein caseState).

import type { Container, Node } from './model.ts'
import type { SqlClient } from './adapters.ts'

export interface ProtocolRepository {
  loadAll(): Promise<Container[]>
  save(protocol: Container): Promise<void>
  remove(id: string): Promise<void>
  reset(): Promise<void>
  /** Bibliothek ATOMAR an `protocols` angleichen (entfernte loeschen + upserten) - nativ in EINER
   *  Transaktion (txChain-serialisiert, kein Hineinfallen in eine fremde PZN-Transaktion). */
  replaceAll(protocols: Container[]): Promise<void>
  /** ROH-Zeilenzahl (OHNE Validierungs-/Parse-Filter). Dient dem Datenverlust-Schutz: erkennt, wenn
   *  loadAll() leer liefert, obwohl Zeilen existieren (defektes JSON / fehlgeschlagene Validierung) —
   *  dann darf NICHT geseedet/ueberschrieben werden. */
  count(): Promise<number>
}

/** Leichte Strukturpruefung eines geladenen Baums (kein Schema-Zwang, nur Grundform). */
export function isValidProtocolTree(x: unknown): x is Container {
  if (!x || typeof x !== 'object') return false
  const n = x as Partial<Node>
  return n.type === 'container' && typeof n.id === 'string' && Array.isArray((n as Partial<Container>).children)
}

const nowIso = (): string => new Date().toISOString()

// Tiefe Kopie ueber JSON. Bewusst NICHT structuredClone: das wirft auf Vue-REACTIVE-Proxies einen
// DataCloneError („could not be cloned") - VERSIONSUNABHAENGIG (NICHT „erst ab iOS 15.4"!). seed/
// protocols sind deep-reactive; Container-Baeume sind reines JSON -> der JSON-Klon ist verlustfrei.
// NICHT zu structuredClone zurueckbauen, sonst kehrt der Boot-Crash zurueck.
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Repository ueber einen SqlClient (nativ: geteilte Verbindung; Tests: fakeSqlClient). */
export function createReworkRepositoryOnClient(client: SqlClient, now: () => string = nowIso): ProtocolRepository {
  return {
    async loadAll() {
      let rows
      try {
        rows = await client.query('SELECT protocol_json FROM rework_protocols ORDER BY order_index ASC, updated_at ASC, id ASC')
      } catch {
        // order_index fehlt (v7-Migration nicht gelaufen) -> OHNE die Spalte laden statt zu scheitern.
        // Ohne diesen Fallback wuerde loadAll werfen -> Boot-Load scheitert (Recovery: Daten trotzdem laden).
        rows = await client.query('SELECT protocol_json FROM rework_protocols ORDER BY updated_at ASC, id ASC')
      }
      const out: Container[] = []
      for (const row of rows) {
        if (typeof row.protocol_json !== 'string') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(row.protocol_json)
        } catch {
          continue // defektes JSON ueberspringen
        }
        if (isValidProtocolTree(parsed)) out.push(parsed)
      }
      return out
    },
    async save(protocol) {
      if (!isValidProtocolTree(protocol)) throw new Error('Speichern abgelehnt - ungueltiger Protokoll-Baum.')
      const existing = await client.query('SELECT created_at FROM rework_protocols WHERE id = ?', [protocol.id])
      const createdAt = (existing[0]?.created_at as string | undefined) ?? now()
      await client.run(
        `INSERT OR REPLACE INTO rework_protocols (id, title, protocol_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [protocol.id, protocol.title ?? '', JSON.stringify(protocol), createdAt, now()],
      )
    },
    async remove(id) {
      await client.run('DELETE FROM rework_protocols WHERE id = ?', [id])
    },
    async reset() {
      await client.run('DELETE FROM rework_protocols')
    },
    async count() {
      // Nur die id lesen (nicht protocol_json) -> zaehlt AUCH Zeilen mit defektem JSON. Bewusst kein
      // COUNT(*)-Aggregat: der native Plugin-Client kann es, der Test-Fake nicht -> id-Zeilen in JS zaehlen.
      const rows = await client.query('SELECT id FROM rework_protocols')
      return rows.length
    },
    async replaceAll(protocols) {
      for (const p of protocols) {
        if (!isValidProtocolTree(p)) throw new Error('Speichern abgelehnt - ungueltiger Protokoll-Baum.')
      }
      // SELECT VOR der Transaktion: das native Plugin vertraegt kein query() in einer OFFENEN
      // Transaktion (bewaehrtes PZN-Muster: query nur bei idler Verbindung). rework_protocols hat
      // nur DIESEN einen Schreiber -> read-then-write ist sicher. protocol_json wird mitgelesen, um
      // LESBARKEIT je Zeile zu pruefen (Datenverlust-Schutz unten).
      const existing = await client.query('SELECT id, created_at, protocol_json FROM rework_protocols')
      const createdAt = new Map<string, string>()
      const keep = new Set(protocols.map((p) => p.id))
      const toDelete: string[] = []
      for (const row of existing) {
        const id = String(row.id)
        createdAt.set(id, row.created_at as string)
        if (keep.has(id)) continue
        // DATENVERLUST-SCHUTZ (Vorfall 1.2.1, Teilkorruption): NUR lesbare, dem Nutzer je sichtbare Zeilen
        // duerfen geloescht werden. Eine Zeile, die loadAll NICHT lesen konnte (defektes JSON / ungueltiger
        // Baum), war fuer den Nutzer nie sichtbar -> er kann sie nicht bewusst geloescht haben. Sie fehlt
        // dann zwangslaeufig in `keep` (dem geladenen Arbeitsstand) — wuerde man sie hier loeschen, vernichtet
        // der erste Edit die einzige (evtl. wiederherstellbare) Kopie. Unlesbare Zeilen daher NIE loeschen.
        let readable = false
        if (typeof row.protocol_json === 'string') {
          try {
            readable = isValidProtocolTree(JSON.parse(row.protocol_json))
          } catch {
            readable = false
          }
        }
        if (readable) toDelete.push(id)
      }
      // Schreiben atomar in EINER Transaktion (txChain-serialisiert, faellt NICHT in eine PZN-Tx),
      // NUR run() darin (kein query) -> plattform-sicher.
      await client.transaction(async () => {
        const ts = now()
        for (const id of toDelete) await client.run('DELETE FROM rework_protocols WHERE id = ?', [id])
        // order_index = Array-Position -> die vom Nutzer kontrollierte Reihenfolge wird persistiert.
        for (let i = 0; i < protocols.length; i++) {
          const p = protocols[i]
          await client.run(
            `INSERT OR REPLACE INTO rework_protocols (id, title, protocol_json, created_at, updated_at, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [p.id, p.title ?? '', JSON.stringify(p), createdAt.get(p.id) || ts, ts, i],
          )
        }
      })
    },
  }
}

/** Fehler, wenn die DB Zeilen enthaelt, loadAll sie aber NICHT lesen konnte (defektes JSON/Validierung).
 *  Der Aufrufer (protocolPersistence.init) MUSS dann den destruktiven Auto-Save unterbinden. */
export class ProtocolLibraryUnreadableError extends Error {
  readonly rawCount: number
  constructor(rawCount: number) {
    super(`Bibliothek nicht lesbar: ${rawCount} vorhandene Eintraege konnten nicht geladen werden — Seeden/Ueberschreiben unterbunden, um Datenverlust zu vermeiden.`)
    this.rawCount = rawCount
  }
}

/** Leere Bibliothek -> Seed speichern + zurueckgeben; sonst die geladene Bibliothek (Boot).
 *  DATENVERLUST-SCHUTZ: seedet NUR, wenn die Tabelle WIRKLICH leer ist (Roh-count == 0). Liefert loadAll
 *  [] obwohl Zeilen da sind, wirft es ProtocolLibraryUnreadableError statt zu seeden — sonst wuerde ein
 *  spaeterer replaceAll die echten (unlesbaren) Zeilen loeschen. Geseedet wird ADDITIV via save() (kein
 *  replaceAll -> loescht nie vorhandene Zeilen). */
export async function loadOrSeed(repo: ProtocolRepository, seed: Container[]): Promise<Container[]> {
  const loaded = await repo.loadAll()
  if (loaded.length) return loaded
  const raw = await repo.count()
  if (raw > 0) throw new ProtocolLibraryUnreadableError(raw)
  for (const p of seed) await repo.save(clone(p)) // additiv, loescht nie
  return seed.map((p) => clone(p))
}

/** Persistenz an den aktuellen Stand angleichen (atomar, transaktional). */
export async function syncProtocols(repo: ProtocolRepository, current: Container[]): Promise<void> {
  await repo.replaceAll(current)
}

/** Memory-Variante (Web-Dev + Tests): nicht persistent, keine Native-/Browser-APIs. */
export function createMemoryProtocolRepository(initial: Container[] = []): ProtocolRepository {
  let protocols: Container[] = initial.map((p) => clone(p))
  return {
    async loadAll() {
      return protocols.filter(isValidProtocolTree).map((p) => clone(p))
    },
    async save(protocol) {
      if (!isValidProtocolTree(protocol)) throw new Error('Speichern abgelehnt - ungueltiger Protokoll-Baum.')
      const copy = clone(protocol)
      const i = protocols.findIndex((p) => p.id === protocol.id)
      if (i >= 0) protocols[i] = copy
      else protocols.push(copy)
    },
    async remove(id) {
      protocols = protocols.filter((p) => p.id !== id)
    },
    async reset() {
      protocols = []
    },
    async replaceAll(next) {
      for (const p of next) {
        if (!isValidProtocolTree(p)) throw new Error('Speichern abgelehnt - ungueltiger Protokoll-Baum.')
      }
      protocols = next.map((p) => clone(p))
    },
    async count() {
      return protocols.length
    },
  }
}
