// Optionen einer Auswahl als Arbeitsliste bearbeiten (Optionen-Editor in App und Online-Editor).
//
// Im Fenster „Optionen bearbeiten“ ändert man eine Kopie; erst „Übernehmen“ schreibt sie ins Feld. Jede Zeile
// hat eine feste Kennung (`key`) und merkt sich ihren Ausgangstext (`from`). So bleibt eine Option dieselbe,
// auch wenn man ihren Text ändert: Standard und „allein“ hängen an der Zeile, und beim Übernehmen ziehen
// Verweise im ganzen Baum mit (Bedingungen anderer Elemente, abhängige Standardwerte).
//
// Das Vorlagenformat bleibt unverändert: am Feld stehen weiter `options`, `default`, `exclusiveOptions` und
// `defaultEmpty` als exakte Texte. Ältere App-Versionen lesen das Ergebnis also ohne Weiteres.
import type { Condition, ConditionalDefault, Container, Field, Node } from './model.ts'
import { findNode } from './creator.ts'

export interface OptionRow {
  key: string
  text: string
  /** Text der Option beim Öffnen; fehlt bei neu angelegten Zeilen. */
  from?: string
  /** Wert, wie er im Feld stand (bei alten oder eingeführten Vorlagen auch eine Zahl). Eine unveränderte Zeile
   *  schreibt genau diesen Wert zurück. */
  raw?: unknown
}

export interface OptionDraft {
  rows: OptionRow[]
  /** Ausdrücklich gesetzter Standard (Zeilen-Kennung). null = keiner gesetzt: dann gilt die oberste Option,
   *  bei Mehrfachauswahl mit `defaultEmpty` gar keine. */
  defaultKey: string | null
  /** Zeilen, die bei Mehrfachauswahl „allein“ stehen (schließen andere aus). */
  exclusive: string[]
  /** Mehrfachauswahl startet ohne Auswahl. */
  defaultEmpty: boolean
  /** Mehrfachauswahl (nur Lesewert: der Schalter bleibt im Eigenschaften-Panel). */
  multiple: boolean
  /** Zeile, an die der Standard beim Öffnen gebunden war (für doppelte alte Optionen). */
  boundDefault?: string | null
  /** Einträge im Feld, die keine Option sein können (z. B. null, Objekte aus fremden Dateien). Sie waren nie
   *  wählbar und fallen bei einer echten Änderung weg; das Fenster sagt es vorher. */
  ignored: number
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()
/** Gilt als Option: nicht leerer Text, außerdem Zahl oder Wahrheitswert (kommen in eingeführten Dateien vor und
 *  werden in der App als Text gezeigt). Alles andere war nie wählbar. */
const isOptionValue = (o: unknown): boolean => (typeof o === 'string' && o !== '') || typeof o === 'number' || typeof o === 'boolean'
/** Vergleichsschlüssel eines Werts (Option, Standard, Bedingung): als Text, damit 5 und "5" dasselbe meinen. */
const keyOf = (o: unknown): string => String(o)
/** Wert, der ins Feld geht: eine unveränderte Zeile behält ihren Wert exakt (alter Leerraum, Zahlen), nur geänderte
 *  und neue Zeilen werden als geglätteter Text geschrieben. So ändert Übernehmen nichts, was niemand angefasst hat. */
const finalValue = (r: OptionRow): string => (r.from !== undefined && r.text === r.from ? (r.raw as string) : clean(r.text))
const listOf = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

/** Arbeitsliste aus dem Feld. Leere Platzhalter-Zeilen fallen weg. `nextKey` liefert eindeutige Kennungen. */
export function draftFromField(field: Field, nextKey: () => string): OptionDraft {
  const all = listOf(field.options)
  const rows: OptionRow[] = all.filter(isOptionValue).map((o) => ({ key: nextKey(), text: keyOf(o), from: keyOf(o), raw: o }))
  const byText = (t: unknown): string | null => (t === undefined || t === null ? null : rows.find((r) => r.from === keyOf(t))?.key ?? null)
  const exclusiveKeys = new Set(listOf(field.exclusiveOptions).map(keyOf))
  const exclusive = rows.filter((r) => exclusiveKeys.has(r.from!)).map((r) => r.key)
  const bound = byText(field.default)
  return {
    rows,
    defaultKey: bound,
    boundDefault: bound,
    exclusive: [...new Set(exclusive)],
    defaultEmpty: field.multiple === true && field.defaultEmpty === true,
    multiple: field.multiple === true,
    ignored: all.filter((o) => o !== '' && !isOptionValue(o)).length,
  }
}

/** Die Zeile, die im Einsatz vorausgewählt ist (deckungsgleich mit fillValue), oder null. */
export function effectiveDefaultKey(d: OptionDraft): string | null {
  if (d.multiple && d.defaultEmpty) return null
  const filled = d.rows.filter((r) => clean(r.text) !== '')
  if (d.defaultKey && filled.some((r) => r.key === d.defaultKey)) return d.defaultKey
  return filled[0]?.key ?? null
}

export interface RowsAdded {
  draft: OptionDraft
  /** Kennungen der neuen Zeilen, in Reihenfolge */
  added: string[]
  duplicates: number
}

/** Mehrere Zeilen auf einmal anlegen (eine Option pro Zeile, wie „Liste einfügen“). Leerzeilen fallen weg,
 *  Leerraum wird zu einem Leerzeichen, schon Vorhandenes wird nicht doppelt angelegt. Neue Zeilen kommen hinter
 *  `afterKey`, sonst ans Ende. */
export function addLines(d: OptionDraft, text: string, nextKey: () => string, afterKey?: string): RowsAdded {
  const seen = new Set(d.rows.map((r) => clean(r.text)).filter(Boolean))
  const fresh: OptionRow[] = []
  let duplicates = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw)
    if (!line) continue
    if (seen.has(line)) {
      duplicates++
      continue
    }
    seen.add(line)
    fresh.push({ key: nextKey(), text: line })
  }
  if (!fresh.length) return { draft: d, added: [], duplicates }
  const at = afterKey ? d.rows.findIndex((r) => r.key === afterKey) : -1
  const rows = at < 0 ? [...d.rows, ...fresh] : [...d.rows.slice(0, at + 1), ...fresh, ...d.rows.slice(at + 1)]
  return { draft: { ...d, rows }, added: fresh.map((r) => r.key), duplicates }
}

