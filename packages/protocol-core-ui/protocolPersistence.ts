// Persistenz-Anbindung der Rework-Protokoll-Bibliothek (Slice 2b). Duenne Vue-Glue ueber die reinen
// Funktionen aus protocolRepository.ts: waehlt das Repository (nativ: GETEILTE SQLite-Verbindung wie
// Library/PZN -> backup-freundlich, eine DB; Web-Dev: Memory), laedt die Bibliothek beim Boot (seedet
// die Default-Vorlage, falls leer) und spiegelt Aenderungen automatisch (debounced) in die Persistenz
// mit sichtbarem Save-Status. NUR Vorlagen (keine Patientendaten).

import { ref, watch } from 'vue'
import { useProtocolTree } from './useProtocolTree.ts'
import {
  loadOrSeed,
  syncProtocols,
  type ProtocolRepository,
} from '@resqdocs/protocol-core/protocolRepository'
import {
  resolveProtocolRepository,
  getLibraryMode,
  getPersistenceDegradedReason,
  type LibraryMode,
} from './repositoryProvider.ts'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Repository einmalig aufloesen (host-injiziert: App SQLite, Online-Editor IndexedDB, sonst Memory).
let repoPromise: Promise<ProtocolRepository> | null = null
function getReworkRepository(): Promise<ProtocolRepository> {
  if (!repoPromise) repoPromise = resolveProtocolRepository()
  return repoPromise
}

const saveStatus = ref<SaveStatus>('idle')
const libraryMode = ref<LibraryMode>('memory')
// Gesetzt, wenn die Bibliothek beim Boot NICHT gelesen werden konnte (defekte/unlesbare DB). Dann ist die
// Persistenz in dieser Sitzung BEWUSST aus (kein Auto-Save), damit kein Edit die evtl. wiederherstellbaren
// Zeilen ueberschreibt. Konsumenten (Save-Badge) zeigen das ehrlich an, statt „gespeichert" vorzutaeuschen.
const libraryError = ref<string | null>(null)
// true, sobald die persistierte Bibliothek den Seed abgeloest hat (bzw. der Seed als Fallback steht).
// Konsumenten (z. B. Einsatz-Default-Auswahl) duerfen erst DANN gegen die Bibliothek aufloesen -
// sonst laeuft die Aufloesung gegen den Seed und trifft die persoenliche Standard-Vorlage nicht.
const libraryLoaded = ref(false)
let started = false
let activeRepo: ProtocolRepository | null = null // fuer den Retry-Pfad
let saveTimer: ReturnType<typeof setTimeout> | null = null // ausstehender Auto-Save (fuer flushNow beim Schliessen)

