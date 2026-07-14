// Schema-erkennender Import-Router (node-testbar, KEINE Vue-/Repo-Imports). Eine ResQDocs-Import-Datei
// traegt ein `schema`-Feld ('resqdocs-protocol' | 'resqdocs-block' | 'resqdocs-snippet'); detectAndParse
// liest es und dispatcht auf den BESTEHENDEN Parser (Single Source of Truth - keine Doppel-Validierung).
// So kann jede Import-Stelle egal welchen Typ annehmen und ans richtige Ziel routen ("landet richtig,
// auch wenn an der falschen Stelle importiert"). PZN ist bewusst NICHT dabei: eigene Domaene, kein
// schema-Envelope, eigener gzip/Binaer-Pfad.

import type { Container } from './model.ts'
import { parseTemplate, PROTOCOL_SCHEMA } from './templateIO.ts'
import { parseBlock, BLOCK_SCHEMA } from './blockIO.ts'
import { parseSnippet, SNIPPET_SCHEMA, type SnippetPayload } from './snippetIO.ts'

export type DetectedKind = 'protocol' | 'block' | 'snippet'

export type DetectResult =
  | { ok: true; kind: 'protocol'; tree: Container }
  | { ok: true; kind: 'block'; tree: Container }
  | { ok: true; kind: 'snippet'; snippet: SnippetPayload }
  // Fehler: kind gesetzt, wenn das Schema ERKANNT wurde, der Parser aber ablehnt (z. B. Version zu neu)
  // -> die UI kann "Vorlage erkannt, aber ..." statt eines nackten Schema-Fehlers zeigen.
  | { ok: false; kind?: DetectedKind; error: string }

/** Nutzer-sichtbares Substantiv fuer den erkannten Typ (Meldung „Als <…> importiert"). */
export function kindNoun(k: DetectedKind): string {
  return k === 'protocol' ? 'Vorlage' : k === 'block' ? 'Baustein' : 'Snippet'
}

/** JSON am schema-Feld erkennen und mit dem passenden Parser parsen. Reicht tree/snippet 1:1 durch. */
export function detectAndParse(json: string): DetectResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  const schema = (parsed as { schema?: unknown } | null)?.schema
  if (typeof schema !== 'string') {
    return { ok: false, error: 'Keine ResQDocs-Datei erkannt (schema fehlt).' }
  }
  if (schema === PROTOCOL_SCHEMA) {
    const r = parseTemplate(json)
    return r.ok ? { ok: true, kind: 'protocol', tree: r.tree } : { ok: false, kind: 'protocol', error: r.error }
  }
  if (schema === BLOCK_SCHEMA) {
    const r = parseBlock(json)
    return r.ok ? { ok: true, kind: 'block', tree: r.tree } : { ok: false, kind: 'block', error: r.error }
  }
  if (schema === SNIPPET_SCHEMA) {
    const r = parseSnippet(json)
    return r.ok ? { ok: true, kind: 'snippet', snippet: r.snippet } : { ok: false, kind: 'snippet', error: r.error }
  }
  return { ok: false, error: `Unbekanntes Schema „${schema}“. Diese Datei kann hier nicht importiert werden.` }
}
