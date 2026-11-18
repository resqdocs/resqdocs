// Wächter für das Schreib-Fenster des großen Textfelds. Geprüft wird die Quelle: die Eigenschaften unten sind
// Entscheidungen aus dem Gerätetest (Video vom iPhone) und sollen nicht unbemerkt zurückfallen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('components/LongTextDialog.vue', import.meta.url), 'utf8')
const template = src.slice(src.indexOf('<template>'))

test('„Fertig“ steht im Kopf über dem Text: unten läge der Knopf hinter der Tastatur', () => {
  const done = template.indexOf('data-long-text-done')
  const area = template.indexOf('<textarea')
  assert.ok(done > 0 && area > 0 && done < area, '„Fertig“ muss vor der Textarea stehen')
  assert.ok(template.indexOf('<header') < done && done < template.indexOf('</header>'), '„Fertig“ gehört in den Kopf')
})

test('das Fenster folgt dem sichtbaren Bereich über der Tastatur', () => {
  assert.match(src, /window\.visualViewport/)
  assert.match(src, /visibleBox\(/)
  assert.match(template, /h-\[var\(--lt-h,100dvh\)\]/)
})

test('am Handy ganzer Bildschirm: keine feste Teilhöhe und oben am Layout verankert', () => {
  const box = template.match(/class="modal-box[^"]*"/)?.[0] ?? ''
  assert.doesNotMatch(box.replace(/sm:[^\s"]+/g, ''), /h-\[\d+vh\]/, 'ohne sm: darf keine feste vh-Höhe stehen')
  assert.match(template, /class="modal modal-top /)
})

test('Zeilenabstand 1,5 und drei wählbare Schriftgrößen', () => {
  assert.match(template, /leading-normal/)
  assert.doesNotMatch(template, /leading-relaxed/)
  assert.match(template, /v-for="s in LONG_TEXT_SIZES"/)
  assert.match(template, /fontSize: `\$\{LONG_TEXT_SIZE_PX\[size\]\}px`/)
})

test('die Schriftgröße umzuschalten nimmt dem Text nicht den Fokus (Tastatur bleibt offen)', () => {
  assert.match(template, /@pointerdown\.prevent/)
})

test('das Fenster blendet ein und fährt nicht von oben herein; Höhenwechsel gleiten', () => {
  const box = template.match(/class="modal-box[^"]*"/)?.[0] ?? ''
  assert.match(box, /(^|\s)translate-none(\s|")/, 'ohne translate-none fährt modal-top von oben herein')
  assert.match(box, /transition-\[height,opacity,transform\]/)
  assert.match(box, /motion-reduce:transition-none/)
})

test('beim Schließen deckt das Fenster die ganze Fläche und blendet nur aus; beim Öffnen gilt die letzte Tastaturhöhe', () => {
  const close = src.slice(src.indexOf('function close()'), src.indexOf('function onClosed()'))
  assert.ok(close.indexOf('track(false)') < close.indexOf('.close()'), 'erst nicht mehr folgen, dann schließen')
  assert.match(close, /height: window\.innerHeight/, 'volle Fläche, sonst blitzt unter dem Fenster die Seite auf')
  assert.match(src, /transitionProperty: closing\.value \? 'opacity'/)
  assert.match(template, /max-sm:bg-transparent/)
  assert.match(src, /lastWithKeyboard\.layout === window\.innerHeight/)
  assert.match(src, /setTimeout\(measure, 700\)/, 'ohne Tastatur muss die Annahme korrigiert werden')
})

test('der Platzhalter wiederholt nicht den Titel', () => {
  assert.doesNotMatch(template, /:placeholder="`\$\{title\}/)
})

test('Textbausteine: der Text wird im Schreib-Fenster bearbeitet, nicht in einem kleinen Textfeld der Karte', () => {
  const snip = readFileSync(new URL('../../apps/pico-pwa/src/components/library/SnippetLibrarySection.vue', import.meta.url), 'utf8')
  const tpl = snip.slice(snip.indexOf('<template>'))
  assert.doesNotMatch(tpl, /<textarea[^>]*v-model="draftText"/, 'kein Textfeld in der Karte')
  assert.match(tpl, /data-snippet-text\s+@click="openBigText"/, 'Vorschau öffnet das Schreib-Fenster')
  assert.match(tpl, /<LongTextDialog[\s\S]*?@close="onBigTextClosed"/)
  assert.match(snip, /function onBigTextClosed\(\): void \{\s*expandOpen\.value = false\s*commitEdit\(\)/, 'Schließen speichert')
})
