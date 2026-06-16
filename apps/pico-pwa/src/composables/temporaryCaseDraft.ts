// temporaryCaseDraft.ts — reine, Vue-freie TTL-Logik des temporären Einsatzentwurfs (#173).
//
// #173 ist ein BEWUSST begrenzter Ausnahmefall zur DR-0004-Regel „kein caseState im
// Storage": ein laufender Einsatzentwurf darf kurzfristig LOKAL fortgesetzt werden
// (auch nach App-Neustart), wird aber per Sliding-Idle-TTL automatisch nach
// Inaktivität gelöscht. KEIN Archiv, KEIN Sync, KEINE Cloud.
//
// Datenschutz-Leitplanken (Art. 5/25 DSGVO — Datenminimierung, Speicherbegrenzung,
// Privacy-by-Default; OWASP HTML5 Storage): es wird AUSSCHLIESSLICH der aktuell
// nötige Arbeitsstand (die drei caseState-Sammlungen) gespeichert — keine Roh-BMP-/
// Barcode-Payloads, keine Bilder, keine Debug-Dumps, keine Telemetrie.
//
// Bewusst frei von Vue/Storage: so bleibt die TTL-Logik mit `node --test` und einer
// injizierbaren Uhr prüfbar.
import type { CaseState, PointValue } from './caseState.ts'

/** TTL-Grenzen (Stunden). Default 3 h, einstellbar 1–5 h. */
export const CASE_DRAFT_TTL_MIN_HOURS = 1
export const CASE_DRAFT_TTL_MAX_HOURS = 5
export const CASE_DRAFT_TTL_DEFAULT_HOURS = 3

/** Neutraler Hinweis bei automatischer Löschung (kein Patientendatum). */
export const CASE_DRAFT_DELETED_NOTICE =
  'Der temporäre Einsatzentwurf wurde aus Datenschutzgründen gelöscht.'

const HOUR_MS = 60 * 60 * 1000

/** Persistierter temporärer Entwurf. NUR der Arbeitsstand + Zeitstempel. */
export interface TemporaryCaseDraft {
  version: 1
  /** Vorlage, zu der der Entwurf gehört (zum Wiederherstellen in die richtige Vorlage). */
  protocolId: string | null
  createdAt: number
  /** Letzte ECHTE Änderung (nicht: Öffnen/Anzeigen/Resume). */
  lastTouchedAt: number
  /** Ablauf = lastTouchedAt + ttlHours; bei jeder echten Änderung neu gesetzt. */
  expiresAt: number
  ttlHours: number
  /** Der flüchtige Arbeitsstand (drei Sammlungen) — sonst nichts. */
  state: CaseState
}

/** TTL auf den gültigen Bereich begrenzen (ganze Stunden), sonst Default. */
export function clampTtlHours(h: unknown): number {
  const n = Number(h)
  if (!Number.isFinite(n)) return CASE_DRAFT_TTL_DEFAULT_HOURS
  return Math.max(CASE_DRAFT_TTL_MIN_HOURS, Math.min(CASE_DRAFT_TTL_MAX_HOURS, Math.round(n)))
}

/** Nur die drei bekannten caseState-Sammlungen übernehmen — defensiv gegen Fremddaten. */
function sanitizeState(s: unknown): CaseState | null {
  if (!s || typeof s !== 'object') return null
  const o = s as Partial<CaseState>
  const variableValues =
    o.variableValues && typeof o.variableValues === 'object' && !Array.isArray(o.variableValues)
      ? (o.variableValues as Record<string, unknown>)
      : {}
  const values =
    o.values && typeof o.values === 'object' && !Array.isArray(o.values)
      ? (o.values as Record<string, PointValue>)
      : {}
  const activeBlocks = Array.isArray(o.activeBlocks)
    ? o.activeBlocks.filter((x): x is string => typeof x === 'string')
    : []
  return { variableValues, values, activeBlocks }
}

/** Ob ein Entwurf leer ist (kein speicherwürdiger Arbeitsstand). */
export function isStateEmpty(state: CaseState): boolean {
  return (
    Object.keys(state.variableValues).length === 0 &&
    Object.keys(state.values).length === 0 &&
    state.activeBlocks.length === 0
  )
}

/** Frischer Entwurf: createdAt = lastTouchedAt = now, expiresAt = now + ttl. */
export function createDraft(
  state: CaseState,
  protocolId: string | null,
  ttlHours: number,
  now: number,
): TemporaryCaseDraft {
  const ttl = clampTtlHours(ttlHours)
  return {
    version: 1,
    protocolId,
    createdAt: now,
    lastTouchedAt: now,
    expiresAt: now + ttl * HOUR_MS,
    ttlHours: ttl,
    state: sanitizeState(state) ?? { variableValues: {}, values: {}, activeBlocks: [] },
  }
}

/**
 * Nach einer ECHTEN Änderung: Arbeitsstand übernehmen, Sliding-Idle-Timer verlängern
 * (lastTouchedAt = now, expiresAt = now + ttl). createdAt bleibt erhalten.
 */
export function touchDraft(
  previous: TemporaryCaseDraft | null,
  state: CaseState,
  protocolId: string | null,
  ttlHours: number,
  now: number,
): TemporaryCaseDraft {
  const ttl = clampTtlHours(ttlHours)
  const createdAt = previous && !isDraftExpired(previous, now) ? previous.createdAt : now
  return {
    version: 1,
    protocolId,
    createdAt,
    lastTouchedAt: now,
    expiresAt: now + ttl * HOUR_MS,
    ttlHours: ttl,
    state: sanitizeState(state) ?? { variableValues: {}, values: {}, activeBlocks: [] },
  }
}

/** Abgelaufen, sobald die Inaktivitäts-Frist erreicht ist (now >= expiresAt). */
export function isDraftExpired(draft: TemporaryCaseDraft, now: number): boolean {
  return now >= draft.expiresAt
}

/** Rohdaten aus dem Storage validieren; null bei ungültiger/fremder Struktur. */
export function parseDraft(raw: unknown): TemporaryCaseDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<TemporaryCaseDraft>
  const state = sanitizeState(o.state)
  if (!state) return null
  const createdAt = Number(o.createdAt)
  const lastTouchedAt = Number(o.lastTouchedAt)
  const expiresAt = Number(o.expiresAt)
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastTouchedAt) || !Number.isFinite(expiresAt)) {
    return null
  }
  return {
    version: 1,
    protocolId: typeof o.protocolId === 'string' ? o.protocolId : null,
    createdAt,
    lastTouchedAt,
    expiresAt,
    ttlHours: clampTtlHours(o.ttlHours),
    state,
  }
}
