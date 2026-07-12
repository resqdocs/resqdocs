// Pflichtfeld-Logik (Einsatz): welche Blaetter sind Pflicht + „noch offen"? Rein additiv, kein
// Submit-Gate - „Pflicht" heisst „darf nicht still verschwinden" (der −-Zustand entfaellt in der UI),
// NICHT „ein Wert wird erzwungen". „Erfuellt" = das Blatt liefert nicht-leeren Ausgabetext.
// Rein -> node-getestet. Renderer/Modell-Ausgabe bleiben unveraendert.
import type { Node, Field, FunctionNode, FieldFill } from './model.ts'
import { DEFAULT_FILL, isFilled } from './fill.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

/** Liefert die Funktion nicht-leeren Ausgabetext? Zeilen (hasData) ODER Freitext (custom) ODER
 *  Standardtext (node.default) - deckt sich mit renderBody, damit Badge und Ausgabe nie widersprechen. */
export function isFunctionFilled(node: FunctionNode, fill: FieldFill | undefined): boolean {
  const status = fill?.state === 'function' ? (fill.status ?? 'confirmed') : 'confirmed'
  if (status === 'excluded') return false // bei required per UI verhindert; defensiv: nicht erfuellt
  if (status === 'custom') return fill?.state === 'function' && (fill.text ?? '').trim() !== ''
  const hasData = FUNCTION_REGISTRY[node.functionKind]?.hasData(fill) ?? false
  return hasData || (node.default ?? '').trim() !== ''
}

/** Ist dieses Blatt ein OFFENES Pflichtfeld? (required gesetzt UND liefert keinen Wert.) */
export function isRequiredOpen(node: Field | FunctionNode, fill: FieldFill | undefined): boolean {
  if (!node.required) return false
  if (node.type === 'field') return !isFilled(node, fill ?? DEFAULT_FILL)
  return !isFunctionFilled(node, fill)
}

/** Anzahl offener Pflichtfelder im Teilbaum (Vollstaendigkeits-Anzeige „N Pflichtfelder offen").
 *  Eine als „nicht erhoben" markierte Sektion entfaellt in der Ausgabe -> ihre Kinder zaehlen nicht. */
export function countOpenRequired(node: Node, values: Record<string, FieldFill>): number {
  if (node.type === 'field' || node.type === 'function') return isRequiredOpen(node, values[node.id]) ? 1 : 0
  if (node.excludable && values[node.id]?.state === 'excluded') return 0
  return node.children.reduce((sum, child) => sum + countOpenRequired(child, values), 0)
}
