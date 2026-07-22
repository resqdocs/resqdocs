// Persistenz-Vertrag der Rework-BAUSTEIN-Bibliothek (Rework Slice 2): wiederverwendbare v1-Container-
// Baeume (rebuild/model.ts). GLEICHES Format wie rework_protocols, aber eigene Tabelle `rework_blocks`
// ueber DIESELBE bewaehrte SQLite-Plumbing (sqlClient/Migrationen). Reine Logik gegen den SqlClient
// (Fake-/node-test-bar); Memory-Variante fuer Web-Dev + Tests. Ein Baustein IST strukturell ein
// Container-Baum -> dieselbe Grundpruefung (isValidProtocolTree) wie die Protokoll-Bibliothek.
// NUR neutrale Bausteine (keine Patientendaten, kein caseState).

import type { Container } from './model.ts'
import type { SqlClient } from './adapters.ts'
import { isValidProtocolTree } from './protocolRepository.ts'

export interface BlockRepository {
  loadAll(): Promise<Container[]>
  save(block: Container): Promise<void>
  remove(id: string): Promise<void>
  reset(): Promise<void>
}

const nowIso = (): string => new Date().toISOString()

// Tiefe Kopie ueber JSON. BEWUSST NICHT structuredClone: das wirft auf Vue-REACTIVE-Proxies einen
// DataCloneError (versionsunabhaengig) -> Boot-Crash. Container-Baeume sind reines JSON -> verlustfrei.
// Vgl. protocolRepository.ts.
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Repository ueber einen SqlClient (nativ: geteilte Verbindung; Tests: fakeSqlClient).
 *  Stabile Reihenfolge ueber created_at (kein order_index): Umbenennen sortiert die Liste NICHT um. */
export function createBlockRepositoryOnClient(client: SqlClient, now: () => string = nowIso): BlockRepository {
  return {
    async loadAll() {
      const rows = await client.query('SELECT block_json FROM rework_blocks ORDER BY created_at ASC, id ASC')
      const out: Container[] = []
      for (const row of rows) {
        if (typeof row.block_json !== 'string') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(row.block_json)
        } catch {
          continue // defektes JSON ueberspringen
        }
        if (isValidProtocolTree(parsed)) out.push(parsed)
      }
      return out
    },
    async save(block) {
      if (!isValidProtocolTree(block)) throw new Error('Speichern abgelehnt - ungueltiger Baustein-Baum.')
      const existing = await client.query('SELECT created_at FROM rework_blocks WHERE id = ?', [block.id])
      const createdAt = (existing[0]?.created_at as string | undefined) ?? now()
      await client.run(
        `INSERT OR REPLACE INTO rework_blocks (id, title, block_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [block.id, block.title ?? '', JSON.stringify(block), createdAt, now()],
      )
    },
    async remove(id) {
      await client.run('DELETE FROM rework_blocks WHERE id = ?', [id])
    },
    async reset() {
      await client.run('DELETE FROM rework_blocks')
    },
  }
}

/** Memory-Variante (Web-Dev + Tests): nicht persistent, keine Native-/Browser-APIs.
 *  Reihenfolge = Einfuege-Reihenfolge (neue ans Ende), Update in-place -> wie created_at ASC. */
export function createMemoryBlockRepository(initial: Container[] = []): BlockRepository {
  let blocks: Container[] = initial.map((b) => clone(b))
  return {
    async loadAll() {
      return blocks.filter(isValidProtocolTree).map((b) => clone(b))
    },
    async save(block) {
      if (!isValidProtocolTree(block)) throw new Error('Speichern abgelehnt - ungueltiger Baustein-Baum.')
      const copy = clone(block)
      const i = blocks.findIndex((b) => b.id === block.id)
      if (i >= 0) blocks[i] = copy // Update in-place (Reihenfolge bleibt)
      else blocks.push(copy) // neu ans Ende
    },
    async remove(id) {
      blocks = blocks.filter((b) => b.id !== id)
    },
    async reset() {
      blocks = []
    },
  }
}
