// Struktur-Test fuer einen Layout-Fehler, der nur auf dem Geraet sichtbar wurde: Bei grosser Schrift passte
// „Arzt aus Medikationsplan scannen" nicht neben „Eintrag". Die Knoepfe brachen nicht um, die Leiste wurde
// breiter als das Display und schob die ganze Einsatz-Seite seitlich (Logo und Haken links abgeschnitten).
// Festgehalten wird die Struktur: jede Aktionsleiste unter den Listen-Funktionen darf umbrechen, und ihre
// Knoepfe duerfen ihren Text umbrechen. Es gibt kein DOM-Testsetup fuer .vue-Dateien in der App.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (name: string): string => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8')

for (const file of ['AerzteFunction.vue', 'MedplanFunction.vue']) {
  test(`${file}: Aktionsleiste bricht um statt die Seite zu verbreitern`, () => {
    const src = read(file)
    const start = src.indexOf('data-aktionsleiste')
    assert.ok(start > 0, 'Aktionsleiste ist markiert')
    const open = src.lastIndexOf('<div', start)
    const close = src.indexOf('</div>', start)
    const leiste = src.slice(open, close)
    assert.match(leiste.slice(0, leiste.indexOf('>')), /class="[^"]*\bflex-wrap\b/, 'Leiste darf umbrechen')
    const buttons = [...leiste.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
    assert.equal(buttons.length, 2)
    for (const b of buttons) {
      assert.match(b, /\bwhitespace-normal\b/, 'Knopftext darf umbrechen')
      assert.match(b, /\bh-auto\b/, 'Knopf wächst mit')
      assert.match(b, /\bmin-h-11\b/, 'Tippziel bleibt mindestens 44 px hoch')
      // daisyUI setzt .btn auf flex-shrink:0 - ohne shrink + min-w-0 bliebe ein zu langer Knopf zu breit.
      assert.match(b, /\bshrink\b/, 'Knopf darf schrumpfen')
      assert.match(b, /\bmin-w-0\b/, 'Knopf darf schmaler als sein Text werden')
    }
  })
}
