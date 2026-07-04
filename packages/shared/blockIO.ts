// Baustein (Block) exportieren/importieren - reine Serialisierung + Validierung (node-testbar). Eigenes
// schema-Tag 'resqdocs-block' (getrennt von 'resqdocs-protocol'): so unterscheidet der Import eine
// Baustein-Datei sauber von einer Vorlagen-Datei - parseTemplate lehnt eine Block-Datei ab und parseBlock
// eine Vorlagen-Datei. Ein Baustein IST strukturell ein v1-Container-Baum; die Datei traegt ihn als `tree`
// (dasselbe Format wie templateIO, nur das Schema unterscheidet). Versioniert, damit ein anderes Geraet
// pruefen kann, ob es den Baustein unterstuetzt.

import type { Container } from './model.ts'

export const BLOCK_SCHEMA = 'resqdocs-block'
export const BLOCK_VERSION = 1

export function exportBlock(block: Container): string {
  return JSON.stringify({ schema: BLOCK_SCHEMA, version: BLOCK_VERSION, tree: block }, null, 2)
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

export function parseBlock(json: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  const o = parsed as { schema?: unknown; version?: unknown; tree?: unknown }
  if (o?.schema !== BLOCK_SCHEMA) return { ok: false, error: 'Kein ResQDocs-Baustein (schema fehlt oder falsch).' }
  if (typeof o.version !== 'number' || o.version > BLOCK_VERSION) {
    return { ok: false, error: `Version ${String(o.version)} wird von dieser App-Version nicht unterstuetzt.` }
  }
  if (!isContainerLike(o.tree)) return { ok: false, error: 'Baustein enthaelt keinen gueltigen Container-Baum.' }
  return { ok: true, tree: o.tree }
}
