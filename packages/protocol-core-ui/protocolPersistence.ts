// Persistenz-Anbindung der Rework-Protokoll-Bibliothek (Slice 2b). Duenne Vue-Glue ueber die reinen
// Funktionen aus protocolRepository.ts: waehlt das Repository (nativ: GETEILTE SQLite-Verbindung wie
// Library/PZN -> backup-freundlich, eine DB; Web-Dev: Memory), laedt die Bibliothek beim Boot (seedet
// die Default-Vorlage, falls leer) und spiegelt Aenderungen automatisch (debounced) in die Persistenz
// mit sichtbarem Save-Status. NUR Vorlagen (keine Patientendaten).

import { ref, watch } from 'vue'
import { useProtocolTree } from './useProtocolTree.ts'
import { loadOrSeed, syncProtocols, type ProtocolRepository } from '@resqdocs/protocol-core/protocolRepository'
import { resolveProtocolRepository, getLibraryMode, type LibraryMode } from './repositoryProvider.ts'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Repository einmalig aufloesen (host-injiziert: App SQLite, Online-Editor IndexedDB, sonst Memory).
let repoPromise: Promise<ProtocolRepository> | null = null
function getReworkRepository(): Promise<ProtocolRepository> {
  if (!repoPromise) repoPromise = resolveProtocolRepository()
  return repoPromise
}

const saveStatus = ref<SaveStatus>('idle')
const libraryMode = ref<LibraryMode>('memory')
// true, sobald die persistierte Bibliothek den Seed abgeloest hat (bzw. der Seed als Fallback steht).
// Konsumenten (z. B. Einsatz-Default-Auswahl) duerfen erst DANN gegen die Bibliothek aufloesen -
// sonst laeuft die Aufloesung gegen den Seed und trifft die persoenliche Standard-Vorlage nicht.
const libraryLoaded = ref(false)
let started = false
let activeRepo: ProtocolRepository | null = null // fuer den Retry-Pfad

export function useProtocolPersistence() {
  const tree = useProtocolTree()

  /** Fehlgeschlagenen Auto-Save erneut versuchen (Save-Status-Badge). */
  async function retrySave(): Promise<void> {
    if (!activeRepo) return
    saveStatus.value = 'saving'
    try {
      await syncProtocols(activeRepo, tree.protocols.value)
      saveStatus.value = 'saved'
      setTimeout(() => {
        if (saveStatus.value === 'saved') saveStatus.value = 'idle'
      }, 1500)
    } catch (err) {
      console.error('Protokoll-Speichern (Retry) fehlgeschlagen:', err)
      saveStatus.value = 'error'
    }
  }

  async function init(): Promise<void> {
    if (started) return
    started = true
    let repo: ProtocolRepository
    try {
      repo = await getReworkRepository() // faengt eigene Init-Fehler ab (Memory-Fallback)
    } catch (err) {
      started = false // Repository nicht verfuegbar -> erneuter init()-Aufruf darf es nochmal versuchen
      console.error('Rework-Bibliothek: Repository nicht verfuegbar:', err instanceof Error ? err.message : err)
      return
    }
    activeRepo = repo
    libraryMode.value = getLibraryMode()

    // Boot-Laden/Seed ISOLIERT: ein Fehler hier (z. B. defekte DB) darf den Auto-Save NICHT
    // verhindern und ist KEIN Speicherfehler -> nur loggen, mit der In-Memory-Default-Bibliothek weiter.
    try {
      tree.setProtocols(await loadOrSeed(repo, tree.protocols.value))
    } catch (err) {
      console.error('Rework-Bibliothek laden/seeden fehlgeschlagen:', err instanceof Error ? err.message : err)
    }
    // Bibliothek steht (geladen ODER Seed-Fallback nach Fehler) -> Konsumenten duerfen jetzt aufloesen.
    libraryLoaded.value = true

    // Auto-Save: jede Aenderung debounced spiegeln (Watch NACH dem Laden -> initiales setProtocols
    // schreibt nicht). Wird IMMER gesetzt, auch wenn das Laden scheiterte.
    let timer: ReturnType<typeof setTimeout> | null = null
    watch(
      tree.protocols,
      (current) => {
        saveStatus.value = 'saving'
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          void syncProtocols(repo, current)
            .then(() => {
              saveStatus.value = 'saved'
              setTimeout(() => {
                if (saveStatus.value === 'saved') saveStatus.value = 'idle'
              }, 1500)
            })
            .catch((err) => {
              console.error('Protokoll-Speichern fehlgeschlagen:', err instanceof Error ? err.message : err)
              saveStatus.value = 'error'
            })
        }, 800)
      },
      { deep: true },
    )
  }

  return { init, saveStatus, libraryMode, libraryLoaded, retrySave }
}
