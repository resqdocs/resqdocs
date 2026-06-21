// Type declarations for the pure protocol-creator domain logic (creator.mjs).
// Vue-independent, dependency-free. Reuses the S1 types from the renderer.

import type {
  ProtocolTemplate,
  ProtocolBlock,
  ProtocolPoint,
  ProtocolVariable,
  Predicate,
} from '../renderer/render.mjs'

export type Protocol = ProtocolTemplate
export type Block = ProtocolBlock
export type Point = ProtocolPoint
export type Variable = ProtocolVariable
export type { Predicate }

export type PointType = 'field' | 'finding' | 'findingGroup' | 'list' | 'text' | 'medikamente'
export type VariableType = 'select' | 'boolean' | 'text' | 'number'
export type SimpleOp = 'eq' | 'in' | 'truthy' | 'filled' | 'state'

export const SCHEMA_VERSION: string
export const POINT_TYPES: PointType[]
export const VARIABLE_TYPES: VariableType[]
export const SIMPLE_OPS: SimpleOp[]

/**
 * Feldscharfer Validierungs-Befund (#2b): trägt zusätzlich zum Text den
 * bekannten Ort (Block/Punkt/Finding/Feld). Optionale Parallel-Spur zu
 * errors/warnings — diese Strings bleiben unverändert.
 */
export interface ValidationIssue {
  message: string
  severity: 'error' | 'warning'
  blockId?: string
  pointId?: string
  findingId?: string
  field?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  /** Additiv (#2b): feldscharfe Befunde parallel zu errors/warnings. */
  issues?: ValidationIssue[]
}

export interface VariableReference {
  kind: 'visibleIf' | 'placeholder'
  where: string
}

export interface SimpleVisibleIfInput {
  source: 'var' | 'point'
  id: string
  op: SimpleOp
  value?: unknown
}

export type ImportResult =
  | { ok: true; protocol: Protocol; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] }

// IDs
export function slugify(text: unknown): string
export function createUniqueId(base: string, existingIds: Set<string> | string[]): string
export function collectProtocolIds(protocol: Protocol): Set<string>

// Protocol
export function createProtocol(input?: Partial<Protocol>): Protocol
export function duplicateProtocol(protocol: Protocol): Protocol
export function renameProtocol(protocol: Protocol, title: string): Protocol

// Block
export function addBlock(protocol: Protocol, input?: Partial<Block>): Protocol
export function updateBlock(protocol: Protocol, blockId: string, patch: Partial<Block>): Protocol
export function removeBlock(protocol: Protocol, blockId: string): Protocol
export function duplicateBlock(protocol: Protocol, blockId: string): Protocol
/** Block bzw. Punkt um eine Position verschieben (#46); No-op an den Raendern. */
export function moveBlock(protocol: Protocol, blockId: string, direction: 'up' | 'down'): Protocol
export function movePoint(protocol: Protocol, pointId: string, direction: 'up' | 'down'): Protocol
/** Externen Block als Kopie anhängen (frische IDs, internes visibleIf-Remap). */
export function insertBlock(protocol: Protocol, block: Block): Protocol
/** Fehlende Punkt-IDs nachruesten (#66); vorhandene bleiben stabil. */
export function ensureProtocolPointIds(protocol: Protocol): Protocol

// Point
export function addPoint(protocol: Protocol, blockId: string, input: Partial<Point> & { type?: PointType }): Protocol
export function updatePoint(protocol: Protocol, pointId: string, patch: Partial<Point>): Protocol
export function removePoint(protocol: Protocol, pointId: string): Protocol
export function duplicatePoint(protocol: Protocol, pointId: string): Protocol

// Variable
export function addVariable(protocol: Protocol, input: Partial<Variable> & { type?: VariableType }): Protocol
export function updateVariable(protocol: Protocol, variableId: string, patch: Partial<Variable>): Protocol
export function removeVariable(protocol: Protocol, variableId: string): Protocol
export function findVariableReferences(protocol: Protocol, variableId: string): VariableReference[]

// Simple visibleIf
export function isSimpleVisibleIf(predicate: Predicate | undefined | null): boolean
export function createSimpleVisibleIf(input: SimpleVisibleIfInput): Predicate

// Validation + export/import preparation
export function assertValidProtocolDraft(protocol: Protocol): ValidationResult
export function exportProtocol(protocol: Protocol): string
export function parseImport(jsonString: string): ImportResult
