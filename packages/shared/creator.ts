// Creator - Rework. Reine, immutable Baum-Operationen ueber Node (Container | Field).
// Hand-Rekursion mit Structural Sharing, No-Op -> selbe Referenz. KEIN Immer/Normalisierung jetzt
// (YAGNI, siehe docs/rework/container-impl.md). Ops matchen per id ueber ALLE Node-Typen, damit
// auch Felder (Blaetter) gefunden/gepatcht/entfernt/verschoben werden.

import type { Container, Field, FunctionNode, FunctionKind, Node, FieldFill } from './model.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

export function createContainer(id: string): Container {
  return { type: 'container', id, children: [] }
}
export function createField(id: string): Field {
  return { type: 'field', id }
}
/** Funktions-Blatt (z. B. Medikamentenplan). Default-Titel = Registry-Label, damit Editor UND Einsatz
 *  denselben Namen zeigen (sonst Editor=id „n2", Einsatz=Fallback). showTitle an. Frei umbenennbar. */
export function createFunction(id: string, kind: FunctionKind = 'medikamentenplan'): FunctionNode {
  return { type: 'function', id, functionKind: kind, showTitle: true, title: FUNCTION_REGISTRY[kind].label }
}

/** Tiefensuche ueber ALLE Knoten (Container + Field): Knoten mit id finden (oder null). */
export function findNode(root: Container, id: string): Node | null {
  if (root.id === id) return root
  for (const child of root.children) {
    if (child.id === id) return child
    if (child.type === 'container') {
      const found = findNode(child, id)
      if (found) return found
    }
  }
  return null
}

/** Alle Knoten-ids eines (Teil-)Baums - z. B. um beim Loeschen die zugehoerigen Einsatz-Werte mit
 *  aufzuraeumen (Funktion = Gesundheitsdaten). */
export function collectIds(node: Node): string[] {
  const acc: string[] = [node.id]
  if (node.type === 'container') for (const c of node.children) acc.push(...collectIds(c))
  return acc
}

/** Alle Funktions-Knoten eines bestimmten kind im (Teil-)Baum sammeln (Dokument-Reihenfolge) - fuer die
 *  Cross-Funktion-Uebernahme (z. B. gescannten Arzt an eine vorhandene Aerzte-Funktion anhaengen). */
export function collectFunctionNodes(root: Container, kind: FunctionKind): FunctionNode[] {
  const acc: FunctionNode[] = []
  const walk = (n: Node): void => {
    if (n.type === 'function') {
      if (n.functionKind === kind) acc.push(n)
    } else if (n.type === 'container') {
      for (const c of n.children) walk(c)
    }
  }
  walk(root)
  return acc
}

/** Beispiel-Werte NUR fuer die Editor-Vorschau: fuer jeden Funktions-Knoten mit `sampleFill` ein festes
 *  Demo-Fill (Scores wie Pack-Years, aber auch Medikamentenplan/Aerzte mit Muster-Zeilen), damit die
 *  Vorschau die Funktion MIT Werten zeigt - der Nutzer gibt im Editor nichts ein. Felder loesen ihre
 *  Defaults im Renderer auf. NICHT im Einsatz / der echten Ausgabe verwenden (dort zaehlen die echten Werte). */
export function previewValues(root: Container): Record<string, FieldFill> {
  const out: Record<string, FieldFill> = {}
  const walk = (n: Node): void => {
    if (n.type === 'function') {
      const fill = FUNCTION_REGISTRY[n.functionKind]?.sampleFill?.()
      if (fill) out[n.id] = fill
    } else if (n.type === 'container') {
      for (const c of n.children) walk(c)
    }
  }
  walk(root)
  return out
}

/** Erste freie id-Variante (base, base-2, base-3, …) im Baum - fuer konstruktive Kollisions-Hinweise. */
export function suggestFreeId(root: Container, base: string): string {
  let candidate = base
  let i = 2
  while (findNode(root, candidate)) candidate = `${base}-${i++}`
  return candidate
}

