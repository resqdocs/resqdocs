// caseDraftRepository.ts — gekapselte Persistenz des temporaeren Einsatzentwurfs (Rework) ueber einen
// KeyValueAdapter (App: Capacitor Preferences = iOS UserDefaults -> uebersteht App-Schliessen/Crash/
// Akku-Tod, KEINE WKWebView-Eviction; Web-Fallback intern). EIN JSON-Blob unter EIGENEM Key, getrennt
// vom dev-Draft. Beim Laden wird die TTL geprueft - abgelaufene Entwuerfe werden SOFORT geloescht und
// es werden KEINE (Patienten-)Daten zurueckgegeben. Adapter injiziert -> pur node-test-bar.
import { isDraftExpired, parseDraft, type ReworkCaseDraft } from './caseDraft.ts'
import type { KeyValueAdapter } from './adapters.ts'

export const REWORK_CASE_DRAFT_KEY = 'rework.case.draft'

export interface LoadDraftResult {
  /** Gueltiger, nicht abgelaufener Entwurf - sonst null. */
  draft: ReworkCaseDraft | null
  /** true, wenn ein Entwurf existierte, aber abgelaufen war (-> geloescht). */
  expired: boolean
}

export interface ReworkCaseDraftRepository {
  load(): Promise<LoadDraftResult>
  save(draft: ReworkCaseDraft): Promise<void>
  remove(): Promise<void>
}

export function createReworkCaseDraftRepository(
  adapter: KeyValueAdapter,
  now: () => number = () => Date.now(),
): ReworkCaseDraftRepository {
  return {
    async load() {
      const raw = await adapter.get(REWORK_CASE_DRAFT_KEY)
      if (!raw) return { draft: null, expired: false }
      let parsed: ReworkCaseDraft | null = null
      try {
        parsed = parseDraft(JSON.parse(raw))
      } catch {
        parsed = null
      }
      // Unlesbar/fremd -> wie nicht vorhanden, aufraeumen.
      if (!parsed) {
        await adapter.remove(REWORK_CASE_DRAFT_KEY)
        return { draft: null, expired: false }
      }
      // Abgelaufen -> SOFORT loeschen, keine Daten zurueckgeben.
      if (isDraftExpired(parsed, now())) {
        await adapter.remove(REWORK_CASE_DRAFT_KEY)
        return { draft: null, expired: true }
      }
      return { draft: parsed, expired: false }
    },
    async save(draft) {
      await adapter.set(REWORK_CASE_DRAFT_KEY, JSON.stringify(draft))
    },
    async remove() {
      await adapter.remove(REWORK_CASE_DRAFT_KEY)
    },
  }
}
