// Renderer - Rework. Rein, deterministisch, node-testbar. Baut aus (Definition, Werten) Klartext.
// Definition = Container/Field-Baum; Werte = Record<id, FieldFill> (Einsatz). Der Default eines
// Felds wird HIER zur Render-Zeit aufgeloest (fillValue) - nie in den Werte-Store geschrieben.
// Layout: block (Default) = neue Zeile, inline = an die laufende Zeile (relativ zum vorherigen Element).
// Feld-Trenner: zwischen benachbarten INLINE-Elementen (vererbt von der Wurzel, pro Container
// ueberschreibbar); NICHT nach einem Inline-Titel (Suffix uebernimmt) und nicht bei noSeparatorBefore.

import type { Container, Field, FunctionNode, Heading, Node, FieldFill } from './model.ts'
import { DEFAULT_HEADING, DEFAULT_SEPARATOR } from './model.ts'
import { fillValue } from './fill.ts'
import { FUNCTION_REGISTRY } from './functions/registry.ts'

type Values = Record<string, FieldFill>

/** Eine Ueberschrift bauen: prefix + Titel + suffix, dann Fuellzeichen je Bezug.
 *  - inclusive: width = Gesamtbreite inkl. Titel -> Zeile konstant breit.
 *  - exclusive: width = feste Anzahl Fuellzeichen nach dem Titel -> Gesamtbreite variiert. */
export function renderHeading(title: string, heading: Heading = DEFAULT_HEADING): string {
  const head = `${heading.prefix}${title}${heading.suffix}`
  const fill = heading.fill ? heading.fill[0] : ''
  if (!fill || heading.width <= 0) return head
  if (heading.fillMode === 'exclusive') return head + fill.repeat(heading.width)
  return head + fill.repeat(Math.max(0, heading.width - head.length))
}

/** Ein Feld zu Text: Wert je Fuellzustand, optional Titel davor.
 *  - „Trenner-Funktion" (titleInline===false, oder mehrzeilig per Default): VOLLER Banner
 *    (renderHeading mit Fuellzeichen/Breite) auf eigener Zeile, Wert in der naechsten Zeile.
 *  - sonst inline: prefix+title+suffix+value.
 *  null = excluded ODER leer -> der Eltern-Join laesst es weg. */
function renderField(field: Field, values: Values): string | null {
  const value = fillValue(field, values[field.id])
  if (value === null) return null // excluded
  if (field.title && field.showTitle) {
    const h = field.heading ?? DEFAULT_HEADING
    // Titel auf eigener Zeile: explizit (titleInline===false) ODER mehrzeilig ohne explizites Inline.
    const ownLine = field.titleInline === false || (field.titleInline === undefined && !!field.multiline)
    if (ownLine) {
      const head = renderHeading(field.title, h)
      return value ? `${head}\n${value}` : head
    }
    return `${h.prefix}${field.title}${h.suffix}${value}`
  }
  return value === '' ? null : value
}

/** Banner-/Trenner-Feld: Titel auf eigener Zeile (head\nvalue) -> strukturell ein BLOCK; darf NIE
 *  inline gejoint werden (sonst klebt der \n-haltige Banner hinter den Trenner). */
function isBannerField(node: Node): boolean {
  return (
    node.type === 'field' &&
    !!node.title &&
    !!node.showTitle &&
    (node.titleInline === false || (node.titleInline === undefined && !!node.multiline))
  )
}

/** Banner-Element (Feld ODER Container mit Titel auf eigener Zeile) - fuer die Block-/Absatz-Logik. */
function isBannerNode(node: Node): boolean {
  if (node.type === 'field') return isBannerField(node)
  if (node.type === 'function') return true // Funktion = immer Block (mehrzeilige Daten, nie inline)
  return !!node.title && !!node.showTitle && !node.titleInline
}

/** Geschwister zu Text fuegen.
 *  - block (Default) = neue Zeile.
 *  - inline = an die laufende Zeile; davor kommt der `sep`-Trenner, AUSSER es ist das erste Kind
 *    nach einem Inline-Titel (`head`, Glue ans Suffix) oder das Element setzt noSeparatorBefore.
 *  Leere/excluded Kinder werden uebersprungen (und zaehlen nicht als „vorheriges Element"). */
