// useSnippetLibrary.ts — Textbaustein-Bibliothek für Hosts ohne eigene (Online-Editor). Geteilter Singleton-Zustand
// über dem host-injizierten SnippetRepository (IndexedDB im Editor, sonst Memory). Optimistisch wie die Bausteine:
// die Liste sofort setzen, dann speichern; bei Fehler neu laden. Die App nutzt ihre bestehende SQLite-Bibliothek
// (useBausteine) - beide liefern über snippetSourceKey dieselbe Form an die Auswahl.
import { ref } from 'vue'
import type { SnippetItem, SnippetRepository } from '@resqdocs/protocol-core/snippetRepository'
import { resolveSnippetRepository } from './repositoryProvider.ts'

let repoPromise: Promise<SnippetRepository> | null = null
function repo(): Promise<SnippetRepository> {
  if (!repoPromise) repoPromise = resolveSnippetRepository()
  return repoPromise
}

export function newSnippetId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return `snp-${c.randomUUID()}`
  return `snp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let shared: ReturnType<typeof create> | null = null

function create() {
  const snippets = ref<SnippetItem[]>([])
  const loaded = ref(false)

  async function reload(): Promise<void> {
    snippets.value = await (await repo()).loadAll()
    loaded.value = true
  }
  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await reload()
  }
  async function persist(s: SnippetItem): Promise<void> {
    try {
      await (await repo()).save(s)
    } catch (err) {
      await reload()
      throw err
    }
  }

  /** Neuen Textbaustein anlegen (frische id, keine Kollision). Gibt die id zurück. */
  async function add(title: string, text: string): Promise<string> {
    await ensureLoaded()
    const now = new Date().toISOString()
    const s: SnippetItem = { id: newSnippetId(), title: title.trim() || 'Neuer Textbaustein', text, createdAt: now, updatedAt: now }
    snippets.value = [...snippets.value, s]
    await persist(s)
    return s.id
  }
  async function update(id: string, patch: { title?: string; text?: string }): Promise<void> {
    const cur = snippets.value.find((s) => s.id === id)
    if (!cur) return
    const next: SnippetItem = { ...cur, ...patch, updatedAt: new Date().toISOString() }
    snippets.value = snippets.value.map((s) => (s.id === id ? next : s))
    await persist(next)
  }
  async function remove(id: string): Promise<void> {
    snippets.value = snippets.value.filter((s) => s.id !== id)
    try {
      await (await repo()).remove(id)
    } catch (err) {
      await reload()
      throw err
    }
  }

  return { snippets, loaded, reload, ensureLoaded, add, update, remove }
}

export function useSnippetLibrary() {
  if (!shared) shared = create()
  return shared
}

/** Nur für Tests: Zustand und Repository-Bindung verwerfen. */
export function resetSnippetLibraryForTests(): void {
  shared = null
  repoPromise = null
}
