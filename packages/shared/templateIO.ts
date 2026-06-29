// Vorlage exportieren/importieren — reine Serialisierung + Validierung (node-testbar).
// Versioniertes JSON, damit ein anderes Geraet pruefen kann, ob es die Vorlage unterstuetzt.

import type { Container } from './model.ts'

export const PROTOCOL_SCHEMA = 'resqdocs-protocol'
export const PROTOCOL_VERSION = 1

export function exportTemplate(root: Container): string {
  return JSON.stringify({ schema: PROTOCOL_SCHEMA, version: PROTOCOL_VERSION, tree: root }, null, 2)
}

export type ParseResult = { ok: true; tree: Container } | { ok: false; error: string }

function isContainerLike(x: unknown): x is Container {
  return (
    !!x &&
    typeof x === 'object' &&
    (x as { type?: unknown }).type === 'container' &&
    typeof (x as { id?: unknown }).id === 'string' &&
    Array.isArray((x as { children?: unknown }).children)
  )
}

export function parseTemplate(json: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  const o = parsed as { schema?: unknown; version?: unknown; tree?: unknown }
  if (o?.schema !== PROTOCOL_SCHEMA) return { ok: false, error: 'Kein ResQDocs-Protokoll (schema fehlt oder falsch).' }
  if (typeof o.version !== 'number' || o.version > PROTOCOL_VERSION) {
    return { ok: false, error: `Version ${String(o.version)} wird von dieser App-Version nicht unterstuetzt.` }
  }
  if (!isContainerLike(o.tree)) return { ok: false, error: 'Vorlage enthaelt keinen gueltigen Container-Baum.' }
  return { ok: true, tree: o.tree }
}