/** Leere Zeile anlegen (hinter `afterKey`, sonst am Ende), z. B. für Enter in der Tabelle. */
export function addEmptyRow(d: OptionDraft, key: string, afterKey?: string): OptionDraft {
  const row: OptionRow = { key, text: '' }
  const at = afterKey ? d.rows.findIndex((r) => r.key === afterKey) : -1
  const rows = at < 0 ? [...d.rows, row] : [...d.rows.slice(0, at + 1), row, ...d.rows.slice(at + 1)]
  return { ...d, rows }
}

export function setRowText(d: OptionDraft, key: string, text: string): OptionDraft {
  return { ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, text } : r)) }
}

export function removeRows(d: OptionDraft, keys: readonly string[]): OptionDraft {
  const gone = new Set(keys)
  return {
    ...d,
    rows: d.rows.filter((r) => !gone.has(r.key)),
    defaultKey: d.defaultKey && gone.has(d.defaultKey) ? null : d.defaultKey,
    exclusive: d.exclusive.filter((k) => !gone.has(k)),
  }
}

/** Zeile an Platz `to` der Liste schieben (gezählt in der Liste ohne die Zeile). */
export function moveRow(d: OptionDraft, key: string, to: number): OptionDraft {
  const from = d.rows.findIndex((r) => r.key === key)
  if (from < 0) return d
  const rest = d.rows.filter((r) => r.key !== key)
  const at = Math.max(0, Math.min(to, rest.length))
  if (at === from) return d
  return { ...d, rows: [...rest.slice(0, at), d.rows[from], ...rest.slice(at)] }
}

