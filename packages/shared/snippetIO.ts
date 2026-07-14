// Snippet (Textbaustein) exportieren/importieren - reine Serialisierung + Validierung (node-testbar).
// Eigenes schema-Tag 'resqdocs-snippet' (getrennt von 'resqdocs-block'/'resqdocs-protocol'): so
// unterscheidet der Import eine Snippet-Datei sauber von Baustein-/Vorlagen-Dateien - parseSnippet lehnt
// eine Block-/Vorlagen-Datei ab und umgekehrt. Ein Snippet ist ein reiner Text mit Titel (keine Struktur,
// keine ids/Zeitstempel in der Datei - die vergibt der Importeur frisch). Versioniert, damit ein anderes
// Geraet pruefen kann, ob es das Format unterstuetzt. NUR neutraler Text (keine Patientendaten).

export const SNIPPET_SCHEMA = 'resqdocs-snippet'
export const SNIPPET_VERSION = 1

/** Nutzdaten eines Snippets in der Datei: nur Titel + Text (kein id/createdAt/updatedAt). */
export interface SnippetPayload {
  title: string
  text: string
}

export function exportSnippet(s: SnippetPayload): string {
  return JSON.stringify({ schema: SNIPPET_SCHEMA, version: SNIPPET_VERSION, snippet: { title: s.title, text: s.text } }, null, 2)
}

export type ParseSnippetResult = { ok: true; snippet: SnippetPayload } | { ok: false; error: string }

export function parseSnippet(json: string): ParseSnippetResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Kein gueltiges JSON.' }
  }
  const o = parsed as { schema?: unknown; version?: unknown; snippet?: unknown }
  if (o?.schema !== SNIPPET_SCHEMA) return { ok: false, error: 'Kein ResQDocs-Snippet (schema fehlt oder falsch).' }
  if (typeof o.version !== 'number' || o.version > SNIPPET_VERSION) {
    return { ok: false, error: `Version ${String(o.version)} wird von dieser App-Version nicht unterstuetzt.` }
  }
  const s = o.snippet as { title?: unknown; text?: unknown } | null
  if (!s || typeof s !== 'object' || typeof s.text !== 'string') {
    return { ok: false, error: 'Snippet enthaelt keinen gueltigen Text.' }
  }
  if (s.text.trim() === '') return { ok: false, error: 'Snippet-Text ist leer.' }
  const title = typeof s.title === 'string' ? s.title : ''
  return { ok: true, snippet: { title, text: s.text } }
}
