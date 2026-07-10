// "Abweichung vom Standard" zaehlen (Einsatz): wie viele Felder/Abschnitte im Teilbaum NICHT auf
// dem Default stehen. Fuer die "N geaendert"-Vorschau + Default-eingeklappt (creative B,
// docs/rework/einsatz-hierarchy.md). Rein -> node-getestet.
import type { Node, FieldFill } from './model.ts'
import { DEFAULT_FILL } from './fill.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

export function countDeviations(node: Node, values: Record<string, FieldFill>): number {
  if (node.type === 'field') {
    return (values[node.id] ?? DEFAULT_FILL).state === 'confirmed' ? 0 : 1
  }
  // Funktion (Blatt, kein children): „hat erfasste Daten" = EINE Quelle (Registry hasData, filtert
  // namelose Zeilen) -> deckt sich mit der Ausgabe (renderBody), kein Badge/Render-Widerspruch.
  if (node.type === 'function') {
    const f = values[node.id]
    if (f?.state === 'function' && (f.status === 'excluded' || f.status === 'custom')) return 1 // nicht erhoben ODER Freitext = bewusste Abweichung
    return FUNCTION_REGISTRY[node.functionKind]?.hasData(f) ? 1 : 0
  }
  // Container: als "nicht erhoben" markiert = 1 Abweichung (Kinder entfallen ohnehin); sonst summieren.
  if (node.excludable && values[node.id]?.state === 'excluded') return 1
  return node.children.reduce((sum, child) => sum + countDeviations(child, values), 0)
}
