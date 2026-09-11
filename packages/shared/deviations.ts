// "Abweichung vom Standard" zaehlen (Einsatz): wie viele Felder/Abschnitte im Teilbaum NICHT auf
// dem Default stehen. Fuer die "N geaendert"-Vorschau + Default-eingeklappt (creative B,
// docs/rework/einsatz-hierarchy.md). Rein -> node-getestet.
import type { Node, FieldFill } from './model.ts'
import { defaultFill, isDefaultFill } from './fill.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

export function countDeviations(node: Node, values: Record<string, FieldFill>): number {
  if (node.type === 'field') {
    // Gezaehlt wird die Abweichung vom AUSGANGSZUSTAND, nicht „ist es bestaetigt". Bei UNO Reverse
    // (defaultExcluded) ist „nicht erhoben" der Normalfall und zaehlt 0; das bewusste EINSCHALTEN
    // ist dort die Abweichung. Sonst zaehlte ein Protokoll mit zehn solchen Feldern zehn
    // Abweichungen, ohne dass der Anwender etwas getan haette.
    return isDefaultFill(node, values[node.id]) ? 0 : 1
  }
  // Funktion (Blatt, kein children): „hat erfasste Daten" = EINE Quelle (Registry hasData, filtert
  // namelose Zeilen) -> deckt sich mit der Ausgabe (renderBody), kein Badge/Render-Widerspruch.
  if (node.type === 'function') {
    const f = values[node.id]
    if (f?.state === 'function' && (f.status === 'excluded' || f.status === 'custom')) return 1 // nicht erhoben ODER Freitext = bewusste Abweichung
    return FUNCTION_REGISTRY[node.functionKind]?.hasData(f) ? 1 : 0
  }
  // Container: vom Ausgangszustand abweichend markiert = 1 Abweichung (die Kinder entfallen dann
  // ohnehin bzw. wurden bewusst zugeschaltet); sonst summieren.
  if (node.excludable && !isDefaultFill(node, values[node.id])) return 1
  // Steht der Container in seinem Ausgangszustand „nicht erhoben", entfaellt er samt Kindern - die
  // koennen dann keine Abweichung beitragen. Bewusst ueber den ZUSTAND, nicht ueber „kein Eintrag":
  // toggleExcluded schreibt beim Ausschalten immer einen expliziten Eintrag, ein Test auf Abwesenheit
  // griffe nach dem ersten Aus- und Wiedereinschalten nie mehr.
  if (node.excludable && (values[node.id] ?? defaultFill(node)).state === 'excluded') return 0
  return node.children.reduce((sum, child) => sum + countDeviations(child, values), 0)
}
