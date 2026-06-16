// temporaryCaseDraftRepository.ts — gekapselte Persistenz des temporären
// Einsatzentwurfs (#173) über einen KeyValue-Adapter (Capacitor Preferences;
// Web-Fallback intern, KEIN direkter localStorage/IndexedDB-Zugriff).
//
// Spiegelt das Muster von creatorSessionStore.ts: EIN JSON-Blob unter einem
// festen Key. Beim Laden wird die TTL geprüft — abgelaufene Entwürfe werden
// SOFORT gelöscht und es werden keine (Patienten-)Daten zurückgegeben.
//
// Der Adapter wird INJIZIERT (kein Capacitor-Import hier) → pur testbar; die
// Bindung an Preferences liegt in useTemporaryCaseDraft.ts.
import { isDraftExpired, parseDraft, type TemporaryCaseDraft } from './temporaryCaseDraft.ts'
import type { KeyValueAdapter } from '../storage/types.ts'

export const CASE_DRAFT_KEY = 'case.draft.temp'

export interface LoadDraftResult {
  /** Gültiger, nicht abgelaufener Entwurf — sonst null. */
  draft: TemporaryCaseDraft | null
  /** true, wenn ein Entwurf existierte, aber abgelaufen war (→ gelöscht). */
  expired: boolean
}

export interface TemporaryCaseDraftRepository {
  load(): Promise<LoadDraftResult>
  save(draft: TemporaryCaseDraft): Promise<void>
  delete(): Promise<void>
}

/**
 * @param adapter KeyValue-Backend (App: Capacitor Preferences; Test: Fake).
 * @param now     injizierbare Uhr (Default Date.now) — für TTL-Prüfung beim Laden.
 */
export function createTemporaryCaseDraftRepository(
  adapter: KeyValueAdapter,
  now: () => number = () => Date.now(),
): TemporaryCaseDraftRepository {
  return {
    async load() {
      const raw = await adapter.get(CASE_DRAFT_KEY)
      if (!raw) return { draft: null, expired: false }
      let parsed: TemporaryCaseDraft | null = null
      try {
        parsed = parseDraft(JSON.parse(raw))
      } catch {
        parsed = null
      }
      // Unlesbar/fremd → wie nicht vorhanden, aufräumen.
      if (!parsed) {
        await adapter.remove(CASE_DRAFT_KEY)
        return { draft: null, expired: false }
      }
      // Abgelaufen → sofort löschen, keine Daten zurückgeben.
      if (isDraftExpired(parsed, now())) {
        await adapter.remove(CASE_DRAFT_KEY)
        return { draft: null, expired: true }
      }
      return { draft: parsed, expired: false }
    },
    async save(draft) {
      await adapter.set(CASE_DRAFT_KEY, JSON.stringify(draft))
    },
    async delete() {
      await adapter.remove(CASE_DRAFT_KEY)
    },
  }
}
