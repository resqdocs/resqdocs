// templateNeeds.ts — was eine Vorlage von der App verlangt, und was eine App an einer Vorlage nicht kennt.
//
// Die Formatversion bleibt 1: Neue Eigenschaften kommen additiv dazu, eine ältere App liest die Vorlage weiter,
// beachtet das Neue aber nicht. Damit das beim Import nicht still passiert, gibt es zwei Wege (rein, node-testbar):
//  1. Vermerk im Export (`requires`): welche Funktionen die Vorlage nutzt und ab welcher App-Version es sie gibt,
//     mit Namen im Klartext. So kann auch eine App, die die Funktion selbst nicht kennt, sie benennen.
//  2. Unbekannte Eigenschaften: Die App meldet, was sie an den Elementen nicht kennt. Das greift auch bei Dateien
//     ohne Vermerk (von Hand oder von einem Sprachmodell geschrieben, ältere Exporte).
// Quelle der Mindestversionen ist ai-docs/feature-versions.json; sie wird als Parameter übergeben, damit dieses
// Modul ohne Bundler-Alias im Node-Test läuft.
import { compareVersions, versionGte } from './version.ts'
import type { Container, FunctionKind, Node } from './model.ts'
import { isFunction } from './model.ts'

export interface FieldGate {
  prop: string
  on: string
  de: string
  en: string
  note_de: string
  note_en: string
  minVersion: string
}
export interface FunctionGate {
  kind: FunctionKind
  de: string
  en: string
  minVersion: string
}
export interface FeatureVersions {
  baseline: string
  fields: FieldGate[]
  functions: FunctionGate[]
}

type NodeType = Node['type']

/**
 * Einträge, die KEINE Eigenschaft eines Vorlagen-Knotens sind und deshalb nicht am Baum prüfbar:
 * `vollmacht` betrifft die Einsatz-Eingabe (Häkchen an Kontaktpersonen), nicht die Vorlage.
 */
export const NOT_IN_TEMPLATE = new Set(['vollmacht'])

/**
 * Eigenschaften, bei denen schon ein LEERER Text etwas bedeutet: `config.lineEnd = ''` heißt „nichts am
 * Zeilenende“, eine ältere App setzt dort ihren festen Standard - die Ausgabe weicht also ab.
 */
export const EMPTY_STRING_MEANINGFUL = new Set(['config.lineEnd'])

/** Wert einer Eigenschaft, auch verschachtelt („config.lineEnd“). */
export function propValue(node: unknown, prop: string): unknown {
  let v: unknown = node
  for (const key of prop.split('.')) {
    if (v == null || typeof v !== 'object') return undefined
    v = (v as Record<string, unknown>)[key]
  }
  return v
}

/** `on` ist ein Knotentyp oder eine Liste („field, container, function“). */
export function gateTargets(gate: Pick<FieldGate, 'on'>): NodeType[] {
  return gate.on.split(',').map((s) => s.trim()).filter(Boolean) as NodeType[]
}

/**
 * Wird die Eigenschaft wirklich genutzt? Ein ausdrücklich abgeschalteter oder leerer Wert (false, '', [], {})
 * ändert für eine ältere App nichts.
 */
