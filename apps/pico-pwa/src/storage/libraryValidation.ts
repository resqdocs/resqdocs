// libraryValidation.ts — reine Validierung neutraler Library-Einträge (#13-F3).
//
// Wiederverwendet die Domain-Validierung (assertValidProtocolDraft) für den Block
// eines Bausteins — keine eigene Block-Struktur-Logik. Frei von Storage/Vue → in
// node:test prüfbar. Stellt sicher, dass defekte/ungültige Datensätze NICHT still
// übernommen werden. Keine Patientendaten.
import { assertValidProtocolDraft, SCHEMA_VERSION } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock, LibrarySnippet } from './types'

export function isValidLibraryBlock(x: unknown): x is LibraryBlock {
  if (!x || typeof x !== 'object') return false
  const b = x as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id) return false
  if (typeof b.title !== 'string' || !b.title.trim()) return false
  if (!b.block || typeof b.block !== 'object') return false
  // Block über das Domain-Schema validieren (Wegwerf-Protokoll).
  return assertValidProtocolDraft({
    schemaVersion: SCHEMA_VERSION,
    id: '_lib',
    title: '_lib',
    blocks: [b.block as never],
  }).valid
}

export function isValidLibrarySnippet(x: unknown): x is LibrarySnippet {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    typeof s.id === 'string' && !!s.id &&
    typeof s.title === 'string' &&
    typeof s.text === 'string'
  )
}
