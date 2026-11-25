// Sammlung teilen: Vorlagen, gespeicherte Abschnitte und Textbausteine in EINER Datei bzw. einem Link/QR
// (Maintainer 2026-11-19: schneller zwischen Kollegen tauschen, eigene Bausteine in den Online-Editor bringen).
//
// Format = die bekannte Sammlung: eine JSON-Liste der Einzel-Hüllen ('resqdocs-protocol' / 'resqdocs-block' /
// 'resqdocs-snippet'), in dieser Reihenfolge. Kompatibilität bewusst so gewählt:
//  - nur Vorlagen          -> exakt wie bisher (exportTemplates: eine Vorlage im Einzelformat, sonst Liste)
//  - genau ein Abschnitt oder Textbaustein ohne Vorlage -> dessen Einzelformat (lesen auch ältere Versionen)
//  - sonst eine gemischte Liste; die lesen erst Versionen mit diesem Format (ältere lehnen sie ganz ab - in
//    Ordnung laut Maintainer; ohne die neuen Teile ändert sich für den Empfänger nichts).
// Reine Serialisierung (node-testbar); den Import erkennt importRouter.detectAndParse.
import type { Container } from './model.ts'
import { exportTemplate, exportTemplates } from './templateIO.ts'
import { exportBlock } from './blockIO.ts'
import { exportSnippet, type SnippetPayload } from './snippetIO.ts'
import type { FeatureVersions } from './templateNeeds.ts'

export interface Collection {
  templates: readonly Container[]
  blocks: readonly Container[]
  snippets: readonly SnippetPayload[]
}

/** Gewählte Teile als Datei-/Link-Inhalt. Wirft, wenn nichts gewählt ist oder ein Textbaustein leer ist
 *  (die Gegenseite würde sonst die ganze Sammlung ablehnen). Mit `fv` tragen die Vorlagen ihren Vermerk
 *  (siehe exportTemplate). */
export function exportCollection(c: Collection, fv?: FeatureVersions): string {
  const n = c.templates.length + c.blocks.length + c.snippets.length
  if (!n) throw new Error('Nichts zum Teilen ausgewählt.')
  const leer = c.snippets.find((s) => !s.text.trim())
  if (leer) throw new Error(`Der Textbaustein „${leer.title || 'ohne Titel'}“ ist leer und kann nicht geteilt werden.`)
  if (!c.blocks.length && !c.snippets.length) return exportTemplates(c.templates, fv)
  if (n === 1) return c.blocks.length ? exportBlock(c.blocks[0]) : exportSnippet(c.snippets[0])
  const items = [
    ...c.templates.map((t) => JSON.parse(exportTemplate(t, fv))),
    ...c.blocks.map((b) => JSON.parse(exportBlock(b))),
    ...c.snippets.map((s) => JSON.parse(exportSnippet(s))),
  ]
  return JSON.stringify(items, null, 2)
}

/** Kurzbeschreibung für Meldungen: „2 Vorlagen, 1 gespeicherter Abschnitt, 3 Textbausteine“. */
export function describeCollection(c: { templates: { length: number }; blocks: { length: number }; snippets: { length: number } }): string {
  const teil = (n: number, eins: string, viele: string): string => (n ? `${n} ${n === 1 ? eins : viele}` : '')
  return [
    teil(c.templates.length, 'Vorlage', 'Vorlagen'),
    teil(c.blocks.length, 'gespeicherter Abschnitt', 'gespeicherte Abschnitte'),
    teil(c.snippets.length, 'Textbaustein', 'Textbausteine'),
  ].filter(Boolean).join(', ')
}
