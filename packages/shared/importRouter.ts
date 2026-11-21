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

export type DetectedKind = 'protocol' | 'block' | 'snippet' | 'bundle'

export type DetectResult =
  | { ok: true; kind: 'protocol'; tree: Container }
  | { ok: true; kind: 'block'; tree: Container }
  | { ok: true; kind: 'snippet'; snippet: SnippetPayload }
  // Sammlung: JSON-Liste von Einzel-Hüllen - Vorlagen, seit collectionIO auch gespeicherte Abschnitte und
  // Textbausteine (so exportieren „Alle“ im Online-Editor und das Teilen mehrerer Teile in der App)
  | { ok: true; kind: 'bundle'; trees: Container[]; blocks: Container[]; snippets: SnippetPayload[] }
  // Fehler: kind gesetzt, wenn das Schema ERKANNT wurde, der Parser aber ablehnt (z. B. Version zu neu)
  // -> die UI kann "Vorlage erkannt, aber ..." statt eines nackten Schema-Fehlers zeigen.
  | { ok: false; kind?: DetectedKind; error: string }

/** Nutzer-sichtbares Substantiv fuer den erkannten Typ (Meldung „Als <…> importiert"). */
export function kindNoun(k: DetectedKind): string {
  return k === 'protocol' ? 'Vorlage' : k === 'block' ? 'Gespeicherter Abschnitt' : k === 'bundle' ? 'Sammlung' : 'Textbaustein'
}

/** JSON am schema-Feld erkennen und mit dem passenden Parser parsen. Reicht tree/snippet 1:1 durch. */
export function detectAndParse(json: string): DetectResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  if (Array.isArray(parsed)) return parseBundle(parsed)
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

/**
 * Sammlung: jeden Eintrag einzeln mit dem bestehenden Parser seiner Art prüfen (Vorlage, gespeicherter Abschnitt,
 * Textbaustein). Alles oder nichts - ein fehlerhafter Eintrag wird mit seiner Position gemeldet, statt still nur
 * einen Teil zu übernehmen.
 */
function parseBundle(items: unknown[]): DetectResult {
  if (!items.length) return { ok: false, kind: 'bundle', error: 'Die Sammlung ist leer.' }
  const trees: Container[] = []
  const blocks: Container[] = []
  const snippets: SnippetPayload[] = []
  for (const [i, item] of items.entries()) {
    const pos = `Eintrag ${i + 1} von ${items.length}`
    const schema = (item as { schema?: unknown } | null)?.schema
    const json = JSON.stringify(item)
    if (schema === PROTOCOL_SCHEMA) {
      const r = parseTemplate(json)
      if (!r.ok) return { ok: false, kind: 'bundle', error: `${pos} (Vorlage): ${r.error}` }
      trees.push(r.tree)
    } else if (schema === BLOCK_SCHEMA) {
      const r = parseBlock(json)
      if (!r.ok) return { ok: false, kind: 'bundle', error: `${pos} (gespeicherter Abschnitt): ${r.error}` }
      blocks.push(r.tree)
    } else if (schema === SNIPPET_SCHEMA) {
      const r = parseSnippet(json)
      if (!r.ok) return { ok: false, kind: 'bundle', error: `${pos} (Textbaustein): ${r.error}` }
      snippets.push(r.snippet)
    } else {
      return { ok: false, kind: 'bundle', error: `${pos} ist keine ResQDocs-Vorlage, kein gespeicherter Abschnitt und kein Textbaustein.` }
    }
  }
  return { ok: true, kind: 'bundle', trees, blocks, snippets }
}
