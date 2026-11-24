// Wächter für das Ausfüllen eines Lückentexts: Regeln, die am Gerät nicht von selbst auffallen würden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const dialog = read('components/cloze/ClozeFillDialog.vue')
const answer = read('components/cloze/GapAnswer.vue')
const text = read('components/cloze/ClozeText.vue')
const card = read('components/cloze/ClozeFill.vue')
const template = (src: string): string => src.slice(src.indexOf('<template>'))

test('Fenster: „Fertig" steht im Kopf vor dem Text, kein Abbrechen - jede Antwort gilt sofort', () => {
  const t = template(dialog)
  assert.ok(t.indexOf('data-cloze-done') > 0 && t.indexOf('data-cloze-done') < t.indexOf('data-cloze-sentence'))
  assert.doesNotMatch(t, /Abbrechen|Übernehmen/)
})

test('Fenster: endet über der Tastatur (App: Layout-Höhe, einmal angepasst; Online-Editor: sichtbarer Bereich), nichts fährt gegen die Tastatur', () => {
  // Höhe und Lage wie beim großen Textfeld aus fullscreenKeyboard.ts (Wächter dort: longTextDialog.test.ts).
  for (const [name, src] of [['Ausfüllen', dialog], ['Einrichten', read('components/cloze/ClozeEditorDialog.vue')]] as const) {
    assert.match(src, /useFullscreenKeyboard\(\)/, name)
    assert.doesNotMatch(src, /visualViewport|translateY/, `${name}: keine eigene Rechnung mehr`)
    assert.match(src, /h-\[var\(--lt-h,100dvh\)\]/, name)
    assert.match(src, /modal modal-top /, name)
    assert.match(src, /translate-none/, name)
    assert.match(template(src), /:style="boxStyle"/, name)
    assert.match(template(src), /:style="dialogStyle"/, name)
    assert.doesNotMatch(template(src), /class="[^"]*modal-box[^"]*\bh-\[\d+vh\]/, name)
    const close = src.slice(src.indexOf('async function close()'), src.indexOf('function onClosed()'))
    assert.ok(close.indexOf('kb.release()') >= 0 && close.indexOf('kb.release()') < close.indexOf('dialog.value?.close()'), `${name}: erst volle Fläche, dann zu`)
  }
  assert.match(read('fullscreenKeyboard.ts'), /transitionProperty: closing\.value \? 'opacity'/)
})

test('Fenster: Weiter und Zurück halten den Fokus im Feld (Tastatur bleibt zwischen Freitext-Lücken offen)', () => {
  for (const key of ['data-cloze-next', 'data-cloze-prev']) {
    const tag = template(dialog).match(new RegExp(`<button[^>]*${key}[^>]*>`))?.[0] ?? ''
    assert.match(tag, /@pointerdown\.prevent/, key)
    assert.match(tag, /min-h-11/, key)
  }
})

test('Antworten: mindestens 44 px hoch, Eingaben mit 16 px Schrift', () => {
  assert.match(answer, /const ROW = '[^']*\bmin-h-11\b/)
  assert.match(answer, /<label[^>]*\bmin-h-11\b/)
  const inputs = (template(answer).match(/<input\b[\s\S]*?\/>/g) ?? []).filter((i) => !i.includes('type="checkbox"'))
  assert.equal(inputs.length, 3)
  for (const input of inputs) assert.match(input, /\btext-base\b/, input)
})

test('Gewählt ist nie rot: keine Hauptfarbe in Antworten, Text und Karte', () => {
  for (const [name, src] of [['GapAnswer', answer], ['ClozeText', text], ['ClozeFill', card]] as const) {
    assert.doesNotMatch(src, /btn-primary|bg-primary|text-primary|border-primary|btn-error|text-error/, name)
  }
  assert.match(text, /bg-neutral text-neutral-content/)
})

test('Begriff: „nicht erhoben", nicht „Entfällt"', () => {
  for (const src of [dialog, answer, text, card]) assert.doesNotMatch(src, /[Ee]ntfällt/)
  assert.match(answer, /nicht erhoben/)
})

test('Lesbarkeit: kein blasser Text (unter 70 %) im Lückentext', () => {
  for (const [name, src] of [['Dialog', dialog], ['GapAnswer', answer], ['ClozeText', text], ['ClozeFill', card]] as const) {
    const pale = [...template(src).matchAll(/text-base-content\/(\d+)/g)].map((m) => Number(m[1])).filter((n) => n < 70)
    assert.deepEqual(pale, [], name)
  }
})

test('Zustand der Lücke ist nicht nur Farbe: je Zustand eine eigene Form und ein Wort für Screenreader', () => {
  assert.match(text, /open: 'border border-dashed/)
  assert.match(text, /default: '[^']*decoration-dotted/)
  assert.match(text, /answered: '[^']*font-medium/)
  assert.match(text, /STATE_WORD/)
})

test('Vorschau: eine zeichengenaue Ansicht für Einsatz und Vorlage (Umbruch-Modus entfernt, Maintainer 2026-11-21)', () => {
  const out = read('components/OutputText.vue')
  assert.doesNotMatch(out, /wrap\?: boolean/)
  assert.doesNotMatch(out, /whitespace-pre-wrap/)
  assert.match(out, /overflow-x-auto whitespace-pre /)
})

test('Aufbau: Menü „Hinzufügen“ bleibt waagerecht im Bild, Lückentext-Zeile ohne platzfressenden Vermerk', () => {
  const node = read('components/ContainerTreeNode.vue')
  assert.match(node, /addShift\.value = MARGIN - m\.left/)
  assert.match(node, /translateX\(\$\{addShift\}px\)/)
  assert.match(node, /node\.cloze \? '¶'/)
  assert.doesNotMatch(node, /rounded bg-base-200 px-1 text-xs">Lückentext</)
})
