// titleFormat.ts — was sich ändert, wenn „Titel im Protokolltext zeigen“ umgelegt wird.
//
// Ohne eigenes Titel-Format gilt der Überschriften-Standard („## “ davor, nichts dahinter). Für einen Abschnitt
// passt das, bei einem Feld ergäbe es „## Puls80“. Beim Einschalten bekommt ein Feld oder eine Funktion ohne
// eigenes Format deshalb eines, das zur Erklärung am Schalter passt: Titel in der Zeile des Werts -> „Puls: 80“,
// Titel in eigener Zeile (mehrzeiliges Feld, Funktion) -> nur der Titel. Der Standard im Renderer bleibt, wie er
// ist: Bestehende Vorlagen ändern ihren Protokolltext nicht, und ein schon gewähltes Format bleibt stehen.
import { DEFAULT_HEADING, type Heading, type Node } from '@resqdocs/protocol-core/model'

/** Steht der Titel in einer eigenen Zeile? Gleiche Regel wie der Renderer. */
export function titleOnOwnLine(n: Node): boolean {
  if (n.type === 'container' || n.type === 'function') return !n.titleInline
  return n.titleInline === false || (n.titleInline === undefined && !!n.multiline)
}

/** Änderung am Element für den Schalter „Titel im Protokolltext zeigen“. */
export function showTitlePatch(n: Node, on: boolean): { showTitle: boolean; heading?: Heading } {
  if (!on || n.type === 'container' || n.heading !== undefined) return { showTitle: on }
  return { showTitle: true, heading: { ...DEFAULT_HEADING, prefix: '', suffix: titleOnOwnLine(n) ? '' : ': ' } }
}
