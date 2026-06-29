// Provide/Inject-Vertrag fuer den Editor (siehe docs/rework/container-impl.md):
// Der Editor-Root stellt eine zentrale API bereit; jede (rekursive) Node ruft eine reine
// Creator-Op, der Root ersetzt den Baum. Kein Prop-Drilling, reine .ts-Ops = Single Source of Truth.

import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { inject } from 'vue'
import type { Container, FunctionKind } from '@resqdocs/protocol-core/model'

/** Ziel-Container fuer den „Verschieben nach"-Picker. */
export interface MoveTarget {
  id: string
  label: string
  depth: number
  /** true = aktueller Eltern-Container (im Picker als „(aktuell)" inaktiv). */
  current: boolean
}

export interface TreeEditorApi {
  selectedId: Ref<string | null>
  /** Aktive Editor-Vorlage (Wurzel) - read-only, fuer Sitemap-/Struktur-Ansichten (Verschieben-nach). */
  root: ComputedRef<Container>
  isSelected(id: string): boolean
  select(id: string): void
  /** Aktive Vorlage wechseln: setzt editorActiveId UND selectedId auf deren Wurzel. */
  selectProtocol(id: string): void
  update(id: string, patch: Record<string, unknown>): void
  addChild(parentId: string, kind: 'container' | 'field' | 'function', functionKind?: FunctionKind): void
  remove(id: string): void
  move(childId: string, delta: number): void
  /** Fliessendes „Hoch": Swap mit Vorgaenger, am oberen Container-Rand automatisch davor ausruecken. */
  moveUp(id: string): void
  /** Fliessendes „Runter": Swap mit Nachfolger, am unteren Container-Rand automatisch dahinter ausruecken. */
  moveDown(id: string): void
  /** Einruecken: childId wird letztes Kind seines Container-Vorgaengers. */
  indent(id: string): void
  /** Ausruecken: childId wird Geschwister hinter seinem Eltern-Container. */
  outdent(id: string): void
  /** childId in targetParentId verschieben (an Position index, sonst ans Ende). */
  reparent(id: string, targetParentId: string, index?: number): void
  canMoveUp(id: string): boolean
  canMoveDown(id: string): boolean
  canIndent(id: string): boolean
  canOutdent(id: string): boolean
  /** Zulaessige Ziel-Container (ohne eigenen Teilbaum + ohne Felder) fuer den Picker. */
  moveTargets(id: string): MoveTarget[]
}

export const TREE_EDITOR: InjectionKey<TreeEditorApi> = Symbol('treeEditor')

export function useTreeEditor(): TreeEditorApi {
  const api = inject(TREE_EDITOR)
  if (!api) throw new Error('useTreeEditor(): kein <EditorView>-Provider im Baum')
  return api
}
