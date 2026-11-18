// Lückentext: reine Logik, node-testbar. Ein Lückentext ist die Ausgabe-Form eines Abschnitts: fester Text
// und Lücken wechseln sich ab, jede Lücke zeigt per Kennung auf ein Feld oder eine Funktion der Vorlage.
// Liegt das Element direkt im Abschnitt, gehört die Lücke dem Lückentext; sonst übernimmt sie den Wert
// von dort. Die Werte selbst liegen wie bei jedem Feld im Werte-Speicher des Einsatzes.

import type { Cloze, ClozePart, Container, Field, FunctionNode, Node } from './model.ts'

export type GapNode = Field | FunctionNode

function isPart(p: unknown): p is ClozePart {
  return typeof p === 'string' || (!!p && typeof p === 'object' && typeof (p as { gap?: unknown }).gap === 'string')
}

/** Lückentext des Abschnitts oder null. Defensiv gegen fremde Vorlagen: ohne `parts`-Liste gilt der
 *  Abschnitt als normaler Abschnitt, unlesbare Stücke entfallen. */
export function clozeOf(container: Container): Cloze | null {
  const c = container.cloze as unknown as Cloze | undefined
  if (!c || typeof c !== 'object' || !Array.isArray(c.parts)) return null
  const raw = c.parts as unknown[]
  return raw.every(isPart) ? c : { ...c, parts: raw.filter(isPart) }
}

/** Kennungen der Lücken in Lesereihenfolge, jede nur einmal (dieselbe Lücke darf mehrfach im Text stehen). */
export function clozeGapIds(cloze: Cloze): string[] {
  const ids: string[] = []
  for (const p of cloze.parts) if (typeof p !== 'string' && !ids.includes(p.gap)) ids.push(p.gap)
  return ids
}

/** Kinder des Abschnitts, die in keiner Lücke stehen. Sie folgen unter dem Text wie in einem normalen
 *  Abschnitt - so geht kein Element still verloren. */
export function clozeLeftovers(container: Container, cloze: Cloze): Node[] {
  const used = new Set(clozeGapIds(cloze))
  return container.children.filter((c) => c.type === 'container' || !used.has(c.id))
}

/** Eine Lücke aufgelöst: das Element dahinter und ob es dem Lückentext selbst gehört (`own`) oder an
 *  anderer Stelle der Vorlage liegt. */
export interface ClozeGap {
  id: string
  node: GapNode
  own: boolean
}

function findLeaf(node: Node, id: string): GapNode | null {
  if (node.type !== 'container') return node.id === id ? node : null
  for (const c of node.children) {
    const hit = findLeaf(c, id)
    if (hit) return hit
  }
  return null
}

/** Die Lücken eines Lückentexts in Lesereihenfolge, je einmal. Verweise ohne Ziel entfallen. `root` ist
 *  die ganze Vorlage (für Lücken, die ihren Wert von anderer Stelle übernehmen). */
export function clozeGaps(root: Container | null, container: Container): ClozeGap[] {
  const cloze = clozeOf(container)
  if (!cloze) return []
  const out: ClozeGap[] = []
  for (const id of clozeGapIds(cloze)) {
    const child = container.children.find((c) => c.id === id)
    if (child && child.type !== 'container') out.push({ id, node: child, own: true })
    else if (!child && root) {
      const node = findLeaf(root, id)
      if (node) out.push({ id, node, own: false })
    }
  }
  return out
}

/** Benachbarte Textstücke zusammenziehen, leere entfernen. */
export function mergeParts(parts: readonly ClozePart[]): ClozePart[] {
  const out: ClozePart[] = []
  for (const p of parts) {
    if (typeof p !== 'string') out.push(p)
    else if (p !== '') {
      const last = out[out.length - 1]
      if (typeof last === 'string') out[out.length - 1] = last + p
      else out.push(p)
    }
  }
  return out
}

const SEPARATOR_AHEAD = /^[ \t]*[,;][ \t]*/
const CONJUNCTION_AHEAD = /^[ \t]*(?:und|oder|sowie)(?![\p{L}\p{N}])/u
const END_AHEAD = /^[ \t]*(?:[.!?:)\]]|\n|$)/
const DANGLING_TAIL = /[ \t]*[,;]?(?:[ \t]+(?:und|oder|sowie))?[ \t]*$/

/**
 * Die Stücke eines Lückentexts zu Text fügen. `text` = fester Text, `gap` = Wert einer Lücke ('' = leer
 * oder nicht erhoben). Um eine LEERE Lücke herum wird aufgeräumt, damit kein Loch im Satz bleibt:
 *  - doppelte Leerzeichen und ein Leerzeichen vor dem Satzzeichen entfallen,
 *  - die Lücke nimmt ein Komma/Semikolon mit (das folgende, am Satzende das davor),
 *  - ein leeres Klammerpaar und ein „und/oder" ohne Folgewort entfallen,
 *  - eine Zeile, die nur aus der Lücke bestand, entfällt.
 * Fester Text ohne leere Lücke daneben bleibt unangetastet. Bleibt kein Buchstabe und keine Ziffer
 * übrig, ist das Ergebnis leer.
 */
