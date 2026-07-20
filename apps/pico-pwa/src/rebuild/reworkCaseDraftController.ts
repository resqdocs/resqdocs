// reworkCaseDraftController.ts — reine (Vue-/Capacitor-freie) Orchestrierung des temporaeren
// Einsatzentwurfs: Auto-Save mit Wettlauf-Schutz, explizites Loeschen und die LAUFENDE TTL-Pruefung.
// Spiegelt das bewaehrte temporaryCaseDraftController-Muster (dev-Draft). Persistenz + Settings +
// Vue-Anbindung liegen im duennen Wrapper useReworkCaseDraft.ts; hier ist alles pur -> node-test-bar.
//
// Der Grund fuer die Extraktion: bis hierher wurde die TTL NUR beim Laden (Kaltstart) geprueft.
// Laeuft die App durch, lief die Ablaufzeit ins Leere. checkExpiry() schliesst diese Luecke, und der
// Wettlauf-Schutz verhindert, dass ein gleichzeitiges Auto-Save den gerade geloeschten Entwurf mit
// frischer Frist wiederbelebt.
import type { ReworkCaseDraftRepository, LoadDraftResult } from '@resqdocs/protocol-core/caseDraftRepository'
import { touchDraft, isEmptyValues, type ReworkCaseDraft } from '@resqdocs/protocol-core/caseDraft'
import type { FieldFill } from '@resqdocs/protocol-core/model'

export interface ReworkCaseDraftControllerDeps {
  /** Aktuelle TTL (Stunden) aus den Einstellungen — als Getter, damit Aenderungen sofort greifen. */
  ttlHours: () => number
  now?: () => number
}

export interface ReworkCaseDraftController {
  load(): Promise<LoadDraftResult>
  save(protocolId: string | null, values: Record<string, FieldFill>): Promise<void>
  remove(): Promise<void>
  /** Laufende TTL-Pruefung. true = Entwurf war abgelaufen und wurde geloescht (+ clearLiveState). */
  checkExpiry(): Promise<boolean>
  /** Vom Einsatz-Runtime registriert: raeumt den SICHTBAREN fluechtigen Zustand + zeigt den Hinweis. */
  setClearHandler(fn: () => void): void
}

export function createReworkCaseDraftController(
  repo: ReworkCaseDraftRepository,
  deps: ReworkCaseDraftControllerDeps,
): ReworkCaseDraftController {
  const now = deps.now ?? (() => Date.now())
  let clearLiveState: (() => void) | null = null
  let previous: ReworkCaseDraft | null = null

  // Wettlauf-Schutz: ein Loeschen, das mit einem laufenden save() zusammenfaellt, wuerde den Entwurf
  // sonst WIEDERBELEBEN — der Schreiber landet nach dem Loeschen. generation entwertet faellige
  // Schreiber fruehzeitig, inFlight laesst purge() auf einen bereits laufenden warten.
  let generation = 0
  let inFlight: Promise<void> | null = null

  async function write(protocolId: string | null, values: Record<string, FieldFill>, gen: number): Promise<void> {
    if (isEmptyValues(values)) {
      previous = null
      await repo.remove()
      return
    }
    const draft = touchDraft(previous, values, protocolId, deps.ttlHours(), now())
    if (gen !== generation) return // zwischenzeitlich geloescht -> nicht wieder anlegen
    previous = draft
    await repo.save(draft)
  }

  /** Loeschen mit Wettlauf-Schutz: faellige Schreiber entwerten, auf einen laufenden warten, DANN loeschen. */
  async function purge(): Promise<void> {
    generation++
    await inFlight?.catch(() => {}) // Fehler des Schreibers sind hier egal - wir loeschen ohnehin
    previous = null
    await repo.remove()
  }

  return {
    async load() {
      const res = await repo.load()
      previous = res.draft
      return res
    },
    async save(protocolId, values) {
      const p = write(protocolId, values, generation)
      inFlight = p
      try {
        await p
      } finally {
        if (inFlight === p) inFlight = null
      }
    },
    async remove() {
      await purge()
    },
    async checkExpiry() {
      // repo.load() ist die Autoritaet: es prueft die TTL und loescht abgelaufene Entwuerfe selbst —
      // und greift auch, wenn der Einsatz-Tab nie geoeffnet wurde (previous ist dann null, der Entwurf
      // liegt aber in den Preferences). previous wird NICHT gesetzt: das ist keine Wiederherstellung.
      const { expired } = await repo.load()
      if (!expired) return false
      await purge() // gewinnt gegen einen laufenden save() + raeumt previous
      clearLiveState?.()
      return true
    },
    setClearHandler(fn) {
      clearLiveState = fn
    },
  }
}
