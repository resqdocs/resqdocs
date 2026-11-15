// Abhaengigkeiten zwischen Elementen (Einsatz) - reine Logik, node-getestet.
//
// Zwei Arten, beide ueber dieselbe Bedingung „im Auswahlfeld X ist eine dieser Optionen gewaehlt":
//
//  1. Erscheinen (dependsOn): Feld, Abschnitt oder Funktion wird nur erhoben, wenn die Bedingungen
//     zutreffen - alle, oder mit match 'any' eine davon.
//  2. Inhalt (defaultWhen, nur Felder): solange eine Bedingung zutrifft, gilt ein anderer Standardwert.
//     Die erste zutreffende Regel gewinnt.
//
// Bewusst schmal: Bedingungen pruefen nur Auswahlfelder, keine Formeln, keine Verschachtelung.
//
// Umsetzung OHNE Eingriff in Renderer, Pflichtfeld- und Abweichungslogik:
//  - Erscheinen schaltet lediglich den bestehenden Zustand „erhoben / nicht erhoben" automatisch um.
//    `syncDependencies` schreibt dafuer einen als `auto` markierten Fuellzustand in die Einsatz-Werte
//    bzw. nimmt ihn wieder heraus.
//  - Inhalt aendert nichts an den Werten: `resolveDefaults` liefert die Vorlage mit den gerade
//    geltenden Standardwerten. Das Feld bleibt auf „Standardwert", nur dessen Text ist ein anderer.
//
// Von Hand geht vor: sobald der Anwender ein Element selbst umschaltet oder bearbeitet, steht dort ein
// Fuellzustand OHNE `auto` bzw. ein eigener Wert - beides fassen die Regeln nicht an.
//
// Aeltere App-Versionen kennen die Angaben nicht. Fuer das Erscheinen setzt der Editor deshalb
// zusaetzlich „Startet auf nicht erhoben" (defaultExcluded): dort bleibt das Element aus, bis man es
// von Hand einschaltet. Beim Inhalt gilt dort einfach der normale Standardwert.

import type { Condition, Container, Field, FieldFill, Node } from './model.ts'
import { defaultFill, fillValue, functionStatus, multiSelected } from './fill.ts'

type Values = Record<string, FieldFill>

interface Entry {
  node: Node
  parent: Container | null
}

function indexTree(root: Container): Map<string, Entry> {
  const index = new Map<string, Entry>()
  const walk = (node: Node, parent: Container | null): void => {
    index.set(node.id, { node, parent })
    if (node.type === 'container') for (const child of node.children) walk(child, node)
  }
  walk(root, null)
  return index
}

/** Von der Regel gesetzter Fuellzustand (nicht vom Anwender). */
export function isAutoFill(fill: FieldFill | undefined): boolean {
  return !!fill && (fill as { auto?: unknown }).auto === true
}

/** Hat der Anwender in diesem Einsatz selbst etwas erfasst? Von der Regel gesetzte Zustaende zaehlen nicht. */
export function hasManualInput(values: Values): boolean {
  for (const key in values) if (!isAutoFill(values[key])) return true
  return false
}

/** Nur die vom Anwender gesetzten Werte (fuer „gibt es etwas zu sichern?"). */
export function manualValues(values: Values): Values {
  const out: Values = {}
  for (const key in values) if (!isAutoFill(values[key])) out[key] = values[key]
  return out
}

function isExcluded(node: Node, values: Values): boolean {
  if (node.type === 'function') return functionStatus(node, values[node.id]) === 'excluded'
  if (node.type === 'container') return !!node.excludable && (values[node.id] ?? defaultFill(node)).state === 'excluded'
  return (values[node.id] ?? defaultFill(node)).state === 'excluded'
}

/** Steht das Element samt allen Abschnitten darueber auf „erhoben"? */
function isActive(entry: Entry, index: Map<string, Entry>, values: Values): boolean {
  let cur: Entry | undefined = entry
  while (cur) {
    if (cur.parent !== null && isExcluded(cur.node, values)) return false // die Wurzel ist nie „nicht erhoben"
    cur = cur.parent ? index.get(cur.parent.id) : undefined
  }
  return true
}

