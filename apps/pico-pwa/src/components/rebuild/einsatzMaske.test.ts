// Wächter für die Einsatz-Maske: Die Erklärung der Zeichen steht auf Abruf hinter dem ⓘ statt als Dauerabsatz,
// und „nicht erhoben“ steht kurz und rechtsbündig in der Zeile statt als Satz unter dem Feld.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INFO } from '../../../../../packages/protocol-core-ui/terms.ts'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const view = read('./EinsatzView.vue')
const field = read('./EinsatzField.vue')
const RIGHT = /class="ml-auto shrink-0 text-xs italic text-base-content\/75">nicht erhoben<\/span>/g

test('Erklärung der Zeichen: auf Abruf, kein Dauerabsatz', () => {
  assert.doesNotMatch(view, /Felder ausfüllen: tippe auf/)
  assert.match(view, /<InfoTip :info="INFO\.fillStates" \/>/)
  const text = [INFO.fillStates.text, ...INFO.fillStates.items.map((i) => `${i.term} ${i.text}`)].join(' ')
  for (const part of ['✓ bestätigt', '✎ eigener Wert', '− nicht erhoben', 'erscheint nicht im Protokolltext', 'Vorschau']) {
    assert.ok(text.includes(part), part)
  }
})

test('Feld auf „nicht erhoben“: kurzer Hinweis rechts in der Zeile, kein Satz darunter', () => {
  assert.equal((field.match(RIGHT) ?? []).length, 3, 'Mehrfachauswahl, Auswahl und Freitext')
  assert.doesNotMatch(field, /erscheint nicht im Protokolltext<\/p>/)
})

test('Abschnitt und Funktionen auf „nicht erhoben“: derselbe kurze Hinweis, rechts', () => {
  assert.equal((read('./EinsatzSection.vue').match(RIGHT) ?? []).length, 1)
  for (const f of ['ScoreFunction', 'MedplanFunction', 'AerzteFunction']) {
    const src = read(`../../../../../packages/protocol-core-ui/components/functions/${f}.vue`)
    assert.match(src, /class="text-right text-xs italic text-base-content\/75">nicht erhoben<\/p>/, f)
    assert.doesNotMatch(src, /erscheint nicht im Protokolltext<\/p>/, f)
  }
})

test('Abschnitt auf „nicht erhoben“ behält seine Form: als Kasten hohl, sonst an der Stelle seines Kopfs', () => {
  const section = read('./EinsatzSection.vue')
  const markup = section.slice(section.indexOf('<template>')).replace(/<!--[\s\S]*?-->/g, '')
  // Kasten: derselbe Rahmen und dieselbe Kopfzeile wie der erhobene Abschnitt, aber ohne Fläche.
  const hollow = markup.match(/<div v-if="excluded && renderAsCollapse" class="([^"]*)" data-section-excluded>\s*<div class="([^"]*)">/)
  assert.ok(hollow, 'hohler Kasten gefunden')
  const card = markup.match(/<details v-else-if="renderAsCollapse" class="([^"]*)"[^>]*>\s*<summary class="([^"]*)">/)
  assert.ok(card, 'Kasten des erhobenen Abschnitts gefunden')
  const words = (c: string): string[] => c.split(/\s+/).filter(Boolean).sort()
  assert.deepEqual(words(hollow[1]), words(card[1]).filter((c) => c !== 'bg-base-100' && c !== 'collapse-arrow'), 'gleicher Rahmen, nur ohne Fläche und ohne Pfeil')
  assert.deepEqual(words(hollow[2]).filter((c) => c !== 'cursor-default'), words(card[2]), 'gleiche Kopfzeile: gleiche Höhe, gleiche Stellen')
  // Abgeschwächt wird nur die Fläche, nie die Schrift (Kontrast): keine Deckkraft, kein blasser Titel.
  const hollowBlock = markup.slice(markup.indexOf('data-section-excluded'), markup.indexOf('v-else-if="excluded"'))
  assert.doesNotMatch(hollowBlock, /opacity-|text-base-content\/[1-6]\d\b/)
  assert.match(hollowBlock, /<span class="text-xs italic text-base-content\/75">nicht erhoben<\/span>/)
  // Ohne Kasten: gleiche Abstände und Einrückung wie der Abschnitt, wenn er erhoben ist.
  const flat = markup.match(/<div v-else-if="excluded" class="flex items-center gap-2" :class="([^"]*)">/)
  const open = markup.match(/<section v-else class="flex flex-col gap-1\.5" :class="([^"]*)">/)
  assert.ok(flat && open)
  assert.equal(flat[1], open[1])
})
