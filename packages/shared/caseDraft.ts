// caseDraft.ts — reine, Vue-/Storage-freie TTL-Logik des temporaeren EINSATZ-Entwurfs (Rework).
//
// DSGVO (Art. 5/25 - Datenminimierung, Speicherbegrenzung, Privacy-by-Default): bewusst begrenzter
// Ausnahmefall. Ein LAUFENDER Einsatz darf kurzfristig LOKAL fortgesetzt werden (auch nach
// App-Neustart / Crash / leerem Akku), wird aber per Sliding-Idle-TTL nach Inaktivitaet automatisch
// geloescht. KEIN Archiv, KEIN Sync, KEINE Cloud. Es wird AUSSCHLIESSLICH der Arbeitsstand
// (protocolId + values) gespeichert.
//
// Spiegelt das bewaehrte dev-Muster (composables/temporaryCaseDraft.ts), aber mit dem Rework-Wertformat
// (Record<id, FieldFill>) und EIGENEM Key - getrennt vom dev-Draft (anderes caseState-Format).
import type { FieldFill, FunctionRow } from './model.ts'

/** TTL-Grenzen (Stunden). Default 3 h, einstellbar 1-5 h (Settings: caseDraftTtlHours). */
export const CASE_DRAFT_TTL_MIN_HOURS = 1
export const CASE_DRAFT_TTL_MAX_HOURS = 5
export const CASE_DRAFT_TTL_DEFAULT_HOURS = 3

/** Neutraler Hinweis bei automatischer Loeschung (kein Patientendatum). */
export const CASE_DRAFT_DELETED_NOTICE = 'Der temporäre Einsatzentwurf wurde aus Datenschutzgründen gelöscht.'

const HOUR_MS = 60 * 60 * 1000

/** Persistierter temporaerer Entwurf. NUR Arbeitsstand + Zeitstempel. */
export interface ReworkCaseDraft {
  version: 1
  /** Vorlage, zu der der Entwurf gehoert (zum Wiederherstellen in die richtige Vorlage). */
  protocolId: string | null
  createdAt: number
  /** Letzte ECHTE Aenderung (nicht Oeffnen/Anzeigen/Resume). */
  lastTouchedAt: number
  /** Ablauf = lastTouchedAt + ttlHours; bei jeder echten Aenderung neu gesetzt. */
  expiresAt: number
  ttlHours: number
  /** Der fluechtige Arbeitsstand (Tri-State je Feld) - sonst nichts. */
  values: Record<string, FieldFill>
}

/** TTL auf den gueltigen Bereich begrenzen (ganze Stunden), sonst Default. */
export function clampTtlHours(h: unknown): number {
  const n = Number(h)
  if (!Number.isFinite(n)) return CASE_DRAFT_TTL_DEFAULT_HOURS
  return Math.max(CASE_DRAFT_TTL_MIN_HOURS, Math.min(CASE_DRAFT_TTL_MAX_HOURS, Math.round(n)))
}

export function isEmptyValues(values: Record<string, FieldFill>): boolean {
  return Object.keys(values).length === 0
}

/** Abgelaufen, sobald die Inaktivitaets-Frist erreicht ist (now >= expiresAt). */
export function isDraftExpired(draft: ReworkCaseDraft, now: number): boolean {
  return now >= draft.expiresAt
}

/** FieldFill defensiv uebernehmen - nur bekannte Zustaende, gegen Fremddaten. */
function sanitizeValues(v: unknown): Record<string, FieldFill> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, FieldFill> = {}
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const f = raw as { state?: unknown; value?: unknown; rows?: unknown }
    if (f?.state === 'confirmed' || f?.state === 'excluded') out[k] = { state: f.state }
    else if (f?.state === 'custom' && typeof f.value === 'string') out[k] = { state: 'custom', value: f.value }
    else if (f?.state === 'function') out[k] = { state: 'function', rows: sanitizeRows(f.rows) }
  }
  return out
}

/** Funktions-Zeilen strikt auf bekannte Felder reduzieren (namelose raus). Deckt BEIDE Zeilen-Typen ab:
 *  Medikament {name, dosierung?, kommentar?, pzn?} UND Arzt {name, rolle?, ort?, telefon?, arztnummer?}.
 *  DSGVO: striktes Allowlisting - NUR diese Felder gelangen in den Entwurf, keine Scan-Rohdaten. Da der
 *  Entwurf den functionKind je Zeile nicht kennt, behalten wir die Union aller bekannten Felder (harmlos:
 *  jede Registry liest nur ihre eigenen). */
function sanitizeRows(v: unknown): FunctionRow[] {
  if (!Array.isArray(v)) return []
  const out: FunctionRow[] = []
  for (const raw of v) {
    const r = raw as Record<string, unknown>
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue
    const row: Record<string, string> = { name: r.name }
    // Medikamentenplan-Felder
    if (typeof r.dosierung === 'string') row.dosierung = r.dosierung
    if (typeof r.kommentar === 'string') row.kommentar = r.kommentar
    if (typeof r.pzn === 'string') row.pzn = r.pzn
    // Aerzte-Felder
    if (r.rolle === 'Hausarzt' || r.rolle === 'Facharzt') row.rolle = r.rolle
    if (typeof r.ort === 'string') row.ort = r.ort
    if (typeof r.telefon === 'string') row.telefon = r.telefon
    if (typeof r.arztnummer === 'string') row.arztnummer = r.arztnummer
    // row enthaelt ausschliesslich erlaubte String-Felder (Allowlist oben) -> sichere Verengung auf die Union.
    out.push(row as unknown as FunctionRow)
  }
  return out
}

/** Nach einer ECHTEN Aenderung: Arbeitsstand uebernehmen, Sliding-Idle-Timer verlaengern. */
export function touchDraft(
  previous: ReworkCaseDraft | null,
  values: Record<string, FieldFill>,
  protocolId: string | null,
  ttlHours: number,
  now: number,
): ReworkCaseDraft {
  const ttl = clampTtlHours(ttlHours)
  const createdAt = previous && !isDraftExpired(previous, now) ? previous.createdAt : now
  return {
    version: 1,
    protocolId,
    createdAt,
    lastTouchedAt: now,
    expiresAt: now + ttl * HOUR_MS,
    ttlHours: ttl,
    values: sanitizeValues(values),
  }
}

/** Rohdaten aus dem Storage validieren; null bei ungueltiger/fremder Struktur. */
export function parseDraft(raw: unknown): ReworkCaseDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<ReworkCaseDraft>
  const createdAt = Number(o.createdAt)
  const lastTouchedAt = Number(o.lastTouchedAt)
  const expiresAt = Number(o.expiresAt)
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastTouchedAt) || !Number.isFinite(expiresAt)) return null
  return {
    version: 1,
    protocolId: typeof o.protocolId === 'string' ? o.protocolId : null,
    createdAt,
    lastTouchedAt,
    expiresAt,
    ttlHours: clampTtlHours(o.ttlHours),
    values: sanitizeValues(o.values),
  }
}
