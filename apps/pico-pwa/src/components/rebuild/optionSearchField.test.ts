// Struktur-Test auf EinsatzField.vue (#278): haelt den Maintainer-Entscheid fest, dass lange Optionslisten
// fuer Einfach- UND Mehrfachauswahl gleich durchsuchbar sind und die Schwelle EINMAL zentral definiert ist.
// Kein DOM-Testsetup im Projekt - deshalb wie templateRefs.test.ts ueber den echten Vue-Compiler.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = require_('@vue/compiler-sfc/dist/compiler-sfc.cjs.js') as any

const ELEMENT = 1
const ATTRIBUTE = 6
const DIRECTIVE = 7
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any

const source = readFileSync(fileURLToPath(new URL('EinsatzField.vue', import.meta.url)), 'utf8')
const { descriptor } = sfc.parse(source)

function collect(node: Node, out: Node[] = []): Node[] {
  if (node.type === ELEMENT && node.tag === 'OptionSearchList') out.push(node)
  for (const child of node.children ?? []) collect(child, out)
  return out
}
const hasAttr = (el: Node, name: string): boolean => (el.props ?? []).some((p: Node) => p.type === ATTRIBUTE && p.name === name)
const guard = (el: Node): string =>
  (el.props ?? []).find((p: Node) => p.type === DIRECTIVE && p.name === 'else-if')?.exp?.content ?? ''

test('die durchsuchbare Liste gibt es fuer Einfach- UND Mehrfachauswahl (#278)', () => {
  const lists = collect(descriptor.template.ast)
  assert.equal(lists.length, 2, 'je eine OptionSearchList im Multi- und im Single-Zweig')
  assert.equal(lists.filter((l) => hasAttr(l, 'multiple')).length, 1, 'genau eine davon im Mehrfachauswahl-Zweig')
  for (const l of lists) assert.equal(guard(l), 'useSearch', 'beide haengen an derselben Schwelle (useSearch)')
})

test('die Schwelle kommt aus dem gemeinsamen Kern, nicht als feste Zahl im Feld', () => {
  const script = descriptor.scriptSetup?.content ?? ''
  assert.match(script, /useSearch\s*=\s*computed\(\(\)\s*=>\s*options\.value\.length\s*>=\s*OPTION_SEARCH_MIN\)/)
})

test('ein offenes Dropdown hebt seine Karte ueber die folgenden Abschnitte - unter die Sticky-Leiste (#278)', () => {
  // Maintainer-Entscheid: schwebend statt aufklappen. Ohne diese Regel malen spaetere Karten (collapse =
  // eigener Stapel-Kontext) und „nicht erhoben"-Zeilen ueber die offene Liste (Geraetetest).
  const css = readFileSync(fileURLToPath(new URL('../../style.css', import.meta.url)), 'utf8')
  const rule = css.match(/\.collapse:has\(\.dropdown\[open\]\)\s*\{([^}]*)\}/)
  assert.ok(rule, 'Regel .collapse:has(.dropdown[open]) fehlt in style.css')
  assert.match(rule[1], /position:\s*relative/)
  const z = Number(rule[1].match(/z-index:\s*(\d+)/)?.[1])
  assert.ok(z > 0 && z < 5, `z-index ${z}: muss ueber den Karten (>0) und unter der Sticky-Leiste z-[5] liegen`)

  // Die Tab-Leiste (daisyUI-dock, von Haus aus nur z-index 1) muss UEBER der angehobenen Karte liegen -
  // sonst verdeckt das offene Dropdown die Navigation (Geraetetest).
  const app = readFileSync(fileURLToPath(new URL('../../App.vue', import.meta.url)), 'utf8')
  const dock = app.match(/<nav class="dock\b([^"]*)"/)
  assert.ok(dock, 'Dock-Navigation nicht gefunden')
  const dz = Number(dock[1].match(/\bz-(?:\[)?(\d+)\]?/)?.[1] ?? 1)
  assert.ok(dz > z, `Dock z-index ${dz} muss ueber der angehobenen Karte (${z}) liegen`)
})
