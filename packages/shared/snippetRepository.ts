// snippetRepository.ts — Vertrag der Textbaustein-Bibliothek, unabhängig vom Speicher.
// Die App hält ihre Textbausteine in der SQLite-Bibliothek (useBausteine), der Online-Editor in IndexedDB;
// beide liefern dieselbe Form. Memory-Variante für Tests und Web-Dev.

export interface SnippetItem {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface SnippetRepository {
  /** Alle Textbausteine, älteste zuerst (Reihenfolge der Anlage). */
  loadAll(): Promise<SnippetItem[]>
  save(snippet: SnippetItem): Promise<void>
  remove(id: string): Promise<void>
  reset(): Promise<void>
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

export function createMemorySnippetRepository(): SnippetRepository {
  const store = new Map<string, SnippetItem>()
  return {
    async loadAll() {
      return [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(clone)
    },
    async save(snippet) {
      const prev = store.get(snippet.id)
      store.set(snippet.id, clone({ ...snippet, createdAt: prev?.createdAt ?? snippet.createdAt }))
    },
    async remove(id) {
      store.delete(id)
    },
    async reset() {
      store.clear()
    },
  }
}
