// useReworkCaseDraft.ts — Capacitor-/Settings-Bindung + Singleton des temporaeren EINSATZ-Entwurfs
// (Rework). Reine TTL-Logik in caseDraft.ts, Persistenz in caseDraftRepository.ts. Spiegelt das
// dev-useTemporaryCaseDraft-Muster: Preferences-Adapter + caseDraftTtlHours aus den Settings.
//
// TTL-Verhalten: NUR echte Aenderungen (save mit nicht-leeren Werten) verlaengern die Sliding-Idle-
// Frist. Leerer Stand -> Entwurf wird geloescht (kein Draft fuer einen leeren Einsatz).
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { useStorage } from '@/storage/useStorage'
import { createReworkCaseDraftRepository, type LoadDraftResult } from '@resqdocs/protocol-core/caseDraftRepository'
import { touchDraft, isEmptyValues, type ReworkCaseDraft } from '@resqdocs/protocol-core/caseDraft'
import type { FieldFill } from '@resqdocs/protocol-core/model'

function create() {
  const storage = useStorage()
  const repo = createReworkCaseDraftRepository(preferencesAdapter)
  let previous: ReworkCaseDraft | null = null

  return {
    /** Beim Start laden (Repository prueft TTL -> abgelaufen wird sofort geloescht). */
    async load(): Promise<LoadDraftResult> {
      const res = await repo.load()
      previous = res.draft
      return res
    },
    /** Nach echter Aenderung speichern (sliding-idle). Leerer Stand -> Entwurf loeschen. */
    async save(protocolId: string | null, values: Record<string, FieldFill>): Promise<void> {
      if (isEmptyValues(values)) {
        previous = null
        await repo.remove()
        return
      }
      const draft = touchDraft(previous, values, protocolId, storage.settings.caseDraftTtlHours, Date.now())
      previous = draft
      await repo.save(draft)
    },
    /** Entwurf explizit loeschen (Abschluss / Datenschutz-Reset). */
    async remove(): Promise<void> {
      previous = null
      await repo.remove()
    },
  }
}

let shared: ReturnType<typeof create> | null = null

/** Singleton - EINE Quelle fuer Restore, Auto-Save und Loeschen des Rework-Einsatzentwurfs. */
export function useReworkCaseDraft() {
  if (!shared) shared = create()
  return shared
}
