// Struktur-Test auf dem KOMPILIERTEN Template - fuer eine Fehlerklasse, die im Projekt bisher
// grundsaetzlich unsichtbar war: es gibt kein DOM-Testsetup, .vue-Dateien sind von keinem Test erfasst.
//
// Der konkrete Anlass: eine String-Ref (ref="foo") innerhalb eines v-for setzt in Vue 3 ein ARRAY
// statt eines Elements - der Compiler markiert das mit ref_for: true. Ein darauf aufgerufenes
// element.scrollIntoView() schlaegt fehl, und weil der Aufruf in einem requestAnimationFrame steckt,
// verschwindet der Fehler still. Symptom: "die Funktion tut einfach nichts", ohne jede Meldung.
//
// Richtig ist in einem v-for eine FUNKTIONS-Ref (:ref="setFoo"). Der Test liest dazu nicht den
// Quelltext, sondern das Ergebnis des echten Vue-Compilers - String-Refs in Schleifen fallen damit
// unabhaengig von Formatierung und Einrueckung auf.
//
// Braucht keine neue Abhaengigkeit: @vue/compiler-sfc liegt als Vite-/vue-tsc-Abhaengigkeit vor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sfc = require_('@vue/compiler-sfc/dist/compiler-sfc.cjs.js') as any

// Alle Karten, die per focusout schliessen. Wer hier eine neue anlegt, muss sie eintragen -
// sonst faellt die naechste Fokus-Falle wieder erst am Geraet auf.
const DATEIEN = [
  'SnippetLibrarySection.vue',
  'BlockLibrarySection.vue',
  '../rebuild/AerzteFunction.vue',
  '../rebuild/MedplanFunction.vue',
]

function compiled(name: string): string {
  const path = fileURLToPath(new URL(name, import.meta.url))
  const { descriptor } = sfc.parse(readFileSync(path, 'utf8'))
  assert.ok(descriptor.template, `${name}: kein <template>`)
  return sfc.compileTemplate({ source: descriptor.template.content, filename: name, id: name }).code as string
}

for (const name of DATEIEN) {
  test(`${name}: keine String-Ref innerhalb eines v-for (die liefert ein Array)`, () => {
    const code = compiled(name)
    // Alle ref_for-Stellen einsammeln und pruefen, dass die zugehoerige ref KEIN String-Literal ist.
    const stringRefsInLoop = [...code.matchAll(/ref_for:\s*true,\s*ref:\s*"([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(
      stringRefsInLoop,
      [],
      `String-Ref(s) in einem v-for gefunden: ${stringRefsInLoop.join(', ')}. ` +
        'In einer Schleife setzt Vue eine String-Ref auf ein ARRAY - Aufrufe wie scrollIntoView() ' +
        'schlagen dann still fehl. Stattdessen eine Funktions-Ref nutzen (:ref="setFoo").',
    )
  })

  test(`${name}: die Karte, die auf focusout schliesst, stempelt auch pointerdown und mousedown`, () => {
    const code = compiled(name)
    // Der Tap-Stempel muss am SELBEN Element haengen wie der focusout-Handler, sonst kommt der Schutz
    // nicht an. Beides steht im kompilierten Props-Objekt desselben Elements.
    const i = code.indexOf('onFocusout')
    assert.ok(i > 0, 'kein focusout-Handler im Template gefunden')
    const props = code.slice(Math.max(0, i - 400), i + 400)
    assert.ok(props.includes('onPointerdown'), 'focusout-Element ohne pointerdown-Stempel')
    assert.ok(props.includes('onMousedown'), 'focusout-Element ohne mousedown-Stempel')
  })
}
