// Abschnitte im Aufbau einklappen (App, Vorlagen → Aufbau). Nur Ansicht: Die Vorlage ändert sich nicht, es gibt
// keinen Rückgängig-Schritt. Gemerkt je Vorlage, solange die App offen ist (Modulzustand, nichts wird gespeichert);
// beim Start ist alles offen. Vorbild ist das Einklappen im Online-Editor (folded/toggleFold/foldAll).
import type { InjectionKey, Ref } from 'vue'
import { inject, ref, watch } from 'vue'
import type { Container, Node } from '@resqdocs/protocol-core/model'

/** Menge mit umgeschaltetem Eintrag (neue Menge, die alte bleibt unverändert). */
export function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

/** Alle Abschnitte unterhalb der Wurzel (die Wurzel selbst lässt sich nicht einklappen). */
export function sectionIds(root: Container): string[] {
  const out: string[] = []
  const walk = (n: Container): void => {
    for (const c of n.children) if (c.type === 'container') (out.push(c.id), walk(c))
  }
  walk(root)
  return out
}

/** Abschnitte auf dem Weg von der Wurzel zu `id` (ohne Wurzel, ohne das Element selbst). Leer, wenn es fehlt. */
export function ancestorsOf(root: Container, id: string): string[] {
  const walk = (n: Container, path: string[]): string[] | null => {
    for (const c of n.children) {
      if (c.id === id) return path
      if (c.type === 'container') {
        const found = walk(c, [...path, c.id])
        if (found) return found
      }
    }
    return null
  }
  return walk(root, []) ?? []
}

/** Menge ohne die eingeklappten Abschnitte über `id`; ohne Änderung dieselbe Menge. */
export function revealed(set: ReadonlySet<string>, root: Container, id: string): ReadonlySet<string> {
  const path = ancestorsOf(root, id).filter((a) => set.has(a))
  if (!path.length) return set
  const next = new Set(set)
  for (const a of path) next.delete(a)
  return next
}

/** Anzahl aller Elemente in einem Abschnitt (alle Ebenen), wie im Online-Editor. */
export function countDescendants(n: Node): number {
  return n.type === 'container' ? n.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0) : 0
}

export interface TreeFold {
  isFolded(id: string): boolean
  toggle(id: string): void
  foldAll(): void
  unfoldAll(): void
  /** Abschnitte über `id` aufklappen, damit das Element zu sehen ist. */
  reveal(id: string): void
  /** Ein Abschnitt hat eine neue Kennung bekommen: sein Zustand zieht mit. */
  rename(oldId: string, newId: string): void
}

export const TREE_FOLD: InjectionKey<TreeFold> = Symbol('treeFold')

export function useTreeFoldApi(): TreeFold {
  const api = inject(TREE_FOLD)
  if (!api) throw new Error('useTreeFoldApi(): kein Provider für das Einklappen im Baum')
  return api
}

// Je Vorlage gemerkt, solange die App offen ist. Der Aufbau wird am Handy beim Wechsel zu Eigenschaften/Vorschau
// ab- und wieder aufgebaut (v-if), darum liegt der Zustand hier und nicht im Baum-Knoten.
const memory = new Map<string, ReadonlySet<string>>()

export function useTreeFold(templateId: Ref<string>, root: Ref<Container>): TreeFold & { folded: Ref<ReadonlySet<string>> } {
  const folded = ref<ReadonlySet<string>>(memory.get(templateId.value) ?? new Set())
  const set = (next: ReadonlySet<string>): void => {
    if (next === folded.value) return
    folded.value = next
    memory.set(templateId.value, next)
  }
  // sync: Nach einem Vorlagenwechsel darf kein Aufruf im selben Schritt noch den Zustand der alten Vorlage sehen.
  watch(templateId, (id) => (folded.value = memory.get(id) ?? new Set()), { flush: 'sync' })
  return {
    folded,
    isFolded: (id) => folded.value.has(id),
    toggle: (id) => set(toggled(folded.value, id)),
    foldAll: () => set(new Set(sectionIds(root.value))),
    unfoldAll: () => set(new Set()),
    reveal: (id) => set(revealed(folded.value, root.value, id)),
    rename: (oldId, newId) => {
      if (!folded.value.has(oldId)) return
      const next = new Set(folded.value)
      next.delete(oldId)
      next.add(newId)
      set(next)
    },
  }
}

/** Nur für Tests: gemerkte Zustände vergessen. */
export function forgetTreeFolds(): void {
  memory.clear()
}
