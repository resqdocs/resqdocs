// Vue-Glue der Rework-BAUSTEIN-Bibliothek (Rework Slice 2). Duenne Schicht ueber blockRepository.ts:
// waehlt das Repository (nativ: GETEILTE SQLite-Verbindung wie die Protokoll-Bibliothek/PZN -> eine DB,
// backup-freundlich; Web-Dev: Memory), haelt die geladene Liste als geteilten Singleton-Zustand und
// schreibt OPTIMISTISCH (Muster wie die Snippets in useBausteine: die ref SOFORT setzen, dann OHNE
// reload persistieren - kein reload-Fenster mit veralteter Liste). NUR neutrale Bausteine.

import { ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import type { BlockRepository } from '@resqdocs/protocol-core/blockRepository'
import { resolveBlockRepository, getLibraryMode, type LibraryMode } from './repositoryProvider.ts'
import type { SaveBausteinOutcome } from './treeEditor'
import { newBlockId } from './blockId'

// Repository einmalig aufloesen (host-injiziert: App SQLite, Online-Editor IndexedDB, sonst Memory).
let repoPromise: Promise<BlockRepository> | null = null
function getBlockRepository(): Promise<BlockRepository> {
  if (!repoPromise) repoPromise = resolveBlockRepository()
  return repoPromise
}

let shared: ReturnType<typeof create> | null = null

function create() {
  const blocks = ref<Container[]>([])
  const loaded = ref(false)
  const libraryMode = ref<LibraryMode>('memory')

  async function reload(): Promise<void> {
    const repo = await getBlockRepository()
    libraryMode.value = getLibraryMode()
    blocks.value = await repo.loadAll()
    loaded.value = true
  }

  /** Einen (bereits geklonten, entproxyten) Container als benannten Baustein ablegen. Frische
   *  baustein-eigene id, Wurzel-title = Name. Optimistisch ans Ende, dann persistieren; bei Fehler reload. */
  async function addBausteinFromContainer(container: Container, name: string): Promise<SaveBausteinOutcome> {
    // Vor dem optimistischen Anhaengen sicherstellen, dass die Bibliothek geladen ist - sonst zeigt die
    // Liste nur den neuen Baustein (Boot-Race / beim Boot verschluckte reload-Rejection). Die id ist
    // zufaellig (newBlockId) -> selbst bei fehlgeschlagenem reload KEINE Kollision, kein Ueberschreiben
    // eines bestehenden Bausteins (Verify bug-312).
    if (!loaded.value) {
      try {
        await reload()
      } catch (err) {
        console.error('Baustein-Bibliothek laden vor dem Speichern fehlgeschlagen:', err instanceof Error ? err.message : err)
      }
    }
    const id = newBlockId()
    const title = name.trim() || 'Baustein'
    const block: Container = { ...container, id, title }
    blocks.value = [...blocks.value, block] // optimistisch (Reihenfolge = created_at ASC)
    try {
      await (await getBlockRepository()).save(block)
      return { ok: true, title }
    } catch (err) {
      await reload().catch(() => {}) // Rollback aus der Persistenz (Rollback-Fehler nicht weiter eskalieren)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async function renameBlock(id: string, title: string): Promise<void> {
    const cur = blocks.value.find((b) => b.id === id)
    if (!cur || !title.trim()) return
    const updated: Container = { ...cur, title: title.trim() }
    blocks.value = blocks.value.map((b) => (b.id === id ? updated : b)) // in-place, keine Umsortierung
    try {
      await (await getBlockRepository()).save(updated)
    } catch {
      await reload()
    }
  }

  async function deleteBlock(id: string): Promise<void> {
    blocks.value = blocks.value.filter((b) => b.id !== id) // optimistisch (kein reload-Fenster)
    try {
      await (await getBlockRepository()).remove(id)
    } catch {
      await reload()
    }
  }

  return { blocks, loaded, libraryMode, reload, addBausteinFromContainer, renameBlock, deleteBlock }
}

export function useBlockLibrary() {
  if (!shared) shared = create()
  return shared
}
