// Struktur-Test auf dem Template von LibraryBar.vue (Vorlagenliste), fuer einen Layout-Fehler, der nur auf
// dem Geraet sichtbar wurde: Ein langer Vorlagenname (etwa die id einer Vorlage ohne Titel) schob Teilen und
// ⋮ aus der Karte, die Seite verrutschte seitlich. Ursache: Die Auswahlflaeche ist ein flex-1-Kind ohne
// min-w-0 und schrumpft deshalb nie unter die Breite des Namens - truncate am Namen allein reicht nicht.
//
// Festgehalten wird die Struktur wie in den Baustein-/Snippet-Listen: Auswahlflaeche min-w-0 + flex-1,
// Name min-w-0 + truncate, Teilen und ⋮ shrink-0. Gelesen wird das AST des echten Vue-Compilers, damit
// Formatierung und Kommentare nicht mitzaehlen - wie in medplanReviewLayout.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = require_('@vue/compiler-sfc/dist/compiler-sfc.cjs.js') as any

// Knotentypen aus @vue/compiler-core (stabil seit Vue 3.0).
const ELEMENT = 1
const INTERPOLATION = 5
const ATTRIBUTE = 6
const DIRECTIVE = 7

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

function templateAst(): Node {
  const path = fileURLToPath(new URL('LibraryBar.vue', import.meta.url))
  const { descriptor } = sfc.parse(readFileSync(path, 'utf8'))
  assert.ok(descriptor.template?.ast, 'LibraryBar.vue: kein <template>')
  return descriptor.template.ast
}

/** Liefert die Kette der Element-Vorfahren bis zum ersten Knoten, auf den `match` zutrifft (inklusive). */
function pathTo(node: Node, match: (n: Node) => boolean, ancestors: Node[] = []): Node[] | null {
  const chain = node.type === ELEMENT ? [...ancestors, node] : ancestors
  if (match(node)) return chain
  for (const child of node.children ?? []) {
    const found = pathTo(child, match, chain)
    if (found) return found
  }
  return null
}

function classOf(el: Node): string {
  const attr = (el.props ?? []).find((p: Node) => p.type === ATTRIBUTE && p.name === 'class')
  return attr?.value?.content ?? ''
}

const isAuswahl = (n: Node): boolean =>
  n.type === ELEMENT &&
  (n.props ?? []).some(
    (p: Node) => p.type === DIRECTIVE && p.name === 'on' && p.arg?.content === 'click' && /^switchTo\(/.test(p.exp?.content ?? ''),
  )

function zeile(): { auswahl: Node; buttons: Node[] } {
  const chain = pathTo(templateAst(), isAuswahl)
  assert.ok(chain, 'Auswahlflaeche (@click="switchTo(...)") nicht gefunden - Template geaendert? Dann Test anpassen.')
  const auswahl = chain[chain.length - 1]
  const reihe = chain[chain.length - 2]
  return { auswahl, buttons: reihe.children.filter((c: Node) => c.type === ELEMENT && c !== auswahl) }
}

test('Auswahlflaeche darf schrumpfen (min-w-0 + flex-1)', () => {
  const cls = classOf(zeile().auswahl)
  assert.match(cls, /\bmin-w-0\b/, 'Ohne min-w-0 schiebt ein langer Name Teilen und ⋮ aus der Karte.')
  assert.match(cls, /\bflex-1\b/)
})

test('der Vorlagenname wird gekuerzt (min-w-0 + truncate)', () => {
  const name = zeile().auswahl.children.find(
    (c: Node) => c.type === ELEMENT && c.children?.some((k: Node) => k.type === INTERPOLATION),
  )
  assert.ok(name, 'Namens-Element in der Auswahlflaeche nicht gefunden.')
  assert.match(classOf(name), /\btruncate\b/)
  assert.match(classOf(name), /\bmin-w-0\b/)
})

test('Teilen und ⋮ behalten ihre Breite (shrink-0)', () => {
  const { buttons } = zeile()
  assert.equal(buttons.length, 2, 'erwartet: Teilen und ⋮ neben der Auswahlflaeche')
  for (const b of buttons) assert.match(classOf(b), /\bshrink-0\b/)
})
