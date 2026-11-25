// Bildschirmtastatur: Rechenkern und Wächter für die gemeinsame Regel „Fenster und Knöpfe enden über der Tastatur".
// Zwei Modelle: In der App verkleinert die Tastatur das Layout (@capacitor/keyboard, iOS und Android), das Dokument
// scrollt nie. Im Online-Editor (iOS-Safari) liegt sie über der Seite; dort folgen Fenster dem sichtbaren Bereich.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keyboardVars, fitHeight, FIT_MIN_PX, layoutShrunk } from './keyboardInset.ts'

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8')
const noComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const APP = '../../apps/pico-pwa'
const EDITOR = '../../apps/protocol-editor'

test('keyboardVars: ohne Tastatur volle Höhe, nichts verdeckt', () => {
  assert.deepEqual(keyboardVars({ height: 852, offsetTop: 0 }, 852), { height: 852, top: 0, inset: 0, covered: false })
  assert.deepEqual(keyboardVars(null, 852), { height: 852, top: 0, inset: 0, covered: false })
  // kleine Abweichung (eingeblendete Leiste) ist keine Tastatur
  assert.equal(keyboardVars({ height: 800, offsetTop: 0 }, 852).covered, false)
})

test('keyboardVars: Tastatur verdeckt den unteren Teil, auch wenn iOS die Seite hochschiebt', () => {
  assert.deepEqual(keyboardVars({ height: 516, offsetTop: 0 }, 852), { height: 516, top: 0, inset: 336, covered: true })
  // Seite um 140 px hochgeschoben: sichtbar ist 140…656, von unten ragt die Tastatur noch 196 px ins Layout
  assert.deepEqual(keyboardVars({ height: 516, offsetTop: 140 }, 852), { height: 516, top: 140, inset: 196, covered: true })
})

test('fitHeight: eine Liste endet über der Tastatur, bleibt aber mindestens zwei Zeilen hoch', () => {
  assert.equal(fitHeight({ height: 516, offsetTop: 0 }, 300), 208)
  assert.equal(fitHeight({ height: 516, offsetTop: 140 }, 300), 348)
  assert.equal(fitHeight({ height: 363, offsetTop: 0 }, 340), FIT_MIN_PX)
})

