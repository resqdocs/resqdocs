// Oberstes Fenster finden und auf seinem eigenen Weg schließen (backLayer.ts): Regeln mit nachgebauten Elementen,
// dazu die Zusagen der Escape-Behandlung am Quelltext.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { closeRoute, layerOf, LAYER_SELECTOR, type LayerEl } from './backLayer.ts'

interface Fake extends LayerEl {
  name: string
}
/** Element mit den Selektoren, auf die es passt, seinem Fenster (closest) und Kindern je Selektor. */
function el(name: string, opts: { is?: string[]; layer?: Fake | null; self?: boolean; kids?: Record<string, Fake> } = {}): Fake {
  const me: Fake = {
    name,
    matches: (sel) => sel.split(',').some((s) => (opts.is ?? []).includes(s.trim())),
    closest: (sel) => (sel === LAYER_SELECTOR ? (opts.self ? me : (opts.layer ?? null)) : null),
    querySelector: (sel) => opts.kids?.[sel] ?? null,
  }
  return me
}

test('was als Fenster zählt: offenes <dialog>, offenes daisyUI-Fenster, bildschirmfüllende Fläche', () => {
  assert.equal(LAYER_SELECTOR, 'dialog[open], .modal-open, .fixed.inset-0')
})

test('oberstes Fenster: das erste Element in der Bildschirmmitte, das in einem Fenster liegt', () => {
  const sheet = el('blatt', { is: ['.modal-open'], self: true })
  const inSheet = el('knopf im blatt', { layer: sheet })
  const tab = el('inhalt des tabs')
  assert.equal(layerOf([inSheet, tab]), sheet)
  assert.equal(layerOf([tab]), null, 'nur Tab-Inhalt: kein Fenster offen')
  assert.equal(layerOf([]), null)
  // Eine Erklärung (ⓘ) liegt über ihrem bildschirmfüllenden Rand-Knopf: Die Fläche selbst gehört zu keinem Fenster,
  // der Knopf darunter ist das Fenster.
  const rand = el('rand der erklärung', { is: ['button', '.fixed.inset-0'], self: true })
  assert.equal(layerOf([el('erklärung'), rand, inSheet]), rand, 'oberstes zuerst')
})

test('Schließen-Weg 1: Fenster mit eigener Escape-Behandlung bekommt Escape (kennt Zwischenschritte)', () => {
  const marked = el('abbrechen')
  const options = el('optionen', { is: ['.modal-open', '[data-back-escape]'], kids: { '[data-back-close]': marked } })
  assert.deepEqual(closeRoute(options), { how: 'escape', el: options })
})

test('Schließen-Weg 2: gekennzeichneter Knopf des Fensters geht vor dem Rand', () => {
  const later = el('später')
  const edge = el('rand')
  const update = el('hinweis', { is: ['.fixed.inset-0'], kids: { '[data-back-close]': later } })
  assert.deepEqual(closeRoute(update), { how: 'click', el: later })
  const sheet = el('blatt', { is: ['.modal-open'], kids: { '[data-back-close]': later, ':scope > .modal-backdrop': edge } })
  assert.deepEqual(closeRoute(sheet), { how: 'click', el: later })
})

test('Schließen-Weg 3: sonst der Rand, wie ein Tipp daneben', () => {
  const edge = el('rand')
  const sheet = el('blatt', { is: ['.modal-open'], kids: { ':scope > .modal-backdrop': edge } })
  assert.deepEqual(closeRoute(sheet), { how: 'click', el: edge })
  // <dialog>: das Formular am Rand; ohne Formular dialog.close().
  const form = el('formular-knopf')
  const dialog = el('dialog', { is: ['dialog[open]'], kids: { ':scope > form[method="dialog"] button': form } })
  assert.deepEqual(closeRoute(dialog), { how: 'click', el: form })
  const bare = el('dialog ohne rand', { is: ['dialog[open]'] })
  assert.deepEqual(closeRoute(bare), { how: 'dialog', el: bare })
})

test('Schließen-Weg 4: ein Knopf, der selbst den Bildschirm deckt (Rand von Menü oder Erklärung)', () => {
  const rand = el('rand', { is: ['button', '.fixed.inset-0'] })
  assert.deepEqual(closeRoute(rand), { how: 'click', el: rand })
})

test('ohne eigenen Schließen-Weg bleibt ein Fenster offen (Hinweis beim Start, Blatt ohne Rand)', () => {
  assert.equal(closeRoute(el('hinweis beim start', { is: ['.fixed.inset-0'] })), null)
  assert.equal(closeRoute(el('blatt ohne rand', { is: ['.modal-open'] })), null)
})

const src = readFileSync(new URL('./backLayer.ts', import.meta.url), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('geschlossen wird nur über das eigene Bedienelement: Klick, Escape ans Fenster oder dialog.close()', () => {
  const close = code.slice(code.indexOf('export function closeLayer'), code.indexOf('export function installEscapeClose'))
  assert.match(close, /if \(!route\) return 'locked'/)
  assert.match(close, /new KeyboardEvent\('keydown', \{ key: 'Escape', bubbles: true, cancelable: true \}\)/)
  assert.match(close, /\.close\(\)/)
  assert.match(close, /el\.click\(\)/)
  assert.doesNotMatch(close, /\.remove\(|classList|removeAttribute|style\./, 'kein Eingriff am Fenster vorbei')
})

test('oberstes Fenster kommt aus dem Hit-Test der Bildschirmmitte; ohne Layout gibt es keines', () => {
  assert.match(code, /typeof doc\.elementsFromPoint !== 'function'\) return null/)
  assert.match(code, /doc\.elementsFromPoint\(view\.innerWidth \/ 2, view\.innerHeight \/ 2\)/)
})

test('Escape schließt nie doppelt: nur echte Taste, unbehandelt, und dasselbe Fenster liegt danach noch oben', () => {
  const esc = code.slice(code.indexOf('export function installEscapeClose'))
  assert.match(esc, /seen = e\.key === 'Escape' && e\.isTrusted \? topLayer\(doc\) : null/, 'vor allen anderen gemerkt, nur echte Tasten')
  assert.match(esc, /true,\s*\)/, 'Merken in der Capture-Phase')
  assert.match(esc, /if \(!layer \|\| e\.key !== 'Escape' \|\| e\.defaultPrevented\) return/)
  assert.match(esc, /if \(layer\.matches\('dialog\[open\], \[data-back-escape\]'\)\) return/, 'Browser bzw. Fenster schließen selbst')
  assert.match(esc, /setTimeout\(\(\) => \{\s*if \(topLayer\(doc\) === layer\) closeLayer\(layer\)/)
})

test('Fenster mit Zwischenschritten nennt seine eigene Escape-Behandlung', () => {
  const options = readFileSync(new URL('./components/OptionsDialog.vue', import.meta.url), 'utf8')
  assert.match(options, /<div class="modal modal-open"[^>]*data-options-dialog data-back-escape/)
  assert.match(options, /document\.addEventListener\('keydown', onKeydown\)/)
})