function joinNodes(children: Node[], values: Values, sep: string, head?: string): string {
  let out = head ?? ''
  let started = head !== undefined
  let emittedChild = false
  for (const child of children) {
    const text = renderNode(child, values, sep)
    if (text === null || text === '') continue
    if (!started) {
      out = text
      started = true
      emittedChild = true
      continue
    }
    if (!emittedChild) {
      // erstes Kind nach einem Inline-Titel (head): an den Suffix gluen - egal ob block/inline,
      // damit der Inline-Titel + Inhalt auf EINER Zeile bleibt (kein dangling Suffix + Umbruch).
      // AUSSER Banner-Feld: das ist ein Block und kommt auf eine eigene Zeile.
      out += isBannerField(child) ? `\n${text}` : text
    } else if (child.blankLineBefore && isBannerNode(child)) {
      out += `\n\n${text}` // Absatz: Leerzeile davor (Banner-Element, etwas darueber); erzwingt eigene Zeile
    } else if (child.type !== 'function' && child.inline && !isBannerField(child)) {
      out += (child.noSeparatorBefore ? '' : sep) + text
    } else {
      out += `\n${text}`
    }
    emittedChild = true
  }
  return out
}

export function renderContainer(container: Container, values: Values = {}, inheritedSep: string = DEFAULT_SEPARATOR): string {
  // 2-stufiger Container-Status: „nicht erhoben" -> ganzer Container (inkl. Kinder) entfaellt.
  if (container.excludable && values[container.id]?.state === 'excluded') return ''
  const sep = container.separator ?? inheritedSep // zentral an der Wurzel, pro Container ueberschreibbar
  // Inhalt der Kinder; ist er leer UND emptyText gesetzt -> Ersatztext (Container bleibt sichtbar).
  // (head + body ist aequivalent zu joinNodes(kinder, …, head), daher Body einmal vorab bilden.)
  let body = joinNodes(container.children, values, sep)
  if (body === '' && container.emptyText) body = container.emptyText
  if (container.title && container.showTitle) {
    const h = container.heading ?? DEFAULT_HEADING
    if (container.titleInline) return `${h.prefix}${container.title}${h.suffix}${body}`
    const head = renderHeading(container.title, h)
    return body ? `${head}\n${body}` : head
  }
  return body
}

/** Funktions-Knoten zu Text: Body aus der Registry (Klartext der Daten) + optional Titel/Banner darueber.
 *  Leere Funktion (keine Daten) -> null (entfaellt, wie excluded). Immer ein Block. */
function renderFunction(node: FunctionNode, values: Values): string | null {
  const def = FUNCTION_REGISTRY[node.functionKind]
  if (!def) return null // unbekannte Funktion (z. B. aus Fremd-Import) -> entfaellt, kein Crash
  const body = def.renderBody(values[node.id], node.config) // config steuert das Zeilen-Layout
  // Wie der Container: mit Titel zeigt sich die Ueberschrift auch ohne Daten (Editor-Vorschau rendert
  // ohne Werte); titleInline = Titel inline vor den Zeilen; ohne Titel + leer -> entfaellt.
  if (node.title && node.showTitle) {
    const h = node.heading ?? DEFAULT_HEADING
    if (node.titleInline) return `${h.prefix}${node.title}${h.suffix}${body}`
    const head = renderHeading(node.title, h)
    return body ? `${head}\n${body}` : head
  }
  return body || null
}

export function renderNode(node: Node, values: Values = {}, sep: string = DEFAULT_SEPARATOR): string | null {
  if (node.type === 'container') return renderContainer(node, values, sep)
  if (node.type === 'function') return renderFunction(node, values)
  return renderField(node, values)
}

/** Wurzel-Container + Einsatz-Werte -> Klartext. */
export function render(root: Container, values: Values = {}): string {
  return renderContainer(root, values, DEFAULT_SEPARATOR)
}
