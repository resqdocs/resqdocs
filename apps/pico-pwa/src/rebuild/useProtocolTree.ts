// Geteilter Protokoll-Zustand (Rework). Eine BIBLIOTHEK mehrerer Definitionen (Container-Baeume);
// je Container = eine Vorlage (Wurzel-id = Vorlagen-id, root.title = Name). Reine, immutable
// Bibliotheks-/Creator-Ops; das ref-Array wird als Ganzes neu zugewiesen -> Reaktivitaet ueber beide Tabs.
//
// GETRENNTE aktive Vorlage je Tab (Maintainer-Entscheidung): editorActiveId (Editor SCHREIBT) und
// einsatzActiveId (Einsatz LIEST) - ein Editor-Wechsel schaltet den Einsatz nicht ungewollt um.
//
// Die DEFINITIONEN leben hier; die im Einsatz eingegebenen WERTE sind separat + fluechtig
// (useCaseValues, per id). Persistenz der Bibliothek folgt in Slice 2 (eigene Storage-Schicht).

import { ref, computed } from 'vue'
import type { Container, Node } from '@resqdocs/protocol-core/model'
import { createContainer, createField, createFunction, addChild as addChildOp, updateNode, removeNode, moveChild, moveUp as moveUpOp, moveDown as moveDownOp, reparent as reparentOp, indentChild, outdentChild } from '@resqdocs/protocol-core/creator'
import type { FunctionKind } from '@resqdocs/protocol-core/model'
import {
  collidesId,
  duplicateProtocol,
  renameProtocol as renameOp,
  removeProtocol as removeOp,
  moveProtocol as moveProtocolOp,
  importProtocol as importProtocolOp,
  overwriteProtocol as overwriteProtocolOp,
  protocolExists as protocolExistsOp,
} from '@resqdocs/protocol-core/library'

const protocols = ref<Container[]>([createContainer('protokoll')])
const editorActiveId = ref<string>(protocols.value[0].id)
const einsatzActiveId = ref<string>(protocols.value[0].id)
let counter = 0

function nextId(): string {
  let id = ''
  do {
    id = `n${++counter}`
  } while (collidesId(protocols.value, id)) // baumuebergreifend kollisionsfrei
  return id
}

// aktive Vorlage je Tab (Fallback: erste - protocols ist nie leer)
const editorRoot = computed<Container>(() => protocols.value.find((p) => p.id === editorActiveId.value) ?? protocols.value[0])
const einsatzRoot = computed<Container>(() => protocols.value.find((p) => p.id === einsatzActiveId.value) ?? protocols.value[0])

// die EDITOR-aktive Vorlage immutabel ersetzen (Array neu -> computed re-evaluiert)
function mutateEditor(fn: (tree: Container) => Container): void {
  const id = editorRoot.value.id
  protocols.value = protocols.value.map((p) => (p.id === id ? fn(p) : p))
}

export function useProtocolTree() {
  return {
    root: editorRoot, // Editor schreibt/liest die editor-aktive Vorlage
    editorRoot,
    einsatzRoot,
    protocols,
    editorActiveId,
    einsatzActiveId,
    nextId,

    // --- Baum-Editing (auf der editor-aktiven Vorlage) ---
    update(id: string, patch: Record<string, unknown>): void {
      mutateEditor((t) => updateNode(t, id, patch))
    },
    addChild(parentId: string, kind: 'container' | 'field' | 'function', functionKind: FunctionKind = 'medikamentenplan'): Node {
      const child = kind === 'function' ? createFunction(nextId(), functionKind) : kind === 'field' ? createField(nextId()) : createContainer(nextId())
      mutateEditor((t) => addChildOp(t, parentId, child))
      return child
    },
    remove(id: string): void {
      if (id !== editorRoot.value.id) mutateEditor((t) => removeNode(t, id))
    },
    move(childId: string, delta: number): void {
      mutateEditor((t) => moveChild(t, childId, delta))
    },
    // Fliessendes Hoch/Runter (Variante A): rueckt am Container-Rand automatisch aus.
    moveUp(childId: string): void {
      mutateEditor((t) => moveUpOp(t, childId))
    },
    moveDown(childId: string): void {
      mutateEditor((t) => moveDownOp(t, childId))
    },
    // Cross-Container-Verschieben (id bleibt -> Einsatz-Werte unberuehrt).
    reparent(childId: string, targetParentId: string, index?: number): void {
      mutateEditor((t) => reparentOp(t, childId, targetParentId, index))
    },
    indent(childId: string): void {
      mutateEditor((t) => indentChild(t, childId))
    },
    outdent(childId: string): void {
      mutateEditor((t) => outdentChild(t, childId))
    },
    /** Die aktive Vorlage als Ganzes ersetzen (Import folgt in Slice 5 als „neue Vorlage"). */
    replace(next: Container): void {
      mutateEditor(() => next)
    },
    /** Die ganze Bibliothek ersetzen (z. B. nach dem Laden aus der Persistenz). Haelt die aktiven
     *  ids gueltig; nie leer (Fallback: eine leere Default-Vorlage). */
    setProtocols(next: Container[]): void {
      protocols.value = next.length ? next : [createContainer('protokoll')]
      if (!protocols.value.some((p) => p.id === editorActiveId.value)) editorActiveId.value = protocols.value[0].id
      if (!protocols.value.some((p) => p.id === einsatzActiveId.value)) einsatzActiveId.value = protocols.value[0].id
    },

    // --- Bibliothek ---
    addProtocol(title = 'Neue Vorlage'): Container {
      const p: Container = { ...createContainer(nextId()), title }
      protocols.value = [...protocols.value, p]
      editorActiveId.value = p.id
      return p
    },
    duplicate(id: string): Container | null {
      const { protocols: next, copy } = duplicateProtocol(protocols.value, id, nextId)
      protocols.value = next
      if (copy) editorActiveId.value = copy.id
      return copy
    },
    /** Pruefen, ob eine Vorlage mit dieser Wurzel-id existiert (Import-Kollision). */
    protocolExists(id: string): boolean {
      return protocolExistsOp(protocols.value, id)
    },
    /** Vorlage als NEUE Vorlage importieren (kollisionsfrei; retitle haengt „ (Import)" an). */
    importProtocol(tree: Container, retitle = false): Container {
      const { protocols: next, added } = importProtocolOp(protocols.value, tree, nextId, retitle)
      protocols.value = next
      editorActiveId.value = added.id
      return added
    },
    /** Bestehende Vorlage mit gleicher Wurzel-id durch den Import-Baum ersetzen. */
    overwriteProtocol(tree: Container): Container {
      const { protocols: next, added } = overwriteProtocolOp(protocols.value, tree)
      protocols.value = next
      editorActiveId.value = added.id
      return added
    },
    rename(id: string, title: string): void {
      protocols.value = renameOp(protocols.value, id, title)
    },
    removeProtocol(id: string): void {
      const next = removeOp(protocols.value, id)
      protocols.value = next
      if (!next.some((p) => p.id === editorActiveId.value)) editorActiveId.value = next[0].id
      if (!next.some((p) => p.id === einsatzActiveId.value)) einsatzActiveId.value = next[0].id
    },
    moveProtocol(id: string, delta: number): void {
      protocols.value = moveProtocolOp(protocols.value, id, delta)
    },
    selectEditor(id: string): void {
      if (protocols.value.some((p) => p.id === id)) editorActiveId.value = id
    },
    selectEinsatz(id: string): void {
      if (protocols.value.some((p) => p.id === id)) einsatzActiveId.value = id
    },
  }
}