/** Pfad von der Wurzel zum Knoten mit id (inklusive), oder [] wenn nicht gefunden.
 *  Nuetzlich fuer vererbte Eigenschaften (z. B. Feld-Trenner): naechster Vorfahre = path[i-1]. */
export function findPath(root: Container, id: string): Node[] {
  if (root.id === id) return [root]
  for (const child of root.children) {
    if (child.id === id) return [root, child]
    if (child.type === 'container') {
      const sub = findPath(child, id)
      if (sub.length) return [root, ...sub]
    }
  }
  return []
}

/** Kinder rekursiv durchlaufen; gibt das Original zurueck, wenn sich NICHTS geaendert hat
 *  (Identitaet erhalten -> keine Re-Renders auf unbeteiligten Pfaden). */
function mapChildren(node: Container, fn: (n: Node) => Node): Container {
  let changed = false
  const children = node.children.map((c) => {
    const nc = fn(c)
    if (nc !== c) changed = true
    return nc
  })
  return changed ? { ...node, children } : node
}

/** Immutabel: Knoten (Container ODER Field) per id flach patchen. type bleibt erhalten.
 *  No-Op -> selbe Referenz. */
export function updateNode(root: Container, id: string, patch: Record<string, unknown>): Container {
  return updateIn(root, id, patch) as Container
}
function updateIn(node: Node, id: string, patch: Record<string, unknown>): Node {
  if (node.id === id) return { ...node, ...patch, type: node.type } as Node
  if (node.type !== 'container') return node
  return mapChildren(node, (c) => updateIn(c, id, patch))
}

/** Immutabel: ein Kind an den Container parentId anhaengen. No-Op -> selbe Referenz. */
export function addChild(root: Container, parentId: string, child: Node): Container {
  return addIn(root, parentId, child) as Container
}
function addIn(node: Node, parentId: string, child: Node): Node {
  if (node.type !== 'container') return node
  if (node.id === parentId) return { ...node, children: [...node.children, child] }
  return mapChildren(node, (c) => addIn(c, parentId, child))
}

/** Immutabel: Knoten per id entfernen (die Wurzel selbst nicht). No-Op -> selbe Referenz. */
export function removeNode(root: Container, id: string): Container {
  return removeIn(root, id) as Container
}
function removeIn(node: Node, id: string): Node {
  if (node.type !== 'container') return node
  const filtered = node.children.filter((c) => c.id !== id)
  const removedHere = filtered.length !== node.children.length
  let changed = removedHere
  const children = filtered.map((c) => {
    const nc = removeIn(c, id)
    if (nc !== c) changed = true
    return nc
  })
  return changed ? { ...node, children } : node
}

/** Immutabel: ein Kind innerhalb seines Eltern-Containers um delta verschieben (per id,
 *  robust gegen Index-Drift). No-Op (nicht gefunden / Rand) -> selbe Referenz. */
export function moveChild(root: Container, childId: string, delta: number): Container {
  return moveIn(root, childId, delta) as Container
}
function moveIn(node: Node, childId: string, delta: number): Node {
  if (node.type !== 'container') return node
  const idx = node.children.findIndex((c) => c.id === childId)
  if (idx !== -1) {
    const j = idx + delta
    if (j < 0 || j >= node.children.length) return node
    const children = node.children.slice()
    const tmp = children[idx]
    children[idx] = children[j]
    children[j] = tmp
    return { ...node, children }
  }
  return mapChildren(node, (c) => moveIn(c, childId, delta))
}

/** Direkter Eltern-Container eines Knotens (oder null fuer die Wurzel / nicht gefunden). */
export function parentOf(root: Container, id: string): Container | null {
  for (const child of root.children) {
    if (child.id === id) return root
    if (child.type === 'container') {
      const found = parentOf(child, id)
      if (found) return found
    }
  }
  return null
}