export function joinCloze(segments: readonly ({ text: string } | { gap: string })[]): string {
  const out = joinTidy(segments)
  return /[\p{L}\p{N}]/u.test(out) ? out : ''
}

function joinTidy(segments: readonly ({ text: string } | { gap: string })[]): string {
  let out = ''
  let hole = false // davor liegt eine leere Lücke, die noch nicht aufgeräumt ist
  const atLineStart = (): boolean => out === '' || out.endsWith('\n')
  for (const seg of segments) {
    if ('gap' in seg) {
      if (seg.gap.trim() === '') hole = true
      else {
        out += seg.gap
        hole = false
      }
      continue
    }
    let t = seg.text
    if (hole && t !== '') {
      if (/[(\[][ \t]*$/.test(out) && /^[ \t]*[)\]]/.test(t)) {
        // leeres Klammerpaar
        out = out.replace(/[ \t]*[(\[][ \t]*$/, '')
        t = t.replace(/^[ \t]*[)\]]/, '')
      }
      if (SEPARATOR_AHEAD.test(t)) {
        t = t.replace(SEPARATOR_AHEAD, '')
        if (t === '') {
          // das Stück war nur der Trenner: er geht mit der Lücke, der Trenner davor verbindet weiter
          hole = false
          continue
        }
        if (out !== '' && !/\s$/.test(out) && /^[\p{L}\p{N}]/u.test(t)) t = ` ${t}`
      }
      if (CONJUNCTION_AHEAD.test(t) && /[,;][ \t]*$/.test(out)) out = out.replace(/[ \t]*[,;][ \t]*$/, ' ')
      if (END_AHEAD.test(t)) {
        if (atLineStart() && /^[ \t]*\n/.test(t)) t = t.replace(/^[ \t]*\n/, '') // die Zeile bestand nur aus der Lücke
        else out = out.replace(DANGLING_TAIL, '')
      } else if (atLineStart() || /[ \t]$/.test(out)) {
        t = t.replace(/^[ \t]+/, '')
      }
      hole = false
    }
    out += t
  }
  if (hole) out = out.replace(DANGLING_TAIL, '')
  return out
}

/** Lücken-Verweise ohne Ziel entfernen (das Element wurde gelöscht oder fehlt in einer fremden Vorlage)
 *  und einen unlesbaren `cloze`-Eintrag ganz verwerfen. Nichts zu tun -> selbe Referenz. */
export function pruneCloze(root: Container): Container {
  const leaves = new Set<string>()
  let any = false
  const collect = (node: Node): void => {
    if (!node || typeof node !== 'object') return // kaputter Baum: nichts anfassen, die Prüfung beim Import meldet ihn
    if (node.type !== 'container') {
      leaves.add(node.id)
      return
    }
    if (node.cloze !== undefined) any = true
    if (Array.isArray(node.children)) node.children.forEach(collect)
  }
  collect(root)
  return any ? (pruneIn(root, leaves) as Container) : root
}

/** Lücken aus dem Text nehmen. Die Nachbartexte wachsen zusammen, als wäre die Lücke leer geblieben
 *  (kein doppeltes Leerzeichen, kein verwaistes Komma). */
export function dropGaps(parts: readonly ClozePart[], drop: (id: string) => boolean): ClozePart[] {
  const out: ClozePart[] = []
  let hole = false
  const lastText = (): string => {
    const last = out[out.length - 1]
    return typeof last === 'string' ? (out.pop() as string) : ''
  }
  for (const p of mergeParts(parts)) {
    if (typeof p !== 'string') {
      if (drop(p.gap)) hole = true
      else {
        if (hole) out.push(joinTidy([{ text: lastText() }, { gap: '' }]))
        hole = false
        out.push(p)
      }
    } else if (hole) {
      out.push(joinTidy([{ text: lastText() }, { gap: '' }, { text: p }]))
      hole = false
    } else out.push(p)
  }
  if (hole) out.push(joinTidy([{ text: lastText() }, { gap: '' }]))
  return mergeParts(out)
}

function pruneIn(node: Node, leaves: ReadonlySet<string>): Node {
  if (!node || typeof node !== 'object' || node.type !== 'container' || !Array.isArray(node.children)) return node
  let out: Container = node
  if (node.cloze !== undefined) {
    const cloze = clozeOf(node)
    if (!cloze) {
      const { cloze: _unreadable, ...rest } = node
      out = rest
    } else {
      const parts = dropGaps(cloze.parts, (id) => !leaves.has(id))
      const before = (node.cloze as Cloze).parts
      if (parts.length !== before.length || parts.some((p, i) => p !== before[i])) out = { ...node, cloze: { ...cloze, parts } }
    }
  }
  let changed = false
  const children = out.children.map((c) => {
    const next = pruneIn(c, leaves)
    if (next !== c) changed = true
    return next
  })
  return changed ? { ...out, children } : out
}
