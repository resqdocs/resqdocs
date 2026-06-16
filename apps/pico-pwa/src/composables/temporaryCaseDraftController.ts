// temporaryCaseDraftController.ts — die Vue-nahe, aber von Capacitor/Storage
// ENTKOPPELTE Logik des temporären Einsatzentwurfs (#173). Abhängigkeiten
// (Repository, TTL-Quelle, Uhr, Debounce) werden injiziert → mit `node --test`
// prüfbar (inkl. der Persist-vs-Verwerfen-Race, bug-#173-review).
//
// Die Capacitor-/Settings-Bindung + das Singleton liegen in useTemporaryCaseDraft.ts.
import { ref } from 'vue'
import type { CaseState } from './caseState.ts'
import {
  CASE_DRAFT_DELETED_NOTICE,
  createDraft,
  isDraftExpired,
  isStateEmpty,
  touchDraft,
  type TemporaryCaseDraft,
} from './temporaryCaseDraft.ts'
import type { TemporaryCaseDraftRepository } from './temporaryCaseDraftRepository.ts'

export const PERSIST_DEBOUNCE_MS = 800

export interface ControllerDeps {
  repo: TemporaryCaseDraftRepository
  ttlHours: () => number
  now?: () => number
  debounceMs?: number
}

export function createTemporaryCaseDraftController(deps: ControllerDeps) {
  const { repo } = deps
  const now = deps.now ?? (() => Date.now())
  const debounceMs = deps.debounceMs ?? PERSIST_DEBOUNCE_MS

  /** Wird angezeigt, wenn ein Entwurf wegen Ablauf automatisch gelöscht wurde. */
  const expiredNotice = ref(false)

  let current: TemporaryCaseDraft | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  // Laufendes Speichern (debounce → persistNow). Ein Verwerfen/Ablauf MUSS darauf
  // warten und danach löschen, sonst könnte ein bereits gestartetes repo.save()
  // NACH dem repo.delete() landen und verworfene Falldaten wiederbeleben.
  let inFlight: Promise<void> | null = null
  // Monoton steigend: invalidiert geplante/laufende Persistierungen nach einem
  // Verwerfen/Ablauf, damit persistNow `current` nicht erneut setzt.
  let generation = 0
  // Vom Einsatz-Runtime registriert: leert den SICHTBAREN flüchtigen Zustand,
  // ohne erneut einen (bereits gelöschten) Storage-Entwurf zu schreiben.
  let clearLiveState: (() => void) | null = null

  function setClearHandler(fn: (() => void) | null): void {
    clearLiveState = fn
  }

  function clearNotice(): void {
    expiredNotice.value = false
  }

  /**
   * Beim App-Start: gültigen Entwurf laden und über applyFn in den flüchtigen
   * Zustand übernehmen. Abgelaufene Entwürfe wurden im Repository bereits gelöscht
   * → neutraler Hinweis. Verlängert die TTL NICHT (reines Laden ist keine Änderung).
   */
  async function restore(applyFn: (draft: TemporaryCaseDraft) => void): Promise<void> {
    const { draft, expired } = await repo.load()
    if (expired) expiredNotice.value = true
    if (draft) {
      current = draft
      applyFn(draft)
    }
  }

  /**
   * Nach einer ECHTEN Änderung aufrufen. Snapshot wird gelesen, der Sliding-Idle-
   * Timer verlängert und (gedrosselt) persistiert. Leerer Stand → Entwurf löschen.
   */
  function markChanged(snapshot: () => CaseState, protocolId: string | null): void {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      inFlight = persistNow(snapshot(), protocolId)
    }, debounceMs)
  }

  async function persistNow(state: CaseState, protocolId: string | null): Promise<void> {
    const gen = generation
    const t = now()
    // Leeren Arbeitsstand nicht persistieren (Datenminimierung) — ggf. löschen.
    if (isStateEmpty(state)) {
      if (gen !== generation) return
      current = null
      await repo.delete()
      return
    }
    const base = current && !isDraftExpired(current, t) ? current : null
    const next = base
      ? touchDraft(base, state, protocolId, deps.ttlHours(), t)
      : createDraft(state, protocolId, deps.ttlHours(), t)
    // Zwischenzeitlich verworfen/abgelaufen? Dann NICHT wiederbeleben.
    if (gen !== generation) return
    current = next
    await repo.save(next)
  }

  /**
   * Entwurf endgültig entfernen: geplante/laufende Persistierung invalidieren,
   * auf ein bereits gestartetes Speichern WARTEN und erst dann löschen — so kann
   * kein in-flight repo.save() den gelöschten Entwurf wiederbeleben (Race-Schutz).
   */
  async function purge(): Promise<void> {
    generation++
    if (debounce) clearTimeout(debounce)
    try {
      await inFlight
    } catch {
      // ein fehlgeschlagenes in-flight-Speichern darf den Purge nicht stoppen
    }
    current = null
    await repo.delete()
  }

  /** „Temporären Entwurf verwerfen": nur den Entwurf löschen, kein Hinweis. */
  async function discard(): Promise<void> {
    await purge()
  }

  /**
   * Ablaufprüfung für Resume/periodisch: ist der gespeicherte Entwurf abgelaufen,
   * wird er gelöscht, der sichtbare Zustand geleert und der Hinweis gesetzt.
   * Reiner Resume ohne Ablauf verlängert die TTL NICHT.
   */
  async function checkExpiry(): Promise<void> {
    const { expired } = await repo.load()
    if (expired) {
      // purge() wartet auf ein laufendes Speichern und löscht danach — verhindert,
      // dass ein in-flight save den gerade abgelaufenen Entwurf wiederbelebt.
      await purge()
      if (clearLiveState) clearLiveState()
      expiredNotice.value = true
    }
  }

  return {
    expiredNotice,
    deletedNotice: CASE_DRAFT_DELETED_NOTICE,
    setClearHandler,
    clearNotice,
    restore,
    markChanged,
    discard,
    checkExpiry,
  }
}