/** Ist `id` gleich `ancestorId` ODER liegt im Teilbaum von `ancestorId`? Zyklus-Schutz beim Reparent. */
export function isDescendant(root: Container, ancestorId: string, id: string): boolean {
  const ancestor = findNode(root, ancestorId)
  if (!ancestor) return false
  if (ancestor.type !== 'container') return ancestorId === id
  return !!findNode(ancestor, id) // findNode prueft ancestor selbst + alle Nachfahren
}

/** Immutabel: ein Kind an Position index in parentId einfuegen (geclamped). No-Op -> selbe Referenz. */
function insertChildAt(node: Node, parentId: string, child: Node, index: number): Node {
  if (node.type !== 'container') return node
  if (node.id === parentId) {
    const i = Math.max(0, Math.min(index, node.children.length))
    return { ...node, children: [...node.children.slice(0, i), child, ...node.children.slice(i)] }
  }
  return mapChildren(node, (c) => insertChildAt(c, parentId, child, index))
}

/**
 * Immutabel: Knoten `childId` aus seinem Eltern-Container loesen und als Kind von `targetParentId` an
 * Position `index` einfuegen (undefiniert/ausserhalb -> ans Ende). Die id bleibt erhalten -> Einsatz-Werte
 * unberuehrt. No-Op (selbe Referenz) bei: Wurzel verschieben, child/target nicht gefunden, target kein
 * Container, target im Teilbaum von child (Zyklus), oder (im SELBEN Parent) bereits an der Zielposition.
 */
export function reparent(root: Container, childId: string, targetParentId: string, index?: number): Container {
  if (childId === root.id) return root
  const node = findNode(root, childId)
  const target = findNode(root, targetParentId)
  if (!node || !target || target.type !== 'container') return root
  if (isDescendant(root, childId, targetParentId)) return root // Ziel == child oder in dessen Teilbaum
  const parent = parentOf(root, childId)
  if (!parent) return root
  // No-Op: gleicher Parent + bereits exakt an der Zielposition.
  if (parent.id === targetParentId) {
    const cur = parent.children.findIndex((c) => c.id === childId)
    const lastIdx = parent.children.length - 1
    const want = index === undefined ? lastIdx : Math.max(0, Math.min(index, lastIdx))
    if (cur === want) return root
  }
  const without = removeNode(root, childId)
  const targetAfter = findNode(without, targetParentId) as Container
  const idx = index === undefined ? targetAfter.children.length : Math.max(0, Math.min(index, targetAfter.children.length))
  return insertChildAt(without, targetParentId, node, idx) as Container
}

/** Ausruecken: childId wird Geschwister direkt HINTER seinem Eltern-Container (eine Ebene hoch).
 *  No-Op, wenn der Parent schon die Wurzel ist (kann nicht weiter raus). */
export function outdentChild(root: Container, childId: string): Container {
  const parent = parentOf(root, childId)
  if (!parent || parent.id === root.id) return root
  const grand = parentOf(root, parent.id)
  if (!grand) return root
  const parentIdx = grand.children.findIndex((c) => c.id === parent.id)
  return reparent(root, childId, grand.id, parentIdx + 1)
}

/** Einruecken: childId wird letztes Kind seines unmittelbaren Vorgaenger-Geschwisters, sofern das ein
 *  Container ist. No-Op sonst (kein Vorgaenger / Vorgaenger ist ein Feld). */
export function indentChild(root: Container, childId: string): Container {
  const parent = parentOf(root, childId)
  if (!parent) return root
  const idx = parent.children.findIndex((c) => c.id === childId)
  if (idx <= 0) return root
  const prev = parent.children[idx - 1]
  if (prev.type !== 'container') return root
  return reparent(root, childId, prev.id, prev.children.length)
}

// --- „Kann-ich?"-Praedikate: EINE Quelle fuer UI-Gating (deckungsgleich mit den Op-No-Op-Bedingungen). ---

