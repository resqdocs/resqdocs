// Wächter für das Schreib-Fenster des großen Textfelds. Geprüft wird die Quelle: die Eigenschaften unten sind
// Entscheidungen aus dem Gerätetest (Video vom iPhone) und sollen nicht unbemerkt zurückfallen.
// Höhe und Lage bei offener Tastatur regelt fullscreenKeyboard.ts (gemeinsam mit den Lückentext-Fenstern):
// App = Layout-Höhe, einmalige Anpassung (Maintainer 2026-11-23); Online-Editor = sichtbarer Bereich.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const src = read('components/LongTextDialog.vue')
const template = src.slice(src.indexOf('<template>'))
const fit = read('fullscreenKeyboard.ts')
const fn = (name: string): string => {
  const start = fit.indexOf(`function ${name}(`)
  return fit.slice(start, fit.indexOf('\n  }\n', start))
}

test('„Fertig“ steht im Kopf über dem Text: unten läge der Knopf hinter der Tastatur', () => {
  const done = template.indexOf('data-long-text-done')
  const area = template.indexOf('<textarea')
  assert.ok(done > 0 && area > 0 && done < area, '„Fertig“ muss vor der Textarea stehen')
  assert.ok(template.indexOf('<header') < done && done < template.indexOf('</header>'), '„Fertig“ gehört in den Kopf')
})

test('das Fenster endet über der Tastatur: Höhe aus fullscreenKeyboard, sonst die volle Layout-Höhe', () => {
  assert.match(src, /useFullscreenKeyboard\(\{ remember: true \}\)/)
  assert.match(template, /h-\[var\(--lt-h,100dvh\)\]/)
  assert.match(template, /:style="boxStyle"/)
  assert.match(template, /:style="dialogStyle"/)
})

test('App: Höhe = Layout, kein Nachführen, kein Versatz, keine gemerkte Tastaturhöhe, nichts gleitet', () => {
  // Ist der Host eingesteckt (App), bleibt --lt-h ungesetzt (100dvh) und nur die Deckkraft hat einen Übergang.
  assert.match(fit, /if \(host\) return \{ transitionProperty: 'opacity' \}/)
  // Kein Abo auf visualViewport, keine Vorwegnahme, kein Nachmessen.
  assert.match(fn('track'), /if \(host \|\| !vv\) return/)
  assert.match(fn('prepare'), /closing\.value = false\s*if \(host\) return/)
  assert.match(fn('follow'), /^function follow\(\): void \{\s*if \(host\) return/)
  assert.match(fn('release'), /closing\.value = true\s*if \(host\) return/)
  // Offen heißt hier: die Tastatur ist offen (Ereignisse des Plugins), nicht gemessen.
  assert.match(fit, /const covered = computed\(\(\) => \(host \? host\.open\.value : measuredCover\.value\)\)/)
  const app = read('../../apps/pico-pwa/src/App.vue')
  assert.match(app, /provide\(keyboardLayoutKey, \{ open: keyboardOpen \}\)/)
})

test('Online-Editor: das Fenster folgt dem sichtbaren Bereich über der Tastatur', () => {
  assert.match(fit, /window\.visualViewport/)
  assert.match(fn('measure'), /box\.value = visibleBox\(vv, layout\)/)
  assert.match(fn('track'), /vv\.addEventListener\(ev, measure\)/)
  assert.match(fit, /'--lt-h': `\$\{box\.value\.height\}px`/)
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

test('das Fenster blendet ein und fährt nicht von oben herein; im Online-Editor gleiten Höhenwechsel', () => {
  const box = template.match(/class="modal-box[^"]*"/)?.[0] ?? ''
  assert.match(box, /(^|\s)translate-none(\s|")/, 'ohne translate-none fährt modal-top von oben herein')
  assert.match(box, /transition-\[height,opacity,transform\]/)
  assert.match(box, /motion-reduce:transition-none/)
})

test('beim Schließen deckt das Fenster die ganze Fläche und blendet nur aus; Online-Editor: beim Öffnen gilt die letzte Tastaturhöhe', () => {
  const close = src.slice(src.indexOf('function close()'), src.indexOf('function onClosed()'))
  assert.ok(close.indexOf('kb.release()') >= 0 && close.indexOf('kb.release()') < close.indexOf('.close()'), 'erst nicht mehr folgen, dann schließen')
  const release = fn('release')
  assert.ok(release.indexOf('track(false)') < release.indexOf('closing.value = true'))
  assert.match(release, /height: window\.innerHeight/, 'volle Fläche, sonst blitzt unter dem Fenster die Seite auf')
  assert.match(fit, /transitionProperty: closing\.value \? 'opacity'/)
  assert.match(template, /max-sm:bg-transparent/)
  assert.match(fit, /lastWithKeyboard\.layout === window\.innerHeight/)
  assert.match(fit, /setTimeout\(measure, 700\)/, 'ohne Tastatur muss die Annahme korrigiert werden')
})

test('der Platzhalter wiederholt nicht den Titel', () => {
  assert.doesNotMatch(template, /:placeholder="`\$\{title\}/)
})

test('Vorschaufeld mit fester Höhe für zwei Zeilen: nach dem Schreiben rückt darunter nichts nach', () => {
  const field = read('components/LongTextField.vue')
  const btn = field.slice(field.indexOf('<template>')).match(/<button[^>]*class="([^"]*)"/)?.[1] ?? ''
  assert.match(btn, /(^|\s)h-\[4\.125rem\](\s|$)/)
  assert.doesNotMatch(btn, /(^|\s)min-h-\[/, 'keine Mindesthöhe, die mit dem Text wächst')
  assert.match(btn, /overflow-hidden/)
  assert.match(field, /class="line-clamp-2 /)
  // Einsatz: die Fläche „antippen zum Schreiben“ ist beim großen Textfeld genauso hoch, der erste Tipp springt nicht.
  const einsatz = read('../../apps/pico-pwa/src/components/rebuild/EinsatzField.vue')
  assert.match(einsatz, /:class="useLongText \? 'h-\[4\.125rem\]' : 'min-h-11'"[^>]*data-write-directly/)
})

test('Textbausteine: der Text wird im Schreib-Fenster bearbeitet, nicht in einem kleinen Textfeld der Karte', () => {
  const snip = read('../../apps/pico-pwa/src/components/library/SnippetLibrarySection.vue')
  const tpl = snip.slice(snip.indexOf('<template>'))
  assert.doesNotMatch(tpl, /<textarea[^>]*v-model="draftText"/, 'kein Textfeld in der Karte')
  assert.match(tpl, /data-snippet-text\s+@click="openBigText"/, 'Vorschau öffnet das Schreib-Fenster')
  assert.match(tpl, /<LongTextDialog[\s\S]*?@close="onBigTextClosed"/)
  assert.match(snip, /function onBigTextClosed\(\): void \{\s*expandOpen\.value = false\s*commitEdit\(\)/, 'Schließen speichert')
})
