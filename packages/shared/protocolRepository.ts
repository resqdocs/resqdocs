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
// NICHT zu structuredClone zurueckbauen, sonst kehrt der Boot-Crash zurueck. Vgl. buglog bug-040/213.
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Repository ueber einen SqlClient (nativ: geteilte Verbindung; Tests: fakeSqlClient). */
export function createReworkRepositoryOnClient(client: SqlClient, now: () => string = nowIso): ProtocolRepository {
  return {
    async loadAll() {
      const rows = await client.query('SELECT protocol_json FROM rework_protocols ORDER BY order_index ASC, updated_at ASC, id ASC')
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
    async replaceAll(protocols) {
      for (const p of protocols) {
        if (!isValidProtocolTree(p)) throw new Error('Speichern abgelehnt - ungueltiger Protokoll-Baum.')
      }
      // SELECT VOR der Transaktion: das native Plugin vertraegt kein query() in einer OFFENEN
      // Transaktion (bewaehrtes PZN-Muster: query nur bei idler Verbindung). rework_protocols hat
      // nur DIESEN einen Schreiber -> read-then-write ist sicher.
      const existing = await client.query('SELECT id, created_at FROM rework_protocols')
      const createdAt = new Map<string, string>()
      const keep = new Set(protocols.map((p) => p.id))
      const toDelete: string[] = []
      for (const row of existing) {
        const id = String(row.id)
        createdAt.set(id, row.created_at as string)
        if (!keep.has(id)) toDelete.push(id)
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

/** Leere Bibliothek -> Seed speichern + zurueckgeben; sonst die geladene Bibliothek (Boot). */
export async function loadOrSeed(repo: ProtocolRepository, seed: Container[]): Promise<Container[]> {
  const loaded = await repo.loadAll()
  if (loaded.length) return loaded
  await repo.replaceAll(seed) // atomar seeden
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
  }
}
