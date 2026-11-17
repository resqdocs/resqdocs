// importPick.ts — Zustand der Import-Auswahl (ImportPickList): Startwerte und Umsetzung in ImportChoice.
// Rein, ohne Vue: im Node-Test prüfbar und von App und Online-Editor gleich genutzt.
import type { Container } from '@resqdocs/protocol-core/model'
import type { ImportChoice } from '@resqdocs/protocol-core/library'

export interface PickRow {
  /** übernehmen? */
  take: boolean
  /** Name, unter dem die Vorlage ankommt (vorausgefüllt mit ihrem Titel) */
  name: string
  /** nur bei Namensgleichheit: vorhandene Vorlage ersetzen (Standard: nein, als neue Vorlage) */
  overwrite: boolean
}

/**
 * Startwerte: Bei einer Sammlung ist NICHTS vorausgewählt - man wählt bewusst, was man übernehmen will
 * (Maintainer: „wirkt übersichtlicher“). Eine einzelne Vorlage ist gewählt (dort gibt es kein Häkchen).
 * Name = eigener Titel; nie vorausgewählt überschreiben.
 */
export function initialRows(trees: readonly Container[], blocked?: readonly (string | null)[]): PickRow[] {
  const single = trees.length === 1
  return trees.map((t, i) => ({ take: single && !blocked?.[i], name: t.title?.trim() ?? '', overwrite: false }))
}

/** Gewählte Zeilen in Entscheidungen für importWithChoices übersetzen (Reihenfolge der Sammlung). */
export function toChoices(trees: readonly Container[], rows: readonly PickRow[]): ImportChoice[] {
  return trees.flatMap((tree, i) => (rows[i]?.take ? [{ tree, name: rows[i].name, overwrite: rows[i].overwrite }] : []))
}
