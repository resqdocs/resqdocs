// useTreeHistory.ts — Rückgängig/Wiederholen für die Vorlagen-Bearbeitung, gemeinsam für App und Online-Editor.
// Ein Schritt ist der Stand der Vorlagen-Liste VOR einer Änderung (die Baum-Operationen sind immutabel und
// weisen die Liste neu zu). Tipp-Folgen an derselben Stelle (gleicher `tag`) zählen als EIN Schritt.
import { computed, ref, watch, type Ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { findNode } from '@resqdocs/protocol-core/creator'
import { createHistory } from './history.ts'
import type { useProtocolTree } from './useProtocolTree.ts'

interface Snapshot {
  protocols: Container[]
  activeId: string
  selectedId: string | null
}

export function useTreeHistory(tree: ReturnType<typeof useProtocolTree>, selectedId: Ref<string | null>) {
  const history = createHistory<Snapshot>()
  const tick = ref(0) // history ist nicht reaktiv; der Zähler stößt canUndo/canRedo an
  // Stand, den der Verlauf zuletzt kennt. Ändert sich die Liste an ihm vorbei (z. B. Vorlage im Vorlagen-Menü
  // gelöscht oder umbenannt), wäre ein Rückgängig gefährlich - es holte jene Änderung still zurück. Dann wird der
  // Verlauf geleert statt falsch zurückgesetzt.
  let known = tree.protocols.value
  watch(tree.protocols, (v) => {
    if (v !== known) {
      known = v
      history.clear()
      tick.value++
    }
  })
  const snapshot = (): Snapshot => ({ protocols: tree.protocols.value, activeId: tree.editorActiveId.value, selectedId: selectedId.value })
  function restore(s: Snapshot): void {
    tree.setProtocols(s.protocols)
    known = s.protocols
    tree.selectEditor(s.activeId)
    selectedId.value = s.selectedId && findNode(tree.root.value, s.selectedId) ? s.selectedId : tree.root.value.id
    tick.value++
  }
  /** Änderung ausführen und als Schritt merken. `tag` = Tipp-Folge (z. B. Titel eines Elements), null = eigener Schritt. */
  function change(tag: string | null, fn: () => void): void {
    const before = snapshot()
    fn()
    const now = tree.protocols.value
    if (now === before.protocols) return
    // Die Baum-Operationen weisen die Liste immer neu zu. Ob sich etwas geändert hat, zeigt erst der
    // Vergleich der Vorlagen selbst. Ohne Änderung bleibt die alte Liste stehen und es entsteht kein Schritt.
    if (now.length === before.protocols.length && now.every((p, i) => p === before.protocols[i])) {
      tree.setProtocols(before.protocols)
      return
    }
    known = now
    history.record(before, tag, Date.now())
    tick.value++
  }
  return {
    change,
    canUndo: computed(() => (tick.value, history.canUndo())),
    canRedo: computed(() => (tick.value, history.canRedo())),
    undo(): boolean {
      const prev = history.undo(snapshot())
      if (!prev) return false
      restore(prev)
      return true
    },
    redo(): boolean {
      const next = history.redo(snapshot())
      if (!next) return false
      restore(next)
      return true
    },
    reset(): void {
      known = tree.protocols.value
      history.clear()
      tick.value++
    },
  }
}