/** Standard setzen. „Standard weicht“ (die Standard-Option steht „allein“) wandert mit, wie im Panel. */
export function setDefaultRow(d: OptionDraft, key: string): OptionDraft {
  const old = effectiveDefaultKey(d)
  if (old === key) return d
  const yields = old !== null && d.exclusive.includes(old)
  const exclusive = yields && old !== key ? [...new Set([...d.exclusive.filter((k) => k !== old), key])] : d.exclusive
  return { ...d, defaultKey: key, defaultEmpty: false, exclusive }
}

export function setExclusive(d: OptionDraft, key: string, on: boolean): OptionDraft {
  const exclusive = on ? [...new Set([...d.exclusive, key])] : d.exclusive.filter((k) => k !== key)
  return { ...d, exclusive }
}

export function setDefaultEmpty(d: OptionDraft, on: boolean): OptionDraft {
  // Der gesetzte Standard bleibt in der Arbeitsliste stehen: schaltet man „ohne Vorauswahl“ wieder aus, gilt er
  // wieder. Ins Feld kommt er bei „ohne Vorauswahl“ nicht (planFieldPatch).
  return { ...d, defaultEmpty: d.multiple && on }
}

export interface DraftProblems {
  /** Zeilen ohne Text: fallen beim Übernehmen weg */
  empty: number
  /** Texte, die mehr als einmal vorkommen: so nicht übernehmbar */
  duplicates: string[]
  /** Kennungen der doppelten Zeilen (zum Markieren) */
  duplicateKeys: string[]
}

export function draftProblems(d: OptionDraft): DraftProblems {
  const count = new Map<string, number>()
  for (const r of d.rows) {
    const t = clean(r.text)
    if (t) count.set(t, (count.get(t) ?? 0) + 1)
  }
  const duplicates = [...count].filter(([, n]) => n > 1).map(([t]) => t)
  return {
    empty: d.rows.filter((r) => !clean(r.text)).length,
    duplicates,
    duplicateKeys: d.rows.filter((r) => duplicates.includes(clean(r.text))).map((r) => r.key),
  }
}

/** Hat sich gegenüber dem Feld etwas geändert? Verglichen wird mit der unberührten Arbeitsliste, damit
 *  Altlasten im Feld (leere Platzhalter, ein Standard, der keine Option ist) nicht als Änderung zählen. */
export function draftChanged(field: Field, d: OptionDraft): boolean {
  let n = 0
  const base = planFieldPatch(field, draftFromField(field, () => `b${n++}`))
  return JSON.stringify(planFieldPatch(field, d)) !== JSON.stringify(base)
}

export interface AffectedRef {
  /** Element, dessen Regel eine Option verliert */
  id: string
  label: string
  /** verlorene Optionen */
  options: string[]
}

export interface OptionPlan {
  /** neue Werte am Feld */
  fieldPatch: Record<string, unknown>
  /** alter Text -> neuer Text, für Verweise */
  renamed: Map<string, string>
  /** Optionen, die es danach nicht mehr gibt */
  removed: string[]
  /** Regeln, die dadurch eine Option verlieren (Hinweis vor dem Übernehmen) */
  affected: AffectedRef[]
  /** Entfernte Optionen, deren Text eine umbenannte Zeile übernimmt: so nicht übernehmbar */
  collisions: string[]
}

