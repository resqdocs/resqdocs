// Struktur-Kurzbeschreibung eines Bausteins (Block): zaehlt ALLE verschachtelten Elemente nach Typ,
// nicht nur die direkten Kinder. Ein Container mit 2 Unter-Containern und 5 Feldern zeigt so
// „2 Container · 5 Felder" statt irrefuehrend „2 Eintraege" (Maintainer-Feedback 2026-07-03).
import type { Container, Node } from '@resqdocs/protocol-core/model'

export interface NodeCounts {
  containers: number
  fields: number
  functions: number
}

/** Alle NACHFAHREN (rekursiv, ohne die Wurzel selbst) nach Typ zaehlen. */
export function countDescendants(root: Container): NodeCounts {
  const counts: NodeCounts = { containers: 0, fields: 0, functions: 0 }
  const walk = (n: Node): void => {
    if (n.type !== 'container') return
    for (const c of n.children) {
      if (c.type === 'container') counts.containers++
      else if (c.type === 'field') counts.fields++
      else if (c.type === 'function') counts.functions++
      walk(c)
    }
  }
  walk(root)
  return counts
}

/** „2 Container · 5 Felder · 1 Funktion" (Null-Kategorien weggelassen, Singular/Plural); leer -> „leer". */
export function blockStructureLabel(root: Container): string {
  const { containers, fields, functions } = countDescendants(root)
  const parts: string[] = []
  if (containers) parts.push(`${containers} Container`)
  if (fields) parts.push(`${fields} ${fields === 1 ? 'Feld' : 'Felder'}`)
  if (functions) parts.push(`${functions} ${functions === 1 ? 'Funktion' : 'Funktionen'}`)
  return parts.length ? parts.join(' · ') : 'leer'
}
