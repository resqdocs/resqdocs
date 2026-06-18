// caseState.ts — reine, Vue-freie Laufzeit-Logik des Einsatz-Zustands.
//
// `caseState` ist der FLÜCHTIGE Zustand eines laufenden Einsatzes (Variablenwerte,
// Punkt-Übersteuerungen, aktivierte optionale Blöcke). Er wird NIE persistiert
// (kein LocalStorage/IndexedDB/Cache/Preferences) — siehe docs/data-flow.md.
//
// Bewusst frei von Vue und vom Renderer: so bleibt die Logik mit `node --test`
// prüfbar und der Renderer (packages/shared) bleibt die einzige Render-/visibleIf-
// Quelle (keine Duplizierung).
import type { ProtocolTemplate, Override } from '@resqdocs/protocol-core/renderer/render.mjs'

/** Pro Punkt-/Befund-id: Freitext, explizit {value,state} oder Listen-Einträge. */
export type PointValue = Override

/** Flüchtiger Einsatz-Zustand. Niemals persistieren. */
export interface CaseState {
  variableValues: Record<string, unknown>
  values: Record<string, PointValue>
  activeBlocks: string[]
}

/** Variablen-Defaults aus der Vorlage (überschreibbar im Einsatz). */
export function initVariableValues(protocol: ProtocolTemplate): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const v of protocol.variables ?? []) {
    if (v.default !== undefined) out[v.id] = v.default
  }
  return out
}

/** Frischer Einsatz-Zustand: Variablen-Defaults, keine Übersteuerungen, keine aktiven Blöcke. */
export function initCaseState(protocol: ProtocolTemplate): CaseState {
  return { variableValues: initVariableValues(protocol), values: {}, activeBlocks: [] }
}

export function isBlockActive(state: CaseState, blockId: string): boolean {
  return state.activeBlocks.includes(blockId)
}

/** Optionalen Block an-/abschalten; `on` weglassen = umschalten. Gibt neue id-Liste zurück. */
export function toggleActiveBlock(activeBlocks: string[], blockId: string, on?: boolean): string[] {
  const has = activeBlocks.includes(blockId)
  const next = on ?? !has
  if (next === has) return activeBlocks.slice()
  return next ? [...activeBlocks, blockId] : activeBlocks.filter((id) => id !== blockId)
}
