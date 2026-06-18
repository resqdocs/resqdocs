// memoryLibraryRepository.ts — In-Memory-Fake des LibraryRepository.
//
// Zweck: Tests + Web-Dev-Fallback (nativ → SQLite, #13-F2). Explizit NICHT
// persistent (lebt im Closure), keine Browser-/Native-APIs. NUR neutrale Inhalte
// — Protokolle, Bausteine, Snippets. Keine Patientendaten, kein caseState.
import type { Protocol } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock, LibrarySnippet, LibraryRepository } from './types'
import { isValidLibraryBlock, isValidLibrarySnippet } from './libraryValidation.ts'

export interface MemoryLibrarySeed {
  blocks?: LibraryBlock[]
  snippets?: LibrarySnippet[]
  now?: () => string
}

export function createMemoryLibraryRepository(
  initial: Protocol[] = [],
  seed: MemoryLibrarySeed = {},
): LibraryRepository {
  const now = seed.now ?? (() => new Date().toISOString())
  let protocols: Protocol[] = initial.map((p) => structuredClone(p))
  let blocks: LibraryBlock[] = (seed.blocks ?? []).map((b) => structuredClone(b))
  let snippets: LibrarySnippet[] = (seed.snippets ?? []).map((s) => structuredClone(s))

  function upsert<T extends { id: string }>(list: T[], entry: T): T[] {
    const copy = structuredClone(entry)
    const i = list.findIndex((x) => x.id === entry.id)
    if (i >= 0) list[i] = copy
    else list.push(copy)
    return list
  }
  function stamp<T extends { createdAt: string; updatedAt: string; id: string }>(list: T[], entry: T): T {
    const existing = list.find((x) => x.id === entry.id)
    return { ...entry, createdAt: existing?.createdAt ?? entry.createdAt ?? now(), updatedAt: now() }
  }

  return {
    // Protokolle
    async loadProtocols() {
      return protocols.map((p) => structuredClone(p))
    },
    async saveProtocol(protocol) {
      const copy = structuredClone(protocol)
      const i = protocols.findIndex((p) => p.id === protocol.id)
      if (i >= 0) protocols[i] = copy
      else protocols.push(copy)
    },
    async deleteProtocol(protocolId) {
      protocols = protocols.filter((p) => p.id !== protocolId)
    },

    // Bausteine
    async loadBlocks() {
      return blocks.filter(isValidLibraryBlock).map((b) => structuredClone(b))
    },
    async saveBlock(block) {
      if (!isValidLibraryBlock(block)) throw new Error('Baustein ungültig — nicht gespeichert.')
      upsert(blocks, stamp(blocks, block))
    },
    async deleteBlock(blockId) {
      blocks = blocks.filter((b) => b.id !== blockId)
    },

    // Snippets
    async loadSnippets() {
      return snippets.filter(isValidLibrarySnippet).map((s) => structuredClone(s))
    },
    async saveSnippet(snippet) {
      if (!isValidLibrarySnippet(snippet)) throw new Error('Snippet ungültig — nicht gespeichert.')
      upsert(snippets, stamp(snippets, snippet))
    },
    async deleteSnippet(snippetId) {
      snippets = snippets.filter((s) => s.id !== snippetId)
    },

    async resetLibrary() {
      protocols = []
      blocks = []
      snippets = []
    },
  }
}