test('Online-Editor: Fenster (daisyUI und eigene) folgen dem sichtbaren Bereich; die selbst ausgerichteten sind ausgenommen', () => {
  const css = read('keyboardViewport.css')
  assert.match(css, /:root\[data-keyboard\] \.modal:is\(\.modal-open, \[open\]\):not\(\.modal-top\) > \.modal-box/)
  assert.match(css, /:root\[data-keyboard\] \.overlay-backdrop > \.overlay-surface/)
  // Der Rahmen bleibt bildschirmfüllend (wie beim großen Textfeld): keine Seite zwischen Fenster und Tastatur.
  assert.doesNotMatch(css, /\.modal:is\(\.modal-open, \[open\]\):not\(\.modal-top\),?\s*(\n[^{]*)?\{[^}]*height: var\(--vv-h/)
  // Fenster von unten reichen bis hinter die Tastatur, der Inhalt endet darüber.
  assert.match(css, /padding-bottom: calc\(var\(--kb-inset, 0px\) \+ 1rem\)/)
  assert.match(css, /env\(safe-area-inset-top, 0px\)/)
  assert.match(css, /max-height: calc\(var\(--vv-h, 100dvh\) - env/)
  assert.match(css, /margin-top: var\(--vv-top/)
  assert.match(css, /margin-bottom: var\(--kb-inset/)
  for (const f of ['keyboard.css', 'keyboardViewport.css']) {
    assert.doesNotMatch(noComments(read(f)), /@layer/, `${f}: ohne @layer, sonst gewinnen die Höhen-Klassen der Fenster`)
  }
})

test('App: Fenster enden über der Tastatur, weil die Tastatur das Layout verkleinert; keine Messung des sichtbaren Bereichs', () => {
  // Die Regeln für den sichtbaren Bereich von iOS-Safari stehen nicht in der gemeinsamen Datei, die App lädt sie nicht.
  const base = noComments(read('keyboard.css'))
  assert.doesNotMatch(base, /--vv-h|--vv-top/)
  assert.doesNotMatch(read(`${APP}/src/style.css`), /@import "[^"]*keyboardViewport\.css"/)
  // Fenster von unten bleiben unter der Statusleiste und enden mit dem Layout an der Tastatur.
  assert.match(base, /:root\[data-keyboard-open\] \.modal\.modal-bottom > \.modal-box,\s*:root\[data-keyboard-open\] \.overlay-surface \{[^}]*max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\)/)
  // Das Plugin verkleinert die WebView auf iOS (Android von sich aus); die App misst nichts nach.
  assert.match(read(`${APP}/capacitor.config.ts`), /Keyboard: \{\s*resize: 'native'/)
  const main = read(`${APP}/src/main.ts`)
  assert.doesNotMatch(noComments(main), /installKeyboardInset/)
  assert.match(main, /installAppKeyboard\(\)/)
})

test('Regel: Knopfzeilen bleiben stehen (Fenster) bzw. stehen über der Tastatur (Karten)', () => {
  const css = read('keyboard.css')
  assert.match(css, /\.modal-box \.modal-action,\s*\.kb-actions \{[^}]*position: sticky;[^}]*bottom: 0;/)
  assert.match(css, /:root\[data-keyboard\] \.kb-sticky \{[^}]*position: sticky;[^}]*bottom: var\(--kb-inset, 0px\)/)
  // App: auf iOS steht die Knopfzeile einer Karte wie bisher über der Tastatur. Das Layout endet dort an der
  // Tastatur, sticky bottom 0 im Bereich des Tabs genügt (--kb-inset bleibt ungesetzt). Android unverändert.
  const kb = read(`${APP}/src/shell/keyboard.ts`)
  assert.match(kb, /if \(ios\) root\.toggleAttribute\('data-keyboard', open\)/)
  assert.doesNotMatch(noComments(kb), /--kb-inset/)
})

test('Online-Editor bindet Regel und Messung ein, die App nur die gemeinsame Regel und das Plugin', () => {
  const editorCss = read(`${EDITOR}/src/style.css`)
  assert.match(editorCss, /@import "\.\.\/\.\.\/\.\.\/packages\/protocol-core-ui\/keyboard\.css";/)
  assert.match(editorCss, /@import "\.\.\/\.\.\/\.\.\/packages\/protocol-core-ui\/keyboardViewport\.css";/)
  assert.match(read(`${EDITOR}/src/main.ts`), /installKeyboardInset\(\)/)
  assert.match(read(`${APP}/src/style.css`), /@import "\.\.\/\.\.\/\.\.\/packages\/protocol-core-ui\/keyboard\.css";/)
})

test('Betroffene Stellen tragen die Regel', () => {
  assert.match(read('components/functions/MedplanFunction.vue'), /v-fit-keyboard/)
  // Medikationsplan und Kontakte: Die Liste liegt in einem Fenster, „Fertig“ steht dort oben im Kopf und damit
  // nie hinter der Tastatur. Die Karte hat keinen eigenen „Fertig“-Knopf mehr, der über der Tastatur kleben müsste.
  for (const f of ['MedplanFunction', 'AerzteFunction']) {
    assert.doesNotMatch(read(`components/functions/${f}.vue`), /kb-sticky/, f)
    assert.match(read(`components/functions/${f}.vue`), /<ListSheet v-if="sheetOpen" :title="label" @close="closeSheet">/, f)
  }
  const sheet = read('components/functions/ListSheet.vue')
  assert.match(sheet, /<header [^>]*>\s*<h3[^>]*>\{\{ title \}\}<\/h3>\s*<button [^>]*data-list-sheet-done[^>]*>Fertig<\/button>\s*<\/header>/)
  assert.match(sheet, /useFullscreenKeyboard\(\)/, 'Höhe endet über der Tastatur, wie beim großen Textfeld')
  assert.match(sheet, /overflow-y-auto overscroll-contain/, 'die Liste scrollt im Fenster')
  for (const f of ['rebuild/MedplanReviewSheet.vue', 'rebuild/AerzteReviewSheet.vue', 'rebuild/LibraryBar.vue']) {
    assert.match(read(`${APP}/src/components/${f}`), /kb-actions/, f)
  }
  assert.match(read(`${APP}/src/components/settings/PznLibraryPage.vue`), /class="kb-sticky /)
  // Textbausteine: Knopfzeile NICHT an der Tastatur (lag sonst über dem Titel); die Karte rückt als Ganzes darüber.
  const snip = read(`${APP}/src/components/library/SnippetLibrarySection.vue`)
  assert.doesNotMatch(snip, /class="kb-sticky/)
  assert.match(snip, /@focus="scrollIntoViewSoon\(editCardEl\)"/)
  // Das Layout endet an der Tastatur: ein kleiner Rand genügt, die Karte wird nach dem Verkleinern nachgezogen.
  assert.match(snip, /\[scroll-margin-block-end:1rem\]/)
  const scroll = read(`${APP}/src/shell/tabScroll.ts`)
  assert.match(scroll, /window\.addEventListener\('resize', once\)/)
  // Rechner-Fenster: die Knopfzeile ist eine .modal-action und bleibt damit stehen.
  for (const f of ['News2Sheet', 'BmiSheet', 'PackYearsSheet']) assert.match(read(`components/functions/${f}.vue`), /class="modal-action/, f)
})

test('layoutShrunk: Android-Tastatur erkannt, wenn ein Feld den Fokus hat und das Layout deutlich schrumpft', () => {
  assert.equal(layoutShrunk(516, 852, true), true)
  assert.equal(layoutShrunk(516, 852, false), false, 'ohne Eingabefeld (z. B. geteilter Bildschirm) keine Tastatur')
  assert.equal(layoutShrunk(820, 852, true), false, 'eingeblendete Leiste ist keine Tastatur')
})

test('Regel: auf iOS und Android gleich - Linie über der Knopfzeile, kein Home-Balken-Abstand über der Tastatur', () => {
  const css = read('keyboard.css')
  assert.match(css, /:root\[data-keyboard-open\] \.modal-box \.modal-action,\s*:root\[data-keyboard-open\] \.kb-actions \{[^}]*box-shadow/)
  assert.match(css, /:root\[data-keyboard-open\] \.modal\.modal-bottom > \.modal-box,\s*:root\[data-keyboard-open\] \.overlay-surface \{[^}]*max-height: calc\(100dvh[^}]*padding-bottom: 1rem;/)
  // Online-Editor: aus der Messung.
  assert.match(read('keyboardInset.ts'), /toggleAttribute\('data-keyboard-open', v\.covered \|\| layoutShrunk/)
  // App: aus den Ereignissen des Plugins, auf beiden Plattformen gleich.
  const kb = read(`${APP}/src/shell/keyboard.ts`)
  assert.match(kb, /Keyboard\.addListener\('keyboardWillShow', \(\) => setOpen\(true, ios\)\)/)
  assert.match(kb, /Keyboard\.addListener\('keyboardWillHide', \(\) => setOpen\(false, ios\)\)/)
  assert.match(kb, /root\.toggleAttribute\('data-keyboard-open', open\)/)
})

test('Regel: die untere Navigationsleiste ist bei offener Tastatur ausgeblendet (hing auf iOS mitten im Bild)', () => {
  assert.match(read('keyboard.css'), /:root\[data-keyboard-open\] \.dock \{\s*display: none;/)
  assert.match(read(`${APP}/src/App.vue`), /<nav class="dock /)
})