/** Ist die Bedingung vollstaendig und zeigt sie auf ein Auswahlfeld (nicht auf das Element selbst)? */
function validSource(condition: Condition | undefined, ownId: string, index: Map<string, Entry>): Field | null {
  if (!condition || typeof condition.fieldId !== 'string' || !Array.isArray(condition.options) || condition.options.length === 0) return null
  if (condition.fieldId === ownId) return null
  const source = index.get(condition.fieldId)?.node
  if (!source || source.type !== 'field' || !source.options?.some((o) => o !== '')) return null
  return source
}

function conditionMet(condition: Condition, source: Field, index: Map<string, Entry>, values: Values): boolean {
  const entry = index.get(source.id)
  if (!entry || !isActive(entry, index, values)) return false // ein nicht erhobenes Quellfeld loest nichts aus
  const fill = values[source.id]
  const chosen = source.multiple ? multiSelected(source, fill) : [fillValue(source, fill) ?? '']
  return condition.options.some((option) => option !== '' && chosen.includes(option))
}

/** Die gueltigen Bedingungen der Erscheinen-Regel eines Elements. Leer = Regel wirkungslos. Ungueltige
 *  Bedingungen (Feld fehlt, keine Option gewaehlt) werden uebergangen statt das Element fuer immer zu
 *  verstecken; ein Abschnitt muss ausserdem als „nicht erhoben" markierbar sein. */
function visibilityConditions(node: Node, index: Map<string, Entry>): Array<{ condition: Condition; source: Field }> {
  const dep = node.dependsOn
  if (!dep || !Array.isArray(dep.conditions)) return []
  if (node.type === 'container' && !node.excludable) return []
  const out: Array<{ condition: Condition; source: Field }> = []
  for (const condition of dep.conditions) {
    const source = validSource(condition, node.id, index)
    if (source) out.push({ condition, source })
  }
  return out
}

function visibilityMet(node: Node, conditions: Array<{ condition: Condition; source: Field }>, index: Map<string, Entry>, values: Values): boolean {
  const test = (c: { condition: Condition; source: Field }): boolean => conditionMet(c.condition, c.source, index, values)
  return node.dependsOn?.match === 'any' ? conditions.some(test) : conditions.every(test)
}

function autoFill(node: Node, shown: boolean): FieldFill {
  if (node.type === 'function') {
    return (shown ? { state: 'function', rows: [], auto: true } : { state: 'function', rows: [], status: 'excluded', auto: true }) as FieldFill
  }
  return (shown ? { state: 'confirmed', auto: true } : { state: 'excluded', auto: true }) as FieldFill
}

/**
 * Erscheinen-Regeln auf die Einsatz-Werte anwenden. Gibt DIESELBE Referenz zurueck, wenn nichts zu
 * aendern ist (der Aufrufer kann daran erkennen, dass er nichts schreiben muss).
 *
 * Je Element mit gueltiger Regel:
 *  - Anwender hat es selbst gesetzt (Eintrag ohne `auto`): unangetastet.
 *  - Gewuenschter Zustand = Ausgangszustand der Vorlage: kein Eintrag noetig, ein `auto`-Eintrag entfaellt.
 *  - sonst: `auto`-Eintrag fuer den gewuenschten Zustand.
 * Ketten (A schaltet B, B schaltet C) loesen sich durch Wiederholen bis zur Ruhe; die Zahl der Durchlaeufe
 * ist durch die Zahl der Elemente begrenzt, ein Kreis kann also nicht haengen bleiben.
 */
