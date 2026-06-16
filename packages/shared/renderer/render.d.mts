// Type declarations for the dependency-free protocol renderer (render.mjs).
// The renderer itself stays plain, tested JS; these types make it safe to use
// from the TypeScript app. Mirrors SCHEMA.md (blocks → points, variables).

export type FindingState = 'normal' | 'abnormal'
export type VariableType = 'select' | 'boolean' | 'text' | 'number'

/** Eine Medikations-Zeile des medikamente-Elements (#146) - nur Einsatz-Zustand. */
export interface MedikamenteRow {
  name: string
  dosierung?: string
  kommentar?: string
  /**
   * Optionale Roh-PZN „im Hintergrund" (#184): bleibt am Eintrag hinterlegt, auch
   * wenn der Nutzer den Namen überschreibt. NUR für den bewussten Einzel-Transfer
   * in die PZN-Bibliothek; rein additiv, vom Renderer ignoriert (keine Linkage,
   * verlässt das Einsatz-/Protokoll-Datenmodell nur durch eine Nutzerhandlung).
   */
  pzn?: string
}

/** Per-id override: free text, explicit value/state, replacement list entries, or medication rows. */
export type Override =
  | string
  | string[]
  | MedikamenteRow[]
  | { value?: string; state?: FindingState }
  | { excluded: true } // dreistufig (#43 Felder, #71 Befunde): nicht erhoben

export type ProtocolValues = Record<string, Override>
export type VariableValues = Record<string, unknown>

export interface ProtocolVariable {
  id: string
  label?: string
  type: VariableType
  options?: Array<{ value: string; label: string }>
  default?: unknown
  grammar?: 'de-gender'
}

/** Declarative, safe visibility predicate over variables and other points. */
export interface Predicate {
  var?: string
  point?: string
  eq?: unknown
  in?: unknown[]
  truthy?: boolean
  filled?: boolean
  state?: FindingState
  all?: Predicate[]
  any?: Predicate[]
  not?: Predicate
}

export interface ProtocolPoint {
  type: 'field' | 'finding' | 'findingGroup' | 'list' | 'text' | 'medikamente'
  id?: string
  label?: string
  visibleIf?: Predicate
  [key: string]: unknown
}

export interface ProtocolBlock {
  id: string
  title: string
  optional?: boolean
  visibleIf?: Predicate
  snippetSlot?: string
  points: ProtocolPoint[]
}

export interface ProtocolTemplate {
  schemaVersion?: string
  id?: string
  title?: string
  /** Schreibgeschützte Beispiel-Vorlage (#example): nicht editierbar, nur duplizierbar. */
  example?: boolean
  lang?: string
  meta?: { source?: string }
  variables?: ProtocolVariable[]
  blocks: ProtocolBlock[]
}

/** Flüchtiger Einsatz-Zustand (nie persistiert). */
export interface RenderCase {
  variableValues?: VariableValues
  values?: ProtocolValues
  activeBlocks?: string[]
}

/** Überschriftenmuster der Blockkopfzeilen (#68); Teilangaben werden mit Defaults ergänzt. */
export interface HeadingOptions {
  pattern?: string
  fill?: string
  width?: number
}
export const DEFAULT_HEADING: Readonly<Required<HeadingOptions>>
export function render(protocol: ProtocolTemplate, caseState?: RenderCase, options?: { heading?: HeadingOptions }): string

declare const _default: typeof render
export default _default