function planFieldPatch(field: Field, d: OptionDraft): Record<string, unknown> {
  const rows = d.rows.map((r) => ({ ...r, value: finalValue(r) })).filter((r) => clean(r.text))
  const textOf = (key: string | null): string | undefined => {
    const row = key ? rows.find((r) => r.key === key) : undefined
    if (!row) return undefined
    // Doppelte alte Option: wurde die Zeile mit dem Standard umbenannt, behält aber eine andere Zeile den alten Text,
    // bleibt der Standard beim alten Text (er gilt ja weiter).
    if (row.from !== undefined && row.text !== row.from && key === d.boundDefault) {
      const twin = rows.find((r) => r.from === row.from && r.text === r.from)
      if (twin) return twin.value
    }
    return row.value
  }
  const oldKeys = new Set(listOf(field.options).filter(isOptionValue).map(keyOf))
  const patch: Record<string, unknown> = {}
  if (!rows.length) {
    // Keine Optionen mehr: das Feld wird wieder ein Textfeld (wie beim Löschen der letzten Option).
    patch.options = undefined
    patch.allowCustom = undefined
    patch.customMultiline = undefined
    patch.multiple = undefined
    patch.exclusiveOptions = undefined
    patch.multiSeparator = undefined
    patch.defaultEmpty = undefined
    if (field.default !== undefined && oldKeys.has(keyOf(field.default))) patch.default = undefined
    else patch.default = field.default
    return patch
  }
  patch.options = rows.map((r) => r.value)
  const empty = field.multiple === true && d.defaultEmpty
  // Ausdrücklich gesetzter Standard bleibt ausdrücklich; war keiner gesetzt (es gilt die oberste Option), bleibt
  // das Feld ohne `default`. So ändert ein bloßes Öffnen und Übernehmen nichts.
  // Ein Standard, der keine Option ist (z. B. aus der Zeit vor der Liste), wirkt nicht und bleibt unangetastet,
  // solange keine Option so heißt.
  const stale = field.default !== undefined && field.default !== null && !oldKeys.has(keyOf(field.default)) && !rows.some((r) => keyOf(r.value) === keyOf(field.default))
  patch.default = empty ? undefined : textOf(d.defaultKey) ?? (stale ? field.default : undefined)
  const exclusive = rows.filter((r) => d.exclusive.includes(r.key)).map((r) => r.value)
  patch.exclusiveOptions = exclusive.length ? exclusive : undefined
  patch.defaultEmpty = empty ? true : undefined
  return patch
}

/** Was „Übernehmen“ am Feld und im Baum ändern würde. */
export function planOptionEdit(root: Container, fieldId: string, d: OptionDraft): OptionPlan {
  const field = findNode(root, fieldId)
  if (!field || field.type !== 'field') return { fieldPatch: {}, renamed: new Map(), removed: [], collisions: [], affected: [] }
  const fieldPatch = planFieldPatch(field, d)
  const renamed = new Map<string, string>()
  const removed: string[] = []
  // Entscheidend ist die Zeile, nicht der Text: so stimmen auch Tausch und Ketten („leicht“ -> „mittel“,
  // „mittel“ -> „schwer“). Eine entfernte Option, die als neue Zeile mit gleichem Text wiederkommt, bleibt gültig.
  for (const old of new Set(listOf(field.options).filter(isOptionValue).map(keyOf))) {
    const rows = d.rows.filter((r) => r.from === old && clean(r.text) !== '')
    // Doppelte alte Option: behält eine der Zeilen den Text, gibt es die Option weiter - kein Umbenennen.
    if (rows.some((r) => keyOf(finalValue(r)) === old)) continue
    const row = rows[0]
    if (row) renamed.set(old, finalValue(row))
    else if (!d.rows.some((r) => r.from === undefined && keyOf(finalValue(r)) === old)) removed.push(old)
  }
  // Eine Option wird entfernt und eine andere bekommt ihren Text: dann wüsste keine Regel mehr, welche gemeint ist.
  // Das Fenster lässt so nicht übernehmen (erst die eine übernehmen, dann die andere umbenennen).
  const collisions = removed.filter((t) => [...renamed.values()].some((v) => keyOf(v) === t))
  return { fieldPatch, renamed, removed, collisions, affected: affectedBy(root, fieldId, removed) }
}

const labelOf = (n: Node): string => n.title?.trim() || n.id

