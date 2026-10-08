// Struktur-Test auf dem Template von AerzteFunction.vue (Funktion „Kontakte/Ärzte"), bewusste Entscheidung:
// Die Bearbeiten-Karte beginnt mit der ROLLE, vorausgewaehlt „Arzt", erst danach kommt „Arzt / Praxis".
// Jede Rolle hat ihren eigenen Feldsatz; stand der Arzt-Name vorn (Rolle als „Rolle —" weiter unten), wirkte
// die Funktion wie eine reine Ärzte-Liste.
//
// „Arzt" ist der Wert OHNE Rolle (leerer Wert) - das Datenmodell bleibt unveraendert. Gelesen wird das AST des
// echten Vue-Compilers, damit Formatierung und Kommentare nicht mitzaehlen - wie in medplanReviewLayout.test.ts.
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
const TEXT = 2
const ATTRIBUTE = 6
const DIRECTIVE = 7

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

function templateAst(): Node {
  const path = fileURLToPath(new URL('AerzteFunction.vue', import.meta.url))
  const { descriptor } = sfc.parse(readFileSync(path, 'utf8'))
  assert.ok(descriptor.template?.ast, 'AerzteFunction.vue: kein <template>')
  return descriptor.template.ast
}

function find(node: Node, match: (n: Node) => boolean): Node | null {
  if (match(node)) return node
  for (const child of node.children ?? []) {
    const found = find(child, match)
    if (found) return found
  }
  return null
}

const attr = (el: Node, name: string): string | undefined =>
  (el.props ?? []).find((p: Node) => p.type === ATTRIBUTE && p.name === name)?.value?.content
const hasDirective = (el: Node, name: string, arg: string, exp: RegExp): boolean =>
  (el.props ?? []).some((p: Node) => p.type === DIRECTIVE && p.name === name && p.arg?.content === arg && exp.test(p.exp?.content ?? ''))
const elements = (el: Node): Node[] => (el.children ?? []).filter((c: Node) => c.type === ELEMENT)
const text = (el: Node): string => (el.children ?? []).filter((c: Node) => c.type === TEXT).map((c: Node) => c.content).join('').trim()

function karte(): Node {
  const k = find(templateAst(), (n) => n.type === ELEMENT && hasDirective(n, 'on', 'focusout', /onFocusOut/))
  assert.ok(k, 'Bearbeiten-Karte (@focusout="onFocusOut") nicht gefunden - Template geaendert? Dann Test anpassen.')
  return k
}
const istRollenAuswahl = (n: Node): boolean => n.type === ELEMENT && n.tag === 'select' && attr(n, 'aria-label') === 'Rolle'
const istNamensFeld = (n: Node): boolean =>
  n.type === ELEMENT && n.tag === 'input' && hasDirective(n, 'bind', 'aria-label', /Name/)

test('die Karte beginnt mit der Rolle, danach kommt der Name', () => {
  const zeilen = elements(karte())
  const rolle = zeilen.findIndex((z) => find(z, istRollenAuswahl))
  const name = zeilen.findIndex((z) => find(z, istNamensFeld))
  assert.equal(rolle, 0, 'Die Rollen-Auswahl muss in der ersten Zeile der Karte stehen.')
  assert.ok(name > rolle, 'Der Name („Arzt / Praxis") kommt erst nach der Rolle.')
})

test('die Rolle ist sichtbar beschriftet und steht standardmaessig auf „Arzt" (= ohne Rolle)', () => {
  const zeile = elements(karte())[0]
  const select = find(zeile, istRollenAuswahl)
  const beschriftung = find(zeile, (n) => n.type === ELEMENT && attr(n, 'class')?.split(/\s+/).includes('label'))
  assert.equal(beschriftung && text(beschriftung), 'Rolle')
  const [erste] = elements(select)
  assert.equal(attr(erste, 'value'), '', 'Die erste Option ist der Wert ohne Rolle.')
  assert.equal(text(erste), 'Arzt')
})