export function useProtocolPersistence() {
  const tree = useProtocolTree()

  /** Fehlgeschlagenen Auto-Save erneut versuchen (Save-Status-Badge). */
  async function retrySave(): Promise<void> {
    if (libraryError.value || !activeRepo) return // Wiederherstellungs-Zustand: NIE gegen die defekte DB schreiben
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

  /** Ausstehenden Auto-Save SOFORT wegschreiben, statt auf den 800 ms-Debounce zu warten — beim
   *  Verlassen/Schliessen des Tabs (visibilitychange hidden / pagehide). Nur wenn wirklich etwas
   *  aussteht. Best-effort: der IndexedDB-Write ist async und kann beim harten Schliessen unvollstaendig
   *  bleiben, schliesst aber das 800 ms-Fenster im Regelfall. Kein TTL, keine Patientendaten — reine
   *  Vorlagen-Persistenz (Desktop-Editor). */
  async function flushNow(): Promise<void> {
    if (libraryError.value) return // Wiederherstellungs-Zustand: nichts wegschreiben
    if (!saveTimer || !activeRepo) return
    clearTimeout(saveTimer)
    saveTimer = null
    saveStatus.value = 'saving'
    try {
      await syncProtocols(activeRepo, tree.protocols.value)
      saveStatus.value = 'saved'
      setTimeout(() => {
        if (saveStatus.value === 'saved') saveStatus.value = 'idle'
      }, 1500)
    } catch (err) {
      console.error('Protokoll-Speichern (Flush) fehlgeschlagen:', err instanceof Error ? err.message : err)
      saveStatus.value = 'error'
    }
  }

  /** „Alles lokal zuruecksetzen" (Datenschutz): Vorlagen-Bibliothek wirklich leeren.
   *
   *  BEIDES ist noetig. repo.reset() ALLEIN waere wirkungslos: der Auto-Save-Watch unten haelt die
   *  Liste weiter im Speicher und spiegelt sie 800 ms spaeter per replaceAll() zurueck in die
   *  Tabelle — das Zuruecksetzen wuerde sich also zeitversetzt selbst rueckgaengig machen.
   *  setProtocols([]) ist zugleich der Crash-Schutz: die Liste ist nie leer (useProtocolTree macht
   *  daraus eine frische Blanko-Vorlage und setzt die aktiven ids neu), sonst liefen einsatzRoot/
   *  editorRoot ins Leere. Der Watch schreibt danach genau diese Blanko-Vorlage fest.
   *  Das Repository ist modul-privat -> der Reset MUSS hierueber laufen; resolveProtocolRepository()
   *  von aussen wuerde im Memory-Modus ein ZWEITES, unbeteiligtes Repository treffen. */
  async function resetLibrary(): Promise<void> {
    tree.setProtocols([])
    if (activeRepo) await activeRepo.reset()
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

    // DEGRADATION (Host meldete: eigentlich persistente DB nicht oeffenbar -> Memory-Fallback). Der Memory-Stand
    // sieht „gesund" aus (leer, lesbar), wuerde also seeden + den Auto-Save scharfschalten + „Gespeichert"
    // zeigen — waehrend neu erstellte Vorlagen nur im RAM landen und beim Neustart still verloren gehen. Deshalb
    // HIER, VOR loadOrSeed/Watch, ehrlich in den nicht-persistenten Fehlerzustand gehen. Vorhandene On-Disk-Daten
    // sind unberuehrt (die DB wurde nie erfolgreich geoeffnet) und laden bei einem spaeteren gesunden Boot wieder.
    const degraded = getPersistenceDegradedReason()
    if (degraded) {
      console.error('Rework-Bibliothek: Persistenz degradiert (Memory-Fallback) —', degraded)
      libraryError.value =
        'Die Vorlagen-Bibliothek konnte nicht geoeffnet werden. Vorhandene Daten bleiben unangetastet, aber Aenderungen werden in dieser Sitzung NICHT gespeichert. Bitte nicht zuruecksetzen/deinstallieren und den Support kontaktieren.'
      saveStatus.value = 'error'
      libraryLoaded.value = true
      return // kein Seed-Schein, kein destruktiver Watch
    }

    // Boot-Laden/Seed. KRITISCH fuer Datensicherheit: scheitert das Laden (defekte DB) ODER meldet
    // loadOrSeed, dass Zeilen existieren aber nicht lesbar sind (ProtocolLibraryUnreadableError), dann
    // darf der destruktive Auto-Save NIE gegen die echte Tabelle laufen — sonst ueberschreibt der erste
    // Edit die evtl. noch vorhandenen Daten. Wir biegen activeRepo auf ein isoliertes Memory-Repo
    // (alle Schreibpfade ins Leere) und schalten den Watch GAR NICHT erst scharf.
    let loadOk = false
    try {
      tree.setProtocols(await loadOrSeed(repo, tree.protocols.value))
      loadOk = true
    } catch (err) {
      console.error(
        'Rework-Bibliothek laden/seeden fehlgeschlagen — Auto-Save wird NICHT scharfgeschaltet, um vorhandene Daten nicht zu ueberschreiben:',
        err instanceof Error ? err.message : err,
      )
      // activeRepo bleibt BEWUSST das ECHTE Repo (NICHT auf Memory umbiegen): so leert ein spaeterer,
      // BEWUSSTER resetLibrary() wirklich die defekte On-Disk-Tabelle. Die Schreibpfade (Auto-Save/Flush/
      // Retry) sind ueber libraryError blockiert -> kein Edit ueberschreibt die (evtl. wiederherstellbaren)
      // Zeilen. Der Save-Badge zeigt den Fehler ehrlich an, statt faelschlich „gespeichert" (sonst verliert
      // der Nutzer neu erstellte Vorlagen still beim Neustart).
      libraryError.value =
        'Die Vorlagen-Bibliothek konnte nicht gelesen werden. Vorhandene Daten bleiben unangetastet, aber Aenderungen werden in dieser Sitzung NICHT gespeichert. Bitte nicht zuruecksetzen/deinstallieren und den Support kontaktieren.'
      saveStatus.value = 'error'
    }
    // Bibliothek steht (geladen ODER Fehlerzustand) -> Konsumenten duerfen aufloesen.
    libraryLoaded.value = true
    if (!loadOk) return // KEIN destruktiver Watch nach fehlgeschlagenem/unlesbarem Laden

    // Auto-Save: jede Aenderung debounced spiegeln (Watch NACH dem Laden -> initiales setProtocols
    // schreibt nicht). NUR bei sauberem Laden scharf. saveTimer liegt modulweit, damit flushNow()
    // den ausstehenden Save beim Schliessen sofort wegschreiben kann.
    watch(
      tree.protocols,
      () => {
        saveStatus.value = 'saving'
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null // nichts mehr ausstehend -> flushNow ist danach ein No-op
          void syncProtocols(repo, tree.protocols.value)
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

  return { init, saveStatus, libraryMode, libraryLoaded, libraryError, retrySave, resetLibrary, flushNow }
}