function affectedBy(root: Container, fieldId: string, removed: readonly string[]): AffectedRef[] {
  if (!removed.length) return []
  const out: AffectedRef[] = []
  const walk = (n: Node): void => {
    const lost = new Set<string>()
    for (const c of listOf(n.dependsOn?.conditions) as Condition[]) if (c?.fieldId === fieldId) for (const o of listOf(c.options)) if (removed.includes(keyOf(o))) lost.add(keyOf(o))
    if (n.type === 'field') {
      for (const r of listOf(n.defaultWhen) as ConditionalDefault[]) {
        if (r?.fieldId === fieldId) for (const o of listOf(r.options)) if (removed.includes(keyOf(o))) lost.add(keyOf(o))
        if (n.id === fieldId && r && removed.includes(keyOf(r.value))) lost.add(keyOf(r.value)) // eigene Regel setzt eine entfallende Option
      }
    }
    if (lost.size) out.push({ id: n.id, label: labelOf(n), options: [...lost] })
    if (n.type === 'container') n.children.forEach(walk)
  }
  walk(root)
  return out
}

/** Übernehmen: Feld ändern und Verweise im ganzen Baum nachziehen. `extraPatch` ergänzt das Feld (z. B. aus
 *  einem Textfeld wird eine Auswahl: „mehrzeilig“ zurücksetzen). Ohne Änderung: selbe Referenz. */
export function applyOptionEdit(root: Container, fieldId: string, plan: OptionPlan, extraPatch: Record<string, unknown> = {}): Container {
  const field = findNode(root, fieldId)
  if (!field || field.type !== 'field') return root
  const gone = new Set(plan.removed)
  // Entfernte Optionen fallen aus einer Bedingung nur, wenn darin noch eine andere steht. Eine Bedingung ohne Option
  // würde übergangen und die Regel griffe dann öfter als vorher; mit der alten Option trifft sie wie bisher nie zu.
  const mapOptions = (raw: unknown): string[] => {
    const list = listOf(raw) as string[]
    const kept = list.filter((o) => !gone.has(keyOf(o)))
    return (kept.length ? kept : list).map((o) => plan.renamed.get(keyOf(o)) ?? o)
  }
  const touchesRefs = plan.renamed.size > 0 || gone.size > 0

  const walk = (n: Node): Node => {
    let out: Node = n
    if (touchesRefs && out.dependsOn && Array.isArray(out.dependsOn.conditions) && out.dependsOn.conditions.some((c) => c?.fieldId === fieldId)) {
      out = { ...out, dependsOn: { ...out.dependsOn, conditions: out.dependsOn.conditions.map((c) => (c?.fieldId === fieldId ? { ...c, options: mapOptions(c.options) } : c)) } }
    }
    if (out.type === 'field') {
      let rules = Array.isArray(out.defaultWhen) ? out.defaultWhen : out.defaultWhen
      if (touchesRefs && Array.isArray(rules) && rules.some((r) => r?.fieldId === fieldId)) rules = rules.map((r) => (r?.fieldId === fieldId ? { ...r, options: mapOptions(r.options) } : r))
      if (out.id === fieldId) {
        // eigene Regeln setzen eine eigene Option: umbenannt mitziehen, entfallen -> Regel entfällt
        if (touchesRefs && Array.isArray(rules) && rules.length) rules = rules.filter((r) => !r || !gone.has(keyOf(r.value))).map((r) => (r && plan.renamed.has(keyOf(r.value)) ? { ...r, value: plan.renamed.get(keyOf(r.value))! } : r))
        out = { ...out, ...plan.fieldPatch, ...extraPatch, type: 'field' } as Field
      }
      if (rules !== out.defaultWhen) out = { ...out, defaultWhen: rules && rules.length ? rules : undefined }
    }
    if (out.type === 'container') {
      let changed = false
      const children = out.children.map((c) => {
        const next = walk(c)
        if (next !== c) changed = true
        return next
      })
      if (changed) out = { ...out, children }
    }
    return out
  }
  return walk(root) as Container
}
