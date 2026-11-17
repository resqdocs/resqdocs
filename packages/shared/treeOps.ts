// Baum-Operationen für gezieltes Einfügen, Duplizieren und Ziehen - gemeinsam für App und Online-Editor.
// Rein und immutabel wie die Creator-Ops des Kerns; die eigentlichen Regeln (Zyklus-Schutz, frische
// Kennungen, Abhängigkeiten nachziehen) kommen von dort.
import type { Container, Node } from './model.ts'
import { findNode, parentOf, isDescendant, reparent } from './creator.ts'
import { reId } from './library.ts'

/** Kind an Position `index` in `parentId` einfügen (fehlt/außerhalb: ans Ende). Nichts zu tun: selbe Referenz. */
export function insertAt(root: Container, parentId: string, child: Node, index?: number): Container {
  const walk = (node: Node): Node => {
    if (node.type !== 'container') return node
    if (node.id === parentId) {
      const i = index === undefined ? node.children.length : Math.max(0, Math.min(index, node.children.length))
      return { ...node, children: [...node.children.slice(0, i), child, ...node.children.slice(i)] }
    }
    let changed = false
    const children = node.children.map((c) => {
      const next = walk(c)
      if (next !== c) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  return walk(root) as Container
}

/** Wo ein Element liegt: Eltern-Abschnitt und Platz darin. null für die Wurzel oder Unbekanntes. */
export function positionOf(root: Container, id: string): { parentId: string; index: number } | null {
  const parent = parentOf(root, id)
  if (!parent) return null
  return { parentId: parent.id, index: parent.children.findIndex((c) => c.id === id) }
}

/** Element samt Inhalt kopieren und direkt dahinter einfügen. Die Kopie bekommt frische Kennungen;
 *  Abhängigkeiten innerhalb der Kopie zeigen auf die Kopie, Verweise nach außen bleiben. */
export function duplicateNode(root: Container, id: string, nextId: () => string): { root: Container; copyId: string } | null {
  const node = findNode(root, id)
  const pos = positionOf(root, id)
  if (!node || !pos) return null
  const copy = reId(JSON.parse(JSON.stringify(node)) as Node, nextId)
  return { root: insertAt(root, pos.parentId, copy, pos.index + 1), copyId: copy.id }
}

/** Darf `dragId` in den Abschnitt `parentId` gezogen werden? Nicht in sich selbst oder den eigenen Inhalt. */
export function canDropInto(root: Container, dragId: string, parentId: string): boolean {
  if (dragId === root.id) return false
  const target = findNode(root, parentId)
  if (!target || target.type !== 'container' || !findNode(root, dragId)) return false
  return !isDescendant(root, dragId, parentId)
}

/** Element an die Lücke `index` von `parentId` ziehen. `index` zählt in der Liste, wie sie VOR dem Ziehen
 *  aussieht (so wie die Lücken auf dem Bildschirm liegen). Unzulässig oder ohne Wirkung: selbe Referenz. */
export function moveTo(root: Container, id: string, parentId: string, index: number): Container {
  if (!canDropInto(root, id, parentId)) return root
  const pos = positionOf(root, id)
  if (!pos) return root
  const target = pos.parentId === parentId && pos.index < index ? index - 1 : index
  return reparent(root, id, parentId, target)
}

function sourceIds(node: Node): string[] {
  const ids = (node.dependsOn?.conditions ?? []).map((c) => c.fieldId)
  if (node.type === 'field') for (const rule of node.defaultWhen ?? []) ids.push(rule.fieldId)
  return ids
}

/** Kennungen der Felder, von denen dieses Element abhängt (Erscheinen und abhängiger Standardwert). */
export function dependencySources(node: Node): string[] {
  return [...new Set(sourceIds(node))]
}

/** Elemente außerhalb von `removed`, deren Regeln auf ein Feld in `removed` zeigen. Für den Hinweis beim Löschen. */
export function dependentsOf(root: Container, removed: ReadonlySet<string>): Node[] {
  const out: Node[] = []
  const walk = (node: Node): void => {
    if (removed.has(node.id)) return // samt Inhalt entfernt
    if (sourceIds(node).some((id) => removed.has(id))) out.push(node)
    if (node.type === 'container') node.children.forEach(walk)
  }
  walk(root)
  return out
}
