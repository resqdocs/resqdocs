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

/** Ergebnis eines Knoten-Renders: der Text UND ob seine Ausgabe einen Absatz DAVOR verlangt
 *  („Absatz davor" auf einem Banner - direkt, ODER von einem titel-losen Wrapper aus dem ersten Kind
 *  hochgereicht). So faellt die Absatz-Entscheidung EINPASSIG (jeder Knoten wird genau einmal gerendert,
 *  kein Neu-Rendern) und trotzdem ueber Container-Grenzen hinweg korrekt. */
interface Rendered {
  text: string
  leadsPara: boolean
}

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

/** Banner-Element (Titel auf eigener Zeile) - fuer die Block-/Absatz-Logik. Funktion UND Container:
 *  Banner = Titel + showTitle + nicht titleInline (der Titel steht ueber dem Inhalt) -> strukturell Block.
 *  Feld hat seine eigene Default-Logik (isBannerField). Kein Banner -> mit `inline` an die laufende Zeile. */
function isBannerNode(node: Node): boolean {
  if (node.type === 'field') return isBannerField(node)
  return !!node.title && !!node.showTitle && node.titleInline !== true
}

/** Ein Feld zu Text (+ leadsPara). Wert je Fuellzustand, optional Titel davor.
 *  - „Trenner-Funktion" (titleInline===false, oder mehrzeilig per Default): VOLLER Banner auf eigener
 *    Zeile, Wert in der naechsten Zeile.  - sonst inline: prefix+title+suffix+value.
 *  null = excluded ODER leer -> der Eltern-Join laesst es weg. */
function renderFieldR(field: Field, values: Values): Rendered | null {
  const value = fillValue(field, values[field.id])
  if (value === null) return null // excluded
  let text: string
  if (field.title && field.showTitle) {
    const h = field.heading ?? DEFAULT_HEADING
    // Titel auf eigener Zeile: explizit (titleInline===false) ODER mehrzeilig ohne explizites Inline.
    const ownLine = field.titleInline === false || (field.titleInline === undefined && !!field.multiline)
    if (ownLine) {
      const head = renderHeading(field.title, h)
      text = value ? `${head}\n${value}` : head
    } else {
      text = `${h.prefix}${field.title}${h.suffix}${value}`
    }
  } else if (value === '') {
    return null
  } else {
    text = value
  }
  if (text === '') return null
  return { text, leadsPara: field.blankLineBefore === true && isBannerField(field) }
}

/** Funktions-Knoten zu Text (+ leadsPara): Body aus der Registry + optional Titel/Banner darueber.
 *  Leere Funktion ohne Titel -> null (entfaellt, wie excluded). Das Geschwister-Layout macht der Eltern-Join. */
function renderFunctionR(node: FunctionNode, values: Values): Rendered | null {
  const def = FUNCTION_REGISTRY[node.functionKind]
  const fill = values[node.id]
  const custom = fill?.state === 'function' && fill.status === 'custom'
  // Unbekannte Funktion (Versions-Skew/Fremd-Import): keine Registry-Zeilen. Sie entfaellt wie bisher
  // KOMPLETT (auch mit Titel) - AUSSER es gibt Freitext (✎) oder einen Standardtext; die duerfen nicht
  // still verloren gehen (sonst widerspraeche die Ausgabe der „erfuellt"/Pflicht-Anzeige).
  if (!def && !custom && !(node.default && node.default.trim() !== '')) return null
  // Nicht erhoben (grau −): Funktion inkl. Titel entfaellt komplett (analog Container excluded).
  // AUSNAHME: eine Pflicht-Funktion darf nicht still verschwinden (required) -> faellt auf
  // Ergebnis/Standardtext zurueck statt zu entfallen (deckt sich mit isFunctionFilled/Pflicht-Anzeige).
  if (fill?.state === 'function' && fill.status === 'excluded' && !node.required) return null
  // Freitext (✎ custom) ueberschreibt Zeilen/Standardtext; sonst die Zeilen aus der Registry (unbekannt:
  // keine), sonst der Standardtext-Fallback (node.default).
  const body = custom ? (fill.text ?? '') : (def?.renderBody(fill, node.config) ?? '') // config steuert das Zeilen-Layout
  const effectiveBody = custom ? body : (body || (node.default ?? ''))
  let text: string | null
  if (node.title && node.showTitle) {
    // Mit Titel zeigt sich die Ueberschrift auch ohne Daten (Editor-Vorschau); titleInline = Titel inline.
    const h = node.heading ?? DEFAULT_HEADING
    if (node.titleInline) text = `${h.prefix}${node.title}${h.suffix}${effectiveBody}`
    else {
      const head = renderHeading(node.title, h)
      text = effectiveBody ? `${head}\n${effectiveBody}` : head
    }
  } else {
    text = effectiveBody || null
  }
  if (text === null || text === '') return null
  return { text, leadsPara: node.blankLineBefore === true && isBannerNode(node) }
}

