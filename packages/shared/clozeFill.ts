// Lückentext ausfüllen: Zustand einer Lücke und die Reihenfolge beim Durchtippen. Rein, node-testbar.

import type { FieldFill } from './model.ts'
import type { GapNode } from './cloze.ts'
import { fillValue, functionStatus } from './fill.ts'
import { isFunctionFilled } from './required.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

/** offen = noch kein Wert · default = der Standardwert der Vorlage steht unberührt · answered = im
 *  Einsatz beantwortet · excluded = bewusst „nicht erhoben". */
export type GapState = 'open' | 'default' | 'answered' | 'excluded'

export function gapState(node: GapNode, fill: FieldFill | undefined): GapState {
  if (node.type === 'field') {
    const value = fillValue(node, fill)
    if (value === null) return fill?.state === 'excluded' || node.defaultExcluded ? 'excluded' : 'open'
    if (value.trim() === '') return 'open'
    return fill?.state === 'custom' ? 'answered' : 'default'
  }
  const status = functionStatus(node, fill)
  if (status === 'excluded') return node.required ? 'open' : 'excluded'
  if (!isFunctionFilled(node, fill)) return 'open'
  if (status === 'custom') return 'answered'
  return FUNCTION_REGISTRY[node.functionKind]?.hasData(fill) ? 'answered' : 'default'
}

/** Wird die Lücke beim Durchtippen abgefragt? Jede, der Reihe nach - Auswahl wie Freitext, mit oder ohne
 *  Standardwert (Maintainer 2026-11-20): ein Standard, den niemand ansieht, landet sonst ungeprüft in der
 *  Dokumentation, und eine Auswahl-Lücke hat immer einen (ihre erste Antwort). „Weiter“ übernimmt ihn mit
 *  einem Tipp. Was in diesem Durchgang schon dran war (`seen`), kommt nicht noch einmal - man bleibt nie an
 *  einer Lücke hängen und kann jede weiterhin direkt antippen. Quellen: docs/sources.md (Lückentext). */
export function needsAsking(seen: boolean): boolean {
  return !seen
}

/** Stelle der nächsten abzufragenden Lücke NACH `from` (-1 = von vorn). -1 = keine mehr. */
export function nextAsking(states: readonly GapState[], seen: readonly boolean[], from: number): number {
  for (let i = from + 1; i < states.length; i++) if (needsAsking(!!seen[i])) return i
  return -1
}

/** Ein Satz zum Stand eines Lückentexts - für die Karte im Formular und das Ende des Durchtippens. */
export function clozeSummary(total: number, open: number, requiredOpen: number): string {
  if (total === 0) return 'Dieser Lückentext hat keine Lücken.'
  if (requiredOpen > 0) return `${requiredOpen} ${requiredOpen === 1 ? 'Pflicht-Lücke' : 'Pflicht-Lücken'} noch offen`
  if (open > 0) return `${open} ${open === 1 ? 'Lücke' : 'Lücken'} noch offen`
  return 'Alle Lücken ausgefüllt'
}