export function syncDependencies(root: Container, values: Values): Values {
  const index = indexTree(root)
  const dependents: Array<{ node: Node; conditions: Array<{ condition: Condition; source: Field }> }> = []
  for (const { node } of index.values()) {
    const conditions = visibilityConditions(node, index)
    if (conditions.length) dependents.push({ node, conditions })
  }
  if (dependents.length === 0) return values

  let current = values
  for (let pass = 0; pass <= dependents.length; pass++) {
    let next: Values | null = null
    for (const { node, conditions } of dependents) {
      const fill = current[node.id]
      if (fill !== undefined && !isAutoFill(fill)) continue // von Hand geht vor
      const shown = visibilityMet(node, conditions, index, next ?? current)
      const startsShown = defaultFill(node).state !== 'excluded'
      if (shown === startsShown) {
        if (fill !== undefined) {
          next = next ?? { ...current }
          delete next[node.id]
        }
        continue
      }
      const isShownNow = fill !== undefined && !isExcluded(node, { [node.id]: fill })
      if (fill === undefined || isShownNow !== shown) {
        next = next ?? { ...current }
        next[node.id] = autoFill(node, shown)
      }
    }
    if (next === null) break
    current = next
  }
  return current
}

/**
 * Elemente, die die Regel im Einsatz-Formular ausblendet: gueltige Regel, Bedingungen nicht erfuellt und
 * vom Anwender nicht selbst gesetzt. Auf bereits abgeglichenen Werten aufrufen (nach syncDependencies).
 */
export function hiddenByDependency(root: Container, values: Values): Set<string> {
  const index = indexTree(root)
  const hidden = new Set<string>()
  for (const { node } of index.values()) {
    const conditions = visibilityConditions(node, index)
    if (!conditions.length) continue
    const fill = values[node.id]
    if (fill !== undefined && !isAutoFill(fill)) continue
    if (!visibilityMet(node, conditions, index, values)) hidden.add(node.id)
  }
  return hidden
}

/** Der gerade geltende Standardwert eines Feldes aus `defaultWhen`, sonst undefined (= normaler `default`).
 *  Bei einem Auswahlfeld zaehlt eine Regel nur, wenn ihr Wert eine seiner Optionen ist. */
function conditionalDefault(field: Field, index: Map<string, Entry>, values: Values): string | undefined {
  if (!Array.isArray(field.defaultWhen)) return undefined
  const options = field.options?.filter((o) => o !== '') ?? []
  for (const rule of field.defaultWhen) {
    if (typeof rule?.value !== 'string') continue
    if (options.length && !options.includes(rule.value)) continue
    const source = validSource(rule, field.id, index)
    if (source && conditionMet(rule, source, index, values)) return rule.value
  }
  return undefined
}

