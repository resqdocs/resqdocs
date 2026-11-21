// importPick.ts — Zustand der Import-Auswahl (ImportPickList): Startwerte und Umsetzung in Entscheidungen.
// Rein, ohne Vue: im Node-Test prüfbar und von App und Online-Editor gleich genutzt. Gilt für Vorlagen,
// gespeicherte Abschnitte und Textbausteine (Sammlung, collectionIO).
import type { Container, Node } from '@resqdocs/protocol-core/model'
import type { ImportChoice } from '@resqdocs/protocol-core/library'
import type { NamedChoice } from '@resqdocs/protocol-core/namedImport'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'

export interface PickRow {
  /** übernehmen? */
  take: boolean
  /** Name, unter dem der Eintrag ankommt (vorausgefüllt mit seinem Titel) */
  name: string
  /** nur bei Namensgleichheit: vorhandenen Eintrag ersetzen (Standard: nein, kommt neu dazu) */
  overwrite: boolean
}

/** Art der Einträge einer Liste - steuert nur die Wörter in der Oberfläche. */
export type PickArt = 'vorlage' | 'abschnitt' | 'textbaustein'
/** Eine Zeile der Liste: Titel und eine kurze Angabe zum Umfang. */
export interface PickItem {
  title?: string
  detail: string
}

const countElements = (n: Node): number => (n.type === 'container' ? n.children.reduce((s, c) => s + 1 + countElements(c), 0) : 0)
export function treeItems(trees: readonly Container[]): PickItem[] {
  return trees.map((t) => {
    const n = countElements(t)
    return { title: t.title, detail: `${n} ${n === 1 ? 'Element' : 'Elemente'}` }
  })
}
export function snippetItems(snippets: readonly SnippetPayload[]): PickItem[] {
  return snippets.map((s) => ({ title: s.title, detail: `${s.text.length} Zeichen` }))
}

/**
 * Startwerte: Bei einer Sammlung ist NICHTS vorausgewählt - man wählt bewusst, was man übernehmen will
 * (Maintainer: „wirkt übersichtlicher“). Ein einzelner Eintrag ist gewählt (dort gibt es kein Häkchen).
 * Name = eigener Titel; nie vorausgewählt überschreiben. `single` überschreibt die Zählung (gemischte Sammlung:
 * einzeln nur, wenn sie insgesamt genau einen Eintrag hat).
 */
export function initialRows(items: readonly { title?: string }[], blocked?: readonly (string | null)[], single = items.length === 1): PickRow[] {
  return items.map((t, i) => ({ take: single && !blocked?.[i], name: t.title?.trim() ?? '', overwrite: false }))
}

/** Gewählte Zeilen in Entscheidungen für importWithChoices übersetzen (Reihenfolge der Sammlung). */
export function toChoices(trees: readonly Container[], rows: readonly PickRow[]): ImportChoice[] {
  return trees.flatMap((tree, i) => (rows[i]?.take ? [{ tree, name: rows[i].name, overwrite: rows[i].overwrite }] : []))
}
/** Dasselbe für gespeicherte Abschnitte und Textbausteine (planNamedImport). */
export function toNamedChoices<T>(items: readonly T[], rows: readonly PickRow[]): NamedChoice<T>[] {
  return items.flatMap((item, i) => (rows[i]?.take ? [{ item, name: rows[i].name, overwrite: rows[i].overwrite }] : []))
}

/** Auswahl einer ganzen Sammlung, je Art eine Liste. */
export interface CollectionRows {
  trees: PickRow[]
  blocks: PickRow[]
  snippets: PickRow[]
}
export interface CollectionContent {
  trees: readonly Container[]
  blocks: readonly Container[]
  snippets: readonly SnippetPayload[]
}
export function initialCollectionRows(c: CollectionContent, blocked?: { trees?: readonly (string | null)[]; blocks?: readonly (string | null)[] }): CollectionRows {
  const single = c.trees.length + c.blocks.length + c.snippets.length === 1
  return {
    trees: initialRows(c.trees, blocked?.trees, single),
    blocks: initialRows(c.blocks, blocked?.blocks, single),
    snippets: initialRows(c.snippets, undefined, single),
  }
}
export function countTaken(r: CollectionRows): { trees: number; blocks: number; snippets: number; total: number } {
  const n = (rows: PickRow[]): number => rows.filter((x) => x.take).length
  const trees = n(r.trees), blocks = n(r.blocks), snippets = n(r.snippets)
  return { trees, blocks, snippets, total: trees + blocks + snippets }
}
