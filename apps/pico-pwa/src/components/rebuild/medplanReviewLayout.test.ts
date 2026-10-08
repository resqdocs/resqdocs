// Struktur-Test auf dem Template von MedplanReviewSheet.vue - fuer einen Layout-Fehler, der nur auf dem
// Geraet sichtbar wurde (#276): es gibt kein DOM-Testsetup, .vue-Dateien laufen in keinem Verhaltens-Test.
//
// Der Anlass: Beim BMP-Scan mit externem Scanner bleiben Eingabefeld und Hinweis offen. Stand die
// „Ausstellende Praxis aus dem Plan" FEST ueber der Medikamentenliste, blieb auf kleinen Displays fuer die
// Liste keine Hoehe mehr - die Medikamente waren unsichtbar und damit nicht zu scrollen. Ein erster Fix
// (nur min-h-0 an der Liste) traf das nicht, weil die Praxis weiterhin Platz ausserhalb des Scrollbereichs
// belegte.
//
// Festgehalten wird deshalb die Struktur, nicht ein Pixelwert: Praxis-Block und Liste muessen im SELBEN
// Scrollbereich liegen, und der muss schrumpfen duerfen (min-h-0 + flex-1). Gelesen wird das AST des echten
// Vue-Compilers, damit Formatierung und Kommentare nicht mitzaehlen - wie in templateRefs.test.ts.
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
  const path = fileURLToPath(new URL('MedplanReviewSheet.vue', import.meta.url))
  const { descriptor } = sfc.parse(readFileSync(path, 'utf8'))
  assert.ok(descriptor.template?.ast, 'MedplanReviewSheet.vue: kein <template>')
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

function nearestScrollContainer(chain: Node[]): Node | undefined {
  return [...chain].reverse().find((el) => /\boverflow-y-auto\b/.test(classOf(el)))
}

const isPraxisText = (n: Node): boolean => n.type === TEXT && n.content.includes('Ausstellende Praxis aus dem Plan')
const isMedikamentenSchleife = (n: Node): boolean =>
  n.type === ELEMENT &&
  (n.props ?? []).some((p: Node) => p.type === DIRECTIVE && p.name === 'for' && /\bstructuredRows\b/.test(p.exp?.content ?? ''))

test('Praxis-Block und Medikamentenliste liegen im SELBEN Scrollbereich (#276)', () => {
  const ast = templateAst()
  const praxis = pathTo(ast, isPraxisText)
  const liste = pathTo(ast, isMedikamentenSchleife)
  assert.ok(praxis, 'Praxis-Block nicht gefunden - Text geaendert? Dann diesen Test anpassen.')
  assert.ok(liste, 'Medikamentenschleife (v-for ueber structuredRows) nicht gefunden.')

  const scrollPraxis = nearestScrollContainer(praxis)
  const scrollListe = nearestScrollContainer(liste)
  assert.ok(scrollListe, 'Die Medikamentenliste liegt in keinem Scrollbereich (overflow-y-auto).')
  assert.ok(
    scrollPraxis,
    'Die Ausstellende Praxis steht AUSSERHALB des Scrollbereichs - im Scanner-Modus verdeckt sie auf ' +
      'kleinen Displays die Liste (#276).',
  )
  assert.equal(scrollPraxis, scrollListe, 'Praxis und Liste muessen denselben Scrollbereich teilen.')
})

test('der gemeinsame Scrollbereich darf schrumpfen (min-h-0 + flex-1)', () => {
  const liste = pathTo(templateAst(), isMedikamentenSchleife)
  const scroll = liste && nearestScrollContainer(liste)
  assert.ok(scroll, 'Scrollbereich nicht gefunden.')
  const cls = classOf(scroll)
  // Ohne min-h-0 behaelt ein flex-Kind min-height:auto und waechst auf Inhaltshoehe statt zu scrollen.
  assert.match(cls, /\bmin-h-0\b/, 'Scrollbereich braucht min-h-0, sonst schrumpft er nicht.')
  assert.match(cls, /\bflex-1\b/, 'Scrollbereich braucht flex-1, sonst bekommt er die Resthoehe nicht.')
})