function withDefaults(node: Node, defaults: ReadonlyMap<string, string>): Node {
  if (node.type === 'container') {
    let changed = false
    const children = node.children.map((child) => {
      const next = withDefaults(child, defaults)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  const value = defaults.get(node.id)
  return node.type === 'field' && value !== undefined && value !== node.default ? { ...node, default: value } : node
}

/**
 * Die Vorlage mit den gerade geltenden Standardwerten (Inhalt-Regeln, `defaultWhen`). Unveraenderte
 * Teilbaeume behalten ihre Identitaet; greift keine Regel, kommt DIESELBE Referenz zurueck.
 *
 * Ein abhaengiger Standardwert kann selbst wieder Bedingung fuer ein anderes Feld sein; deshalb wird bis
 * zur Ruhe wiederholt, begrenzt durch die Zahl der Felder mit Regeln.
 */
export function resolveDefaults(root: Container, values: Values): Container {
  const rooted = indexTree(root)
  const fields: Field[] = []
  for (const { node } of rooted.values()) if (node.type === 'field' && node.defaultWhen?.length) fields.push(node)
  if (fields.length === 0) return root

  let current = root
  let applied = new Map<string, string>()
  for (let pass = 0; pass <= fields.length; pass++) {
    const index = pass === 0 ? rooted : indexTree(current)
    const next = new Map<string, string>()
    for (const field of fields) {
      const value = conditionalDefault(field, index, values) // Regeln stehen am Feld der Vorlage, gelesen wird der aktuelle Stand
      if (value !== undefined) next.set(field.id, value)
    }
    const same = next.size === applied.size && [...next].every(([id, value]) => applied.get(id) === value)
    if (same) break
    applied = next
    current = withDefaults(root, applied) as Container
  }
  return current
}

/** Kennungen eines Elements samt allem darunter. */
function subtreeIds(node: Node, into: Set<string> = new Set()): Set<string> {
  into.add(node.id)
  if (node.type === 'container') for (const child of node.children) subtreeIds(child, into)
  return into
}

/** Alle Quellfelder, auf die die Regeln eines Elements zeigen (Erscheinen und Inhalt). */
function sourceIds(node: Node): string[] {
  const ids: string[] = []
  for (const c of node.dependsOn?.conditions ?? []) if (typeof c?.fieldId === 'string') ids.push(c.fieldId)
  if (node.type === 'field') for (const r of node.defaultWhen ?? []) if (typeof r?.fieldId === 'string') ids.push(r.fieldId)
  return ids
}

/**
 * Auswahlfelder, von denen dieses Element abhaengen darf (fuer den Editor). Nicht dabei: das Element
 * selbst, alles darunter, und Felder, die ihrerseits - direkt, ueber eine Kette oder ueber einen
 * Abschnitt, in dem sie liegen - von diesem Element abhaengen (sonst entstuende ein Kreis).
 */
export function dependencyCandidates(root: Container, node: Node): Field[] {
  const index = indexTree(root)
  const own = subtreeIds(node)
  // Folgt von einem Element aus den Regeln (Quellfelder) und den Abschnitten darueber. Landet der Weg bei
  // diesem Element oder etwas darunter, haengt der Kandidat schon von ihm ab.
  const dependsOnOwn = (start: Node): boolean => {
    const seen = new Set<string>()
    const stack: Node[] = [start]
    while (stack.length) {
      const cur = stack.pop() as Node
      if (seen.has(cur.id)) continue
      seen.add(cur.id)
      if (own.has(cur.id)) return true
      const parent = index.get(cur.id)?.parent
      if (parent) stack.push(parent)
      for (const id of sourceIds(cur)) {
        const source = index.get(id)?.node
        if (source) stack.push(source)
      }
    }
    return false
  }
  const out: Field[] = []
  for (const { node: candidate } of index.values()) {
    if (candidate.type !== 'field' || !candidate.options?.some((o) => o !== '')) continue
    if (own.has(candidate.id) || dependsOnOwn(candidate)) continue
    out.push(candidate)
  }
  return out
}

/**
 * Verweise auf umbenannte Kennungen nachziehen (Quellfelder der Regeln). Fuer das Umbenennen im Editor
 * und fuer Kopien mit frisch vergebenen Kennungen (Vorlage duplizieren, Abschnitt einfuegen). Verweise
 * auf Kennungen, die nicht in `renamed` stehen, bleiben wie sie sind. Nichts zu tun -> selbe Referenz.
 */
export function remapDependencyIds<T extends Node>(node: T, renamed: ReadonlyMap<string, string>): T {
  if (renamed.size === 0) return node
  let out: Node = node
  const moved = <C extends Condition>(list: readonly C[]): C[] | null => {
    let changed = false
    const next = list.map((c) => {
      const target = typeof c?.fieldId === 'string' ? renamed.get(c.fieldId) : undefined
      if (target === undefined || target === c.fieldId) return c
      changed = true
      return { ...c, fieldId: target }
    })
    return changed ? next : null
  }
  if (out.dependsOn && Array.isArray(out.dependsOn.conditions)) {
    const conditions = moved(out.dependsOn.conditions)
    if (conditions) out = { ...out, dependsOn: { ...out.dependsOn, conditions } }
  }
  if (out.type === 'field' && Array.isArray(out.defaultWhen)) {
    const rules = moved(out.defaultWhen)
    if (rules) out = { ...out, defaultWhen: rules }
  }
  if (out.type === 'container') {
    let changed = false
    const children = out.children.map((child) => {
      const next = remapDependencyIds(child, renamed)
      if (next !== child) changed = true
      return next
    })
    if (changed) out = { ...out, children }
  }
  return out as T
}
