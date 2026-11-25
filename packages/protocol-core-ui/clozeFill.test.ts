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
    assert.match(src, /modal (?:modal-open )?modal-top /, name)
    assert.match(src, /translate-none/, name)
    assert.match(template(src), /:style="boxStyle"/, name)
    assert.match(template(src), /:style="dialogStyle"/, name)
    assert.doesNotMatch(template(src), /class="[^"]*modal-box[^"]*\bh-\[\d+vh\]/, name)
    const close = src.slice(src.indexOf('async function close()'), src.indexOf('function onClosed()'))
    const shut = name === 'Ausfüllen' ? 'onClosed()' : 'dialog.value?.close()'
    assert.ok(close.indexOf('kb.release()') >= 0 && close.indexOf('kb.release()') < close.indexOf(shut), `${name}: erst volle Fläche, dann zu`)
  }
  assert.match(read('fullscreenKeyboard.ts'), /transitionProperty: closing\.value \? 'opacity'/)
})

test('Fenster: Funktionen in einer Lücke öffnen ihr Fenster DARÜBER (kein showModal, Ebene unter dem Listen-Fenster)', () => {
  // Ein showModal-Fenster liegt in der obersten Ebene des Browsers: Das Fenster einer Funktion (ZOPS, NEWS2 …, an body
  // gehängt) lag dahinter, „Antippen zum Eingeben“ tat scheinbar nichts. Die Ebene entscheidet wie beim ListSheet.
  assert.doesNotMatch(dialog, /\.showModal\(/)
  assert.doesNotMatch(template(dialog), /<dialog\s+ref=/)
  const t = template(dialog)
  assert.match(t, /<Teleport v-if="active" to="body">/)
  const z = Number(t.match(/class="modal modal-open modal-top z-\[(\d+)\]/)?.[1])
  const list = Number(read('components/functions/ListSheet.vue').match(/modal modal-open modal-top z-\[(\d+)\]/)?.[1])
  assert.ok(z > 30 && z < list, `Ausfüllen z-[${z}] muss über der App-Hülle und unter dem Listen-Fenster z-[${list}] liegen`)
  assert.match(t.match(/<button[^>]*data-cloze-done[^>]*>/)?.[0] ?? '', /data-back-close/, 'Zurück (Android) und Escape schließen über „Fertig“')
  // Hardware-Tastatur in der App: Escape nur, wenn das Fenster zuoberst liegt (sonst ginge ein Rechner darüber mit zu).
  assert.match(t, /@keydown="escapeIfTop\(\$event, dialog, close\)"/)
  assert.doesNotMatch(t, /@keydown\.esc/)
  // Fokus wie früher bei showModal: beim Öffnen ins Fenster, beim Schließen zurück an den Auslöser.
  assert.match(t, /<div ref="dialog"[^>]*tabindex="-1"/)
  const open = dialog.slice(dialog.indexOf('async function open('), dialog.indexOf('async function close('))
  assert.match(open, /dialog\.value\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(dialog.slice(dialog.indexOf('function onClosed()')), /opener\?\.isConnected\) opener\.focus/)
  // Zwei Schließ-Aufrufe im selben Moment: nur einer läuft durch.
  assert.match(dialog.slice(dialog.indexOf('async function close('), dialog.indexOf('function onClosed()')), /if \(!active\.value \|\| closing\) return\s+closing = true/)
})

test('Einrichten: viele Lücken - die Liste scrollt in sich, schrumpft bei Platznot zuerst, nie unter eine Reihe', () => {
  // Mit 32 Lücken drückte die Liste den Text auf drei Zeilen und lief unten aus dem Fenster; verschachtelt in die Leiste
  // schrumpfte sie gar nicht oder lief über die Einstellungen. Jetzt ein eigener Teil des Fensters.
  const t = template(read('components/cloze/ClozeEditorDialog.vue'))
  const area = t.match(/<div v-if="gaps\.length" class="([^"]*)"[^>]*data-cloze-editor-gaps-area>/)?.[1] ?? ''
  assert.match(area, /\bshrink-\[100\]/, 'die Liste gibt zuerst Platz ab')
  const list = t.match(/<div ref="gapList" class="([^"]*)"/)?.[1] ?? ''
  assert.match(list, /\boverflow-y-auto\b/)
  const src = read('components/cloze/ClozeEditorDialog.vue')
  assert.equal([...src.matchAll(/max-h-\[calc\(7\.625rem\+1rem[^\]]*\)\] min-h-\[calc\(2\.75rem\+1rem/g)].length, 2, 'mit und ohne Abstand zum Home-Balken: höchstens zweieinhalb, mindestens eine Reihe')
  assert.match(t.match(/<div class="([^"]*)"[^>]*data-cloze-editor-actions>/)?.[1] ?? '', /\bshrink-0\b/, 'der Knopf darüber bleibt ganz')
})

test('Ausfüllen: die aktuelle Lücke rollt mit Abstand zum Rand ins Bild', () => {
  assert.match(template(dialog).match(/<div class="([^"]*)"[^>]*data-cloze-sentence>/)?.[1] ?? '', /\bscroll-py-\d+\b/)
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