export function isUsed(value: unknown): boolean {
  if (value == null || value === false || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return true
}

/** Nutzt der Knoten die gegatete Eigenschaft? */
export function usesGate(n: Node, gate: FieldGate): boolean {
  if (!gateTargets(gate).includes(n.type)) return false
  const value = propValue(n, gate.prop)
  return EMPTY_STRING_MEANINGFUL.has(gate.prop) ? typeof value === 'string' : isUsed(value)
}

/** Eine Funktion, die die Vorlage nutzt: Name im Klartext und die App-Version, ab der es sie gibt. */
export interface Need {
  /** Eigenschaft („multiple“) bzw. „function:<kind>“; daran erkennt der Import, was der Vermerk schon abdeckt. */
  key: string
  name: string
  since: string
}
/** Vermerk im Export: höchste nötige App-Version und die Funktionen dazu. */
export interface Needs {
  app: string
  features: Need[]
}

function walk(root: Container, visit: (n: Node) => void): void {
  const go = (n: Node): void => {
    visit(n)
    if (n.type === 'container') n.children.forEach(go)
  }
  go(root)
}

/**
 * Was die Vorlagen oberhalb der Grundversion brauchen. `null`, wenn jede App-Version sie vollständig darstellt
 * (dann bleibt die Datei ohne Vermerk, genau wie bisher).
 */
export function templateNeeds(fv: FeatureVersions, roots: readonly Container[]): Needs | null {
  const found = new Map<string, Need>()
  const add = (key: string, name: string, since: string): void => {
    if (versionGte(fv.baseline, since)) return
    // Dieselbe Eigenschaft kann je Elementart ab einer anderen Version gelten (z. B. an Feld und Funktion).
    found.set(`${key}|${since}|${name}`, { key, name, since })
  }
  const gates = fv.fields.filter((g) => !NOT_IN_TEMPLATE.has(g.prop))
  for (const root of roots) {
    walk(root, (n) => {
      if (isFunction(n)) {
        const f = fv.functions.find((x) => x.kind === n.functionKind)
        if (f) add(`function:${f.kind}`, f.de, f.minVersion)
      }
      for (const g of gates) if (usesGate(n, g)) add(g.prop, g.de, g.minVersion)
    })
  }
  if (!found.size) return null
  const features = [...found.values()].sort((a, b) => compareVersions(a.since, b.since) || a.name.localeCompare(b.name, 'de'))
  return { app: features[features.length - 1].since, features }
}

const VERSION = /^\d+(\.\d+){0,2}$/

/** Vermerk aus einer fremden Datei lesen: nur wohlgeformte Einträge, sonst `null` (nie ein Importfehler). */
export function parseNeeds(x: unknown): Needs | null {
  const list = (x as { features?: unknown } | null)?.features
  if (!Array.isArray(list)) return null
  const features: Need[] = []
  for (const f of list.slice(0, 200)) {
    const o = f as { key?: unknown; name?: unknown; since?: unknown } | null
    if (typeof o?.name !== 'string' || typeof o.since !== 'string' || !VERSION.test(o.since)) continue
    const name = o.name.trim().slice(0, 80)
    if (name) features.push({ key: typeof o.key === 'string' ? o.key.slice(0, 80) : '', name, since: o.since })
  }
  if (!features.length) return null
  features.sort((a, b) => compareVersions(a.since, b.since))
  return { app: features[features.length - 1].since, features }
}

/** Vermerke mehrerer Vorlagen einer Sammlung zusammenführen. */
export function mergeNeeds(all: readonly (Needs | null | undefined)[]): Needs | null {
  return parseNeeds({ features: all.flatMap((n) => n?.features ?? []).filter((f, i, a) => a.findIndex((g) => g.name === f.name && g.since === f.since) === i) })
}

/**
 * Eigenschaften, die diese App-Version an einem Element kennt. Muss zu model.ts passen: Der Test vergleicht die
 * Liste mit dem daraus erzeugten Schema (ai-docs/generated/schema.json).
 */
export const KNOWN_PROPS: Record<NodeType, readonly string[]> = {
  container: ['blankLineBefore', 'children', 'cloze', 'collapsible', 'defaultExcluded', 'dependsOn', 'emptyText', 'excludable', 'heading', 'id', 'inline', 'noSeparatorBefore', 'separator', 'showTitle', 'title', 'titleInline', 'type'],
  field: ['allowCustom', 'blankLineBefore', 'customMultiline', 'default', 'defaultEmpty', 'defaultExcluded', 'defaultWhen', 'dependsOn', 'exclusiveOptions', 'heading', 'id', 'inline', 'multiSeparator', 'multiline', 'multiple', 'noSeparatorBefore', 'options', 'required', 'showTitle', 'title', 'titleInline', 'type'],
  function: ['blankLineBefore', 'config', 'default', 'defaultExcluded', 'dependsOn', 'functionKind', 'heading', 'id', 'inline', 'noSeparatorBefore', 'required', 'showTitle', 'title', 'titleInline', 'type'],
}

/** Was die App an den Vorlagen nicht kennt: Eigenschaften der Elemente und Funktionsarten. */
export function unknownParts(roots: readonly Container[], knownKinds: readonly string[]): { props: string[]; kinds: string[] } {
  const props = new Set<string>()
  const kinds = new Set<string>()
  for (const root of roots) {
    walk(root, (n) => {
      const known = KNOWN_PROPS[n.type]
      if (!known) return
      for (const key of Object.keys(n)) if (!known.includes(key)) props.add(key)
      if (isFunction(n) && !knownKinds.includes(n.functionKind)) kinds.add(String(n.functionKind))
    })
  }
  return { props: [...props].sort(), kinds: [...kinds].sort() }
}

function aufzaehlung(items: readonly string[]): string {
  return items.length <= 6 ? items.join(', ') : `${items.slice(0, 6).join(', ')} und ${items.length - 6} weitere`
}

/**
 * Hinweis für den Import, oder `null`, wenn diese App-Version alles kennt. Der Import wird nie verhindert.
 * Reihenfolge: zuerst, was der Vermerk benennt (mit Version), dann Unbekanntes ohne Vermerk.
 */
export function importNotice(input: { appVersion: string; needs?: Needs | null; roots: readonly Container[]; knownKinds: readonly string[] }): string | null {
  const { appVersion, needs, roots, knownKinds } = input
  const missing = (needs?.features ?? []).filter((f) => !versionGte(appVersion, f.since))
  const covered = new Set(missing.map((f) => f.key))
  const unknown = unknownParts(roots, knownKinds)
  // „config.lineEnd“ steht im Vermerk mit Pfad, am Element heißt die Eigenschaft „config“.
  const props = unknown.props.filter((p) => !covered.has(p) && ![...covered].some((k) => k.startsWith(`${p}.`)))
  const kinds = unknown.kinds.filter((k) => !covered.has(`function:${k}`))
  const mehrere = roots.length > 1
  const parts: string[] = []
  if (missing.length) {
    parts.push(
      `${mehrere ? 'Diese Vorlagen nutzen' : 'Diese Vorlage nutzt'} Funktionen, die es erst in einer neueren App-Version gibt: ` +
        `${aufzaehlung(missing.map((f) => `${f.name} (ab ${f.since})`))}. Du hast Version ${appVersion}.`,
    )
  }
  const fremd = [...kinds.map((k) => `Funktion „${k}“`), ...props.map((p) => `„${p}“`)]
  if (fremd.length) parts.push(`${missing.length ? 'Außerdem unbekannt' : 'Diese App-Version kennt nicht'}: ${aufzaehlung(fremd)}.`)
  if (!parts.length) return null
  parts.push(`Du kannst ${mehrere ? 'die Vorlagen' : 'die Vorlage'} trotzdem übernehmen. Diese Teile fehlen dann oder verhalten sich anders, bis die App aktualisiert ist.`)
  return parts.join(' ')
}
