// sqliteLibraryRepository.ts — LibraryRepository über einen SqlClient (#13-F2).
//
// Reine Logik (kein Capacitor-Import) → gegen einen Fake-SQL-Client testbar.
// Speichert NUR neutrale Protokollvorlagen: validiert VOR dem Speichern und NACH
// dem Laden; ungültige/defekte Datensätze werden nicht still übernommen. Keine
// Patientendaten, kein caseState. Mutiert die Protokollobjekte nicht.
import type { SqlClient } from './sqlClient'
import type { LibraryRepository, LibraryBlock, LibrarySnippet } from '../types'
import type { Protocol, Block } from '@shared/creator/creator.mjs'
import { assertValidProtocolDraft } from '../../../../../packages/shared/creator/creator.mjs'
import { isValidLibraryBlock, isValidLibrarySnippet } from '../libraryValidation.ts'

const nowIso = (): string => new Date().toISOString()

export function createLibraryRepositoryOnClient(
  client: SqlClient,
  now: () => string = nowIso,
): LibraryRepository {
  return {
    async loadProtocols() {
      const rows = await client.query(
        'SELECT protocol_json FROM library_protocols ORDER BY updated_at ASC, id ASC',
      )
      const out: Protocol[] = []
      for (const row of rows) {
        const raw = row.protocol_json
        if (typeof raw !== 'string') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          continue // defektes JSON überspringen
        }
        if (assertValidProtocolDraft(parsed as Protocol).valid) out.push(parsed as Protocol)
      }
      return out
    },

    async saveProtocol(protocol) {
      const res = assertValidProtocolDraft(protocol)
      if (!res.valid) {
        throw new Error(`Speichern abgelehnt — ungültiges Protokoll: ${res.errors.join('; ')}`)
      }
      // created_at erhalten, falls der Datensatz bereits existiert.
      const existing = await client.query('SELECT created_at FROM library_protocols WHERE id = ?', [protocol.id])
      const createdAt = (existing[0]?.created_at as string | undefined) ?? now()
      const updatedAt = now()
      await client.run(
        `INSERT OR REPLACE INTO library_protocols
           (id, title, schema_version, protocol_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          protocol.id,
          protocol.title ?? '',
          protocol.schemaVersion ?? '',
          JSON.stringify(protocol),
          createdAt,
          updatedAt,
        ],
      )
    },

    async deleteProtocol(protocolId) {
      await client.run('DELETE FROM library_protocols WHERE id = ?', [protocolId])
    },

    // --- Bausteine ---
    async loadBlocks() {
      const rows = await client.query(
        'SELECT id, title, block_json, created_at, updated_at FROM library_blocks ORDER BY updated_at ASC, id ASC',
      )
      const out: LibraryBlock[] = []
      for (const row of rows) {
        if (typeof row.block_json !== 'string') continue
        let block: unknown
        try {
          block = JSON.parse(row.block_json)
        } catch {
          continue // defektes JSON überspringen
        }
        const entry: LibraryBlock = {
          id: String(row.id),
          title: String(row.title ?? ''),
          block: block as Block,
          createdAt: String(row.created_at ?? ''),
          updatedAt: String(row.updated_at ?? ''),
        }
        if (isValidLibraryBlock(entry)) out.push(entry)
      }
      return out
    },
    async saveBlock(entry) {
      if (!isValidLibraryBlock(entry)) throw new Error('Baustein ungültig — nicht gespeichert.')
      const existing = await client.query('SELECT created_at FROM library_blocks WHERE id = ?', [entry.id])
      const createdAt = (existing[0]?.created_at as string | undefined) ?? entry.createdAt ?? now()
      await client.run(
        `INSERT OR REPLACE INTO library_blocks (id, title, block_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [entry.id, entry.title, JSON.stringify(entry.block), createdAt, now()],
      )
    },
    async deleteBlock(blockId) {
      await client.run('DELETE FROM library_blocks WHERE id = ?', [blockId])
    },

    // --- Snippets ---
    async loadSnippets() {
      const rows = await client.query(
        'SELECT id, title, text, created_at, updated_at FROM library_snippets ORDER BY updated_at ASC, id ASC',
      )
      const out: LibrarySnippet[] = []
      for (const row of rows) {
        const entry: LibrarySnippet = {
          id: String(row.id),
          title: String(row.title ?? ''),
          text: typeof row.text === 'string' ? row.text : '',
          createdAt: String(row.created_at ?? ''),
          updatedAt: String(row.updated_at ?? ''),
        }
        if (isValidLibrarySnippet(entry)) out.push(entry)
      }
      return out
    },
    async saveSnippet(entry) {
      if (!isValidLibrarySnippet(entry)) throw new Error('Snippet ungültig — nicht gespeichert.')
      const existing = await client.query('SELECT created_at FROM library_snippets WHERE id = ?', [entry.id])
      const createdAt = (existing[0]?.created_at as string | undefined) ?? entry.createdAt ?? now()
      await client.run(
        `INSERT OR REPLACE INTO library_snippets (id, title, text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [entry.id, entry.title, entry.text, createdAt, now()],
      )
    },
    async deleteSnippet(snippetId) {
      await client.run('DELETE FROM library_snippets WHERE id = ?', [snippetId])
    },

    async resetLibrary() {
      await client.run('DELETE FROM library_protocols')
      await client.run('DELETE FROM library_blocks')
      await client.run('DELETE FROM library_snippets')
    },
  }
}
