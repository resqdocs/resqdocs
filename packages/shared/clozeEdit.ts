// Lückentext einrichten: reine Logik, node-testbar. Bearbeitet wird EIN Text, in dem jede Lücke als
// {Name} steht. Daraus entstehen die Stücke des Lückentexts und die Felder dahinter:
//  - {Name} einer bekannten Lücke bleibt diese Lücke,
//  - ein neuer {Name} legt eine Freitext-Lücke mit diesem Namen an,
//  - eine Lücke, die nicht mehr im Text steht, verschwindet samt ihrem Feld.

import type { ClozePart, Container, Field, Node } from './model.ts'
import { clozeOf, clozeGapIds, clozeGaps, dropGaps, mergeParts, type GapNode } from './cloze.ts'
import { createField } from './creator.ts'
import { fillValue } from './fill.ts'

const TOKEN = /\{([^{}\n]+)\}/g

function cleanName(raw: string): string {
  return raw.replace(/[{}\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Name jeder Lücke im Text ({Name}): der Titel des Elements, bei gleichen Titeln mit Zähler. */
export function gapNames(section: Container, root: Container | null): Map<string, string> {
  const names = new Map<string, string>()
  const used = new Set<string>()
  for (const gap of clozeGaps(root, section)) {
    const base = cleanName(gap.node.title ?? '') || 'Lücke'
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`
    used.add(name.toLowerCase())
    names.set(gap.id, name)
  }
  return names
}

/** Der Lückentext als ein Text mit {Name} je Lücke. */
export function sectionText(section: Container, root: Container | null): string {
  const cloze = clozeOf(section)
  if (!cloze) return ''
  const names = gapNames(section, root)
  return cloze.parts.map((p) => (typeof p === 'string' ? p : names.has(p.gap) ? `{${names.get(p.gap)}}` : '')).join('')
}

/** Ein Stück des Textes mit seiner Lage. `gap` mit `id` = bekannte Lücke, `gap` ohne `id` = neuer Name. */
export interface Token {
  kind: 'text' | 'gap'
  start: number
  end: number
  text: string
  id?: string
}

export function tokenize(text: string, names: ReadonlyMap<string, string>): Token[] {
  const byName = new Map([...names].map(([id, name]) => [name.toLowerCase(), id]))
  const out: Token[] = []
  let at = 0
  for (const m of text.matchAll(TOKEN)) {
    const name = cleanName(m[1])
    if (name === '') continue
    const start = m.index
    if (start > at) out.push({ kind: 'text', start: at, end: start, text: text.slice(at, start) })
    at = start + m[0].length
    out.push({ kind: 'gap', start, end: at, text: name, id: byName.get(name.toLowerCase()) })
  }
  if (at < text.length) out.push({ kind: 'text', start: at, end: text.length, text: text.slice(at) })
  return out
}

/** Den bearbeiteten Text übernehmen. Unverändert -> selbe Referenz. Eigene Felder stehen danach in der
 *  Reihenfolge des Textes (so zeigt sie auch eine ältere App-Version, die nur die Feldliste kennt). */
export function applyText(section: Container, root: Container | null, text: string, newId: () => string): Container {
  const cloze = clozeOf(section)
  if (cloze && sectionText(section, root) === text) return section
  const before = new Set(cloze ? clozeGapIds(cloze) : [])
  const created = new Map<string, Field>() // neuer Name -> neues Feld (derselbe Name zweimal = dieselbe Lücke)
  const parts: ClozePart[] = tokenize(text, gapNames(section, root)).map((t) => {
    if (t.kind === 'text') return t.text
    if (t.id) return { gap: t.id }
    const key = t.text.toLowerCase()
    if (!created.has(key)) created.set(key, { ...createField(newId()), title: t.text })
    return { gap: (created.get(key) as Field).id }
  })
  const order = parts.flatMap((p) => (typeof p === 'string' ? [] : [p.gap]))
  const after = new Set(order)
  const pool = new Map<string, Node>([...section.children, ...created.values()].map((c) => [c.id, c]))
  const gaps = [...after].flatMap((id) => {
    const child = pool.get(id)
    return child && child.type !== 'container' ? [child] : []
  })
  const kept = section.children.filter((c) => c.type === 'container' || (!before.has(c.id) && !after.has(c.id)))
  return { ...section, children: [...gaps, ...kept], cloze: { ...(cloze ?? {}), parts: mergeParts(parts) } }
}

function uniqueName(base: string, names: ReadonlyMap<string, string>): string {
  const used = new Set([...names.values()].map((n) => n.toLowerCase()))
  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`
  return name
}

/**
 * Aus dem Textbereich [start, end) eine neue Lücke machen (ein angetipptes Wort, eine Markierung oder -
 * bei leerem Bereich - eine neue Lücke an der Schreibmarke). Der bisherige Text wird Name UND
 * Standardwert der Lücke. `text` muss der aktuelle Text des Abschnitts sein. null, wenn der Bereich
 * eine bestehende Lücke schneidet.
 */
export function gapFromRange(
  section: Container,
  root: Container | null,
  text: string,
  start: number,
  end: number,
  newId: () => string,
): { section: Container; id: string } | null {
  const names = gapNames(section, root)
  if (start < 0 || end > text.length || start > end) return null
  if (tokenize(text, names).some((t) => t.kind === 'gap' && start < t.end && end > t.start)) return null
  const picked = text.slice(start, end)
  if (/[{}]/.test(picked)) return null
  const name = uniqueName(cleanName(picked).slice(0, 40) || 'Lücke', names)
  const id = newId()
  const next = applyText(section, root, `${text.slice(0, start)}{${name}}${text.slice(end)}`, () => id)
  if (picked.trim() === '') return { section: next, id }
  return { section: { ...next, children: next.children.map((c) => (c.id === id ? { ...c, default: picked } : c)) }, id }
}

/** Der Text, der an die Stelle der Lücke tritt, wenn man sie zurück in Text verwandelt. */
function plainText(node: GapNode): string {
  if (node.type === 'field') return fillValue(node, undefined) || node.title || ''
  return node.default || node.title || ''
}

/** Lücke zurück in festen Text verwandeln: ihr Standardwert (sonst ihr Name) steht wieder im Text, ein
 *  eigenes Feld verschwindet. */
export function revertGap(section: Container, root: Container | null, id: string): Container {
  const cloze = clozeOf(section)
  const gap = clozeGaps(root, section).find((g) => g.id === id)
  if (!cloze || !gap) return section
  const parts = mergeParts(cloze.parts.map((p) => (typeof p !== 'string' && p.gap === id ? plainText(gap.node) : p)))
  return { ...section, children: section.children.filter((c) => c.id !== id || c.type === 'container'), cloze: { ...cloze, parts } }
}

/** Lücke ersatzlos entfernen; der Text wächst zusammen, ein eigenes Feld verschwindet. */
export function removeGap(section: Container, id: string): Container {
  const cloze = clozeOf(section)
  if (!cloze) return section
  return {
    ...section,
    children: section.children.filter((c) => c.id !== id || c.type === 'container'),
    cloze: { ...cloze, parts: dropGaps(cloze.parts, (gap) => gap === id) },
  }
}

/**
 * Die Lücke `id` zeigt künftig auf ein anderes Element. Mit `own` wird dieses Element ein eigenes Kind
 * des Abschnitts (andere Art von Lücke: `own.id` darf dieselbe Kennung behalten); ohne `own` liegt das
 * Ziel `targetId` an anderer Stelle der Vorlage und die Lücke übernimmt dessen Wert. Das bisherige
 * eigene Element der Lücke verschwindet.
 */
export function retargetGap(section: Container, id: string, targetId: string, own?: GapNode): Container {
  const cloze = clozeOf(section)
  if (!cloze) return section
  const parts = cloze.parts.map((p) => (typeof p !== 'string' && p.gap === id ? { ...p, gap: targetId } : p))
  const at = section.children.findIndex((c) => c.id === id && c.type !== 'container')
  const children = section.children.filter((c) => c.type === 'container' || (c.id !== id && c.id !== targetId))
  if (own) children.splice(at < 0 ? children.length : Math.min(at, children.length), 0, own)
  return { ...section, children, cloze: { ...cloze, parts } }
}

/** Felder und Funktionen an anderer Stelle der Vorlage, deren Wert eine Lücke übernehmen kann. */
export function foreignCandidates(root: Container, section: Container): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  const walk = (node: Node, path: string[]): void => {
    if (node.id === section.id) return
    const name = (node.title && node.title.trim()) || node.id
    if (node.type !== 'container') out.push({ id: node.id, label: [...path, name].join(' › ') })
    else for (const child of node.children) walk(child, node === root ? path : [...path, name])
  }
  walk(root, [])
  return out
}

/** Einen normalen Abschnitt zum Lückentext machen: jedes Feld wird eine Lücke, in der bisherigen
 *  Anordnung (neue Zeile bzw. in der Zeile) und mit sichtbarem Titel davor. */
export function toCloze(section: Container): Container {
  if (clozeOf(section)) return section
  const parts: ClozePart[] = []
  for (const child of section.children) {
    if (child.type === 'container') continue
    if (parts.length) parts.push(child.inline ? (child.noSeparatorBefore ? '' : (section.separator ?? ', ')) : '\n')
    if (child.title && child.showTitle) parts.push(`${child.title}: `)
    parts.push({ gap: child.id })
  }
  return { ...section, cloze: { parts: mergeParts(parts) } }
}

/** Zurück zum normalen Abschnitt: die Felder bleiben, der Text entfällt. */
export function fromCloze(section: Container): Container {
  const { cloze: _text, ...rest } = section
  return rest
}