/** Geschwister zu Text fuegen (+ ob das ERSTE ausgegebene Kind einen Absatz davor verlangt - der
 *  Eltern-Container braucht das fuer die Naht Titel|erstes-Kind bzw. fuer eine transparente Gruppierung).
 *  - block (Default) = neue Zeile.  - leadsPara = Leerzeile davor.  - inline = an die laufende Zeile.
 *  Das ERSTE ausgegebene Kind bekommt hier nie einen fuehrenden Absatz (im selben Join steht nichts
 *  darueber); ob davor - eine Ebene hoeher - doch etwas steht, entscheidet der Eltern-Join via leadsPara. */
function joinNodesR(children: Node[], values: Values, sep: string): { text: string; firstLeadsPara: boolean } {
  let out = ''
  let started = false
  let firstLeadsPara = false
  for (const child of children) {
    const r = renderNodeR(child, values, sep)
    if (r === null || r.text === '') continue // leere/excluded Kinder zaehlen nicht als „vorheriges Element"
    if (!started) {
      out = r.text
      firstLeadsPara = r.leadsPara
      started = true
      continue
    }
    if (r.leadsPara) {
      out += `\n\n${r.text}` // Absatz: Leerzeile davor (Banner mit blankLineBefore - direkt oder hochgereicht)
    } else if (child.inline && (child.type === 'field' ? !isBannerField(child) : !isBannerNode(child))) {
      out += (child.noSeparatorBefore ? '' : sep) + r.text // inline an die laufende Zeile (Banner bleibt Block)
    } else {
      out += `\n${r.text}`
    }
  }
  return { text: out, firstLeadsPara }
}

function renderContainerR(container: Container, values: Values, inheritedSep: string): Rendered | null {
  // 2-stufiger Container-Status: „nicht erhoben" -> ganzer Container (inkl. Kinder) entfaellt.
  if (container.excludable && values[container.id]?.state === 'excluded') return null
  const sep = container.separator ?? inheritedSep // zentral an der Wurzel, pro Container ueberschreibbar
  const joined = joinNodesR(container.children, values, sep)
  const hasBody = joined.text !== ''
  // Kinder leer UND emptyText gesetzt -> Ersatztext (Container bleibt sichtbar).
  const body = hasBody ? joined.text : (container.emptyText ?? '')
  if (container.title && container.showTitle) {
    const h = container.heading ?? DEFAULT_HEADING
    let text: string
    if (container.titleInline) {
      text = `${h.prefix}${container.title}${h.suffix}${body}`
    } else {
      const head = renderHeading(container.title, h)
      // Absatz zwischen Titel-Banner und erstem echten Kind, wenn dieses „Absatz davor" verlangt.
      text = body ? `${head}${hasBody && joined.firstLeadsPara ? '\n\n' : '\n'}${body}` : head
    }
    // leadsPara des Containers selbst = sein eigenes blankLineBefore-Flag (nur bei Banner-Container).
    return { text, leadsPara: container.blankLineBefore === true && isBannerNode(container) }
  }
  // Transparenter Wrapper (kein eigener Titel in der Ausgabe): reicht den Absatz-Wunsch des ersten
  // ausgegebenen Kindes nach oben durch, damit „Absatz davor" nicht an der Gruppierungsgrenze verloren geht.
  // AUSNAHME: ein explizit als `inline` markierter Wrapper wird - wie bisher - inline an die laufende Zeile
  // gejoint und reicht KEINEN Absatz hoch (widerspruechliche, nur per JSON erreichbare Konfiguration). So
  // bleibt das Alt-Verhalten exakt erhalten und es aendern sich ausschliesslich die #3-Absatz-Faelle.
  if (body === '') return null
  return { text: body, leadsPara: container.inline ? false : joined.firstLeadsPara }
}

function renderNodeR(node: Node, values: Values, sep: string): Rendered | null {
  if (node.type === 'container') return renderContainerR(node, values, sep)
  if (node.type === 'function') return renderFunctionR(node, values)
  return renderFieldR(node, values)
}

// --- Oeffentliche String-API (unveraendert fuer App + Tests) ---

export function renderContainer(container: Container, values: Values = {}, inheritedSep: string = DEFAULT_SEPARATOR): string {
  return renderContainerR(container, values, inheritedSep)?.text ?? ''
}

export function renderNode(node: Node, values: Values = {}, sep: string = DEFAULT_SEPARATOR): string | null {
  return renderNodeR(node, values, sep)?.text ?? null
}

/** Wurzel-Container + Einsatz-Werte -> Klartext. */
export function render(root: Container, values: Values = {}): string {
  return renderContainer(root, values, DEFAULT_SEPARATOR)
}