/** Hoch verschiebbar = nicht erstes Kind seines Eltern-Containers. */
export function canMoveUp(root: Container, id: string): boolean {
  const p = parentOf(root, id)
  return !!p && p.children.findIndex((c) => c.id === id) > 0
}
/** Runter verschiebbar = nicht letztes Kind. */
export function canMoveDown(root: Container, id: string): boolean {
  const p = parentOf(root, id)
  if (!p) return false
  const i = p.children.findIndex((c) => c.id === id)
  return i >= 0 && i < p.children.length - 1
}
/** Einrueckbar = Vorgaenger-Geschwister existiert und ist ein Container. */
export function canIndent(root: Container, id: string): boolean {
  const p = parentOf(root, id)
  if (!p) return false
  const i = p.children.findIndex((c) => c.id === id)
  return i > 0 && p.children[i - 1].type === 'container'
}
/** Ausrueckbar = Eltern-Container ist nicht die Wurzel. */
export function canOutdent(root: Container, id: string): boolean {
  const p = parentOf(root, id)
  return !!p && p.id !== root.id
}

/** Zulaessige Ziel-Container fuer den „Verschieben nach"-Picker: alle Container AUSSER dem eigenen
 *  Teilbaum (Zyklus) und Feldern; der aktuelle Eltern-Container ist markiert (current). */
export function moveTargets(root: Container, id: string): { id: string; label: string; depth: number; current: boolean }[] {
  const out: { id: string; label: string; depth: number; current: boolean }[] = []
  const current = parentOf(root, id)
  const walk = (n: Node, depth: number): void => {
    if (n.type !== 'container') return
    if (n.id === id) return // eigener Teilbaum komplett ueberspringen
    const title = n.title && n.title.trim()
    out.push({ id: n.id, label: depth === 0 ? `⌂ ${title || 'Protokoll'}` : title || n.id, depth, current: current?.id === n.id })
    n.children.forEach((c) => walk(c, depth + 1))
  }
  walk(root, 0)
  return out
}

/**
 * „Hoch" als FLIESSENDE LINEARE Bewegung (OmniOutliner-Modell; Maintainer-Wunsch mit Beispiel 3.2 -> 2.4):
 * EIN Schritt in der sichtbaren Reihenfolge nach oben, ueber Container-Grenzen hinweg.
 * - Vorgaenger-Geschwister ist ein Container -> HINEIN, ans ENDE (in den Container absteigen);
 * - Vorgaenger-Geschwister ist ein Blatt -> Swap;
 * - erstes Kind eines Nicht-Wurzel-Containers -> davor ausruecken (outdent + Swap zieht davor);
 * - erstes Kind der Wurzel -> No-Op.
 */
export function moveUp(root: Container, id: string): Container {
  const p = parentOf(root, id)
  if (!p) return root
  const i = p.children.findIndex((c) => c.id === id)
  if (i > 0) {
    const prev = p.children[i - 1]
    if (prev.type === 'container') return reparent(root, id, prev.id, prev.children.length)
    return moveChild(root, id, -1)
  }
  if (p.id !== root.id) return moveChild(outdentChild(root, id), id, -1)
  return root
}
/**
 * „Runter" symmetrisch: ein Schritt nach unten.
 * - Nachfolger-Geschwister ist ein Container -> HINEIN, an den ANFANG;
 * - Nachfolger ist ein Blatt -> Swap;
 * - letztes Kind eines Nicht-Wurzel-Containers -> dahinter ausruecken;
 * - letztes Kind der Wurzel -> No-Op.
 */
export function moveDown(root: Container, id: string): Container {
  const p = parentOf(root, id)
  if (!p) return root
  const i = p.children.findIndex((c) => c.id === id)
  if (i >= 0 && i < p.children.length - 1) {
    const next = p.children[i + 1]
    if (next.type === 'container') return reparent(root, id, next.id, 0)
    return moveChild(root, id, 1)
  }
  if (p.id !== root.id) return outdentChild(root, id)
  return root
}
