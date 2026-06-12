// Type declarations for the shared runtime layer (runtime.mjs).
// Single source for case context, visibleIf evaluation and block/point visibility —
// used by both the renderer and the app input form.

import type {
  ProtocolTemplate,
  ProtocolBlock,
  ProtocolPoint,
  Predicate,
  RenderCase,
  FindingState,
} from './render.mjs'

/** Vorab aufgelöster Zustand eines Punkts (für visibleIf über andere Punkte). */
export interface PointState {
  value: unknown
  state?: FindingState
  filled: boolean
}

/** Aufgelöster Einsatz-Kontext (Variablen, Grammatik, Punkt-Zustände). */
export interface RenderContext {
  vars: Record<string, unknown>
  grammar: Record<string, string>
  values: Record<string, unknown>
  activeBlocks: Set<string>
  points: Record<string, PointState>
  protocol: ProtocolTemplate
}

export function buildContext(protocol: ProtocolTemplate, caseState?: RenderCase): RenderContext
export function evalPredicate(predicate: Predicate | undefined, ctx: RenderContext): boolean

/** Platzhalter ({{var:id}}, de-gender) auflösen; Unbekanntes bleibt unverändert. */
export function resolveText(input: string, ctx: RenderContext): string
/** Wie resolveText, lässt Nicht-Strings unverändert durch. */
export function resolveMaybeText<T>(input: T, ctx: RenderContext): T
export function isBlockVisible(block: ProtocolBlock, ctx: RenderContext): boolean
export function isPointVisible(point: ProtocolPoint, ctx: RenderContext): boolean
export function getVisibleBlocks(protocol: ProtocolTemplate, ctx: RenderContext): ProtocolBlock[]
export function getVisiblePoints(block: ProtocolBlock, ctx: RenderContext): ProtocolPoint[]
export function listEntries(point: ProtocolPoint, values: Record<string, unknown>): string[]
