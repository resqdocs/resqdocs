import { ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { createUniqueId } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock, LibrarySnippet } from '@/storage/types'

/**
 * Bausteine-/Snippet-Bibliothek (#13-F3). Geteilter Singleton-Zustand, geladen
 * über die gekapselte Storage-Schicht (SQLite nativ / Memory im Web-Dev) — die
 * UI kennt das Backend NICHT. NUR neutrale Vorlagen; keine Patientendaten, kein
 * caseState, kein Auto-Save aus der Einsatzansicht.
 */
let shared: ReturnType<typeof create> | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function create() {
  const storage = useStorage()
  const blocks = ref<LibraryBlock[]>([])
  const snippets = ref<LibrarySnippet[]>([])
  const loaded = ref(false)

  async function reload(): Promise<void> {
    await storage.initLibrary() // stellt nativ SQLite sicher; Web → Memory
    const repo = storage.getLibraryRepository()
    blocks.value = await repo.loadBlocks()
    snippets.value = await repo.loadSnippets()
    loaded.value = true
  }

  async function addBlock(): Promise<void> {
    const repo = storage.getLibraryRepository()
    const id = createUniqueId('baustein', new Set(blocks.value.map((b) => b.id)))
    const title = 'Neuer Baustein'
    const ts = nowIso()
    await repo.saveBlock({ id, title, block: { id: createUniqueId('blk', new Set()), title, points: [] }, createdAt: ts, updatedAt: ts })
    await reload()
  }
  async function renameBlock(id: string, title: string): Promise<void> {
    const cur = blocks.value.find((b) => b.id === id)
    if (!cur || !title.trim()) return
    await storage.getLibraryRepository().saveBlock({ ...cur, title, block: { ...cur.block, title } })
    await reload()
  }
  async function deleteBlock(id: string): Promise<void> {
    await storage.getLibraryRepository().deleteBlock(id)
    await reload()
  }

  async function addSnippet(): Promise<void> {
    const repo = storage.getLibraryRepository()
    const id = createUniqueId('snippet', new Set(snippets.value.map((s) => s.id)))
    const ts = nowIso()
    await repo.saveSnippet({ id, title: 'Neues Snippet', text: '', createdAt: ts, updatedAt: ts })
    await reload()
  }
  async function updateSnippet(id: string, patch: { title?: string; text?: string }): Promise<void> {
    const cur = snippets.value.find((s) => s.id === id)
    if (!cur) return
    await storage.getLibraryRepository().saveSnippet({ ...cur, ...patch })
    await reload()
  }
  async function deleteSnippet(id: string): Promise<void> {
    await storage.getLibraryRepository().deleteSnippet(id)
    await reload()
  }

  return {
    blocks,
    snippets,
    loaded,
    libraryMode: storage.libraryMode,
    reload,
    addBlock,
    renameBlock,
    deleteBlock,
    addSnippet,
    updateSnippet,
    deleteSnippet,
  }
}

export function useBausteine() {
  if (!shared) shared = create()
  return shared
}
