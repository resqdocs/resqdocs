import { ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { createUniqueId, assertValidProtocolDraft, SCHEMA_VERSION } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { Block } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock, LibrarySnippet } from '@/storage/types'
import { buildLibraryBlock, applyBlockEdit } from './bausteineMapping'

/** Ergebnis von addBlockFromExisting — dezenter Status für die UI. */
export type SaveBausteinOutcome =
  | { ok: true; title: string }
  | { ok: false; error: string }

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
  /**
   * Variante B (#13-F4-Authoring): einen GEFÜLLTEN Protokoll-Block (mit Punkten)
   * als Baustein ablegen. Tiefe Kopie über buildLibraryBlock; repo.saveBlock
   * validiert (isValidLibraryBlock → wirft bei ungültigem Block, z. B.
   * findingGroup ohne key) — der Fehler wird als Outcome zurückgegeben, nie still.
   */
  async function addBlockFromExisting(block: Block): Promise<SaveBausteinOutcome> {
    const repo = storage.getLibraryRepository()
    const entry = buildLibraryBlock(block, blocks.value.map((b) => b.id), nowIso())
    // Vorab konkret validieren → spezifische Meldung statt nur "Baustein ungültig"
    // (z. B. "findingGroup 'grp' ohne key"). repo.saveBlock validiert zusätzlich.
    const check = assertValidProtocolDraft({ schemaVersion: SCHEMA_VERSION, id: '_lib', title: '_lib', blocks: [entry.block] })
    if (!check.valid) return { ok: false, error: check.errors[0] ?? 'Block ungültig.' }
    try {
      await repo.saveBlock(entry)
      await reload()
      return { ok: true, title: entry.title }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  /**
   * Variante A: einen bestehenden Baustein mit dem im Editor bearbeiteten Block
   * aktualisieren (id/createdAt bleiben). Vorab konkret validiert (spezifische
   * Meldung); repo.saveBlock validiert zusätzlich. Fehler als Outcome, nie still.
   */
  async function updateBlockContent(id: string, block: Block): Promise<SaveBausteinOutcome> {
    const cur = blocks.value.find((b) => b.id === id)
    if (!cur) return { ok: false, error: 'Baustein nicht gefunden.' }
    const entry = applyBlockEdit(cur, block, nowIso())
    const check = assertValidProtocolDraft({ schemaVersion: SCHEMA_VERSION, id: '_lib', title: '_lib', blocks: [entry.block] })
    if (!check.valid) return { ok: false, error: check.errors[0] ?? 'Block ungültig.' }
    try {
      await storage.getLibraryRepository().saveBlock(entry)
      await reload()
      return { ok: true, title: entry.title }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
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

  // Snippet-CRUD OPTIMISTISCH: snippets.value SOFORT (synchron, vor dem await) aktualisieren, dann OHNE
  // reload() persistieren. reload() haengt nativ an echtem SQLite-Bridge-I/O (Macrotask) - das dazwischen
  // liegende Fenster mit veralteter Liste verursachte Draft-Datenverlust + ID-Kollisionen (Verify bug-308/
  // -309). Bei Persistenz-Fehler aus der DB zuruecksynchronisieren (reload).
  async function addSnippet(): Promise<string> {
    const id = createUniqueId('snippet', new Set(snippets.value.map((s) => s.id)))
    const ts = nowIso()
    const snippet = { id, title: 'Neues Snippet', text: '', createdAt: ts, updatedAt: ts }
    snippets.value = [...snippets.value, snippet]
    try {
      await storage.getLibraryRepository().saveSnippet(snippet)
    } catch {
      await reload()
    }
    return id // fuers Mode-in-place: der Aufrufer oeffnet die frisch angelegte Karte
  }
  /** Import: ein Snippet mit gegebenem Titel + Text als NEUES anlegen (frische id -> keine Kollision).
   *  Optimistisch wie addSnippet; oeffnet KEINE Edit-Karte (der Aufrufer zeigt nur eine Erfolgsmeldung). */
  async function addSnippetFrom(title: string, text: string): Promise<string> {
    // Vor dem Anlegen sicherstellen, dass die Liste geladen ist: createUniqueId ist DETERMINISTISCH
    // (snippet, snippet-2, …). Ohne geladene ids liefert es bei leerer Liste „snippet" und
    // saveSnippet (INSERT OR REPLACE) wuerde ein bestehendes DB-Snippet ueberschreiben. Der Import kann
    // von ausserhalb des Bausteine-Tabs kommen (Vorlagen-Sheet / Cross-Routing), wo noch nichts geladen ist.
    if (!loaded.value) {
      try {
        await reload()
      } catch (err) {
        console.error('Snippet-Bibliothek laden vor dem Import fehlgeschlagen:', err instanceof Error ? err.message : err)
      }
    }
    // Konnte die Liste NICHT geladen werden (reload gescheitert), ist die id-Basis unvollstaendig ->
    // die deterministische createUniqueId ('snippet', 'snippet-2', …) koennte ein ungeladenes DB-Snippet
    // ueberschreiben (INSERT OR REPLACE). Dann kollisionssicher randomisieren (wie newBlockId bei Bloecken).
    const id = loaded.value
      ? createUniqueId('snippet', new Set(snippets.value.map((s) => s.id)))
      : `snippet-imp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const ts = nowIso()
    const snippet = { id, title: title.trim() || 'Importiertes Snippet', text, createdAt: ts, updatedAt: ts }
    snippets.value = [...snippets.value, snippet]
    try {
      await storage.getLibraryRepository().saveSnippet(snippet)
    } catch {
      await reload()
    }
    return id
  }
  async function updateSnippet(id: string, patch: { title?: string; text?: string }): Promise<void> {
    const cur = snippets.value.find((s) => s.id === id)
    if (!cur) return
    const updated = { ...cur, ...patch, updatedAt: nowIso() }
    snippets.value = snippets.value.map((s) => (s.id === id ? updated : s))
    try {
      await storage.getLibraryRepository().saveSnippet(updated)
    } catch {
      await reload()
    }
  }
  async function deleteSnippet(id: string): Promise<void> {
    snippets.value = snippets.value.filter((s) => s.id !== id) // optimistisch (kein reload-Fenster)
    try {
      await storage.getLibraryRepository().deleteSnippet(id)
    } catch {
      await reload()
    }
  }

  return {
    blocks,
    snippets,
    loaded,
    libraryMode: storage.libraryMode,
    reload,
    addBlock,
    addBlockFromExisting,
    updateBlockContent,
    renameBlock,
    deleteBlock,
    addSnippet,
    addSnippetFrom,
    updateSnippet,
    deleteSnippet,
  }
}

export function useBausteine() {
  if (!shared) shared = create()
  return shared
}
