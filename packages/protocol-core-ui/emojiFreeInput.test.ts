// node --test --experimental-strip-types
// Eingabefilter: Emojis verschwinden aus dem Feld, die Schreibmarke springt nicht, eine laufende Komposition
// (IME, Wortvorschläge) bleibt unangetastet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installEmojiFreeInput, removeEmojiFrom, stripEmojiAt, type TextControl } from './emojiFreeInput.ts'

/** Ein Feld ohne Browser: Wert, Schreibmarke, Ereignisse. */
class Field extends EventTarget implements TextControl {
  tagName = 'TEXTAREA'
  type = 'textarea'
  value = ''
  selectionStart: number | null = 0
  /** Was die Hörer NACH dem Filter als Wert gesehen haben. */
  seen: string[] = []
  constructor(value = '', caret = value.length) {
    super()
    this.value = value
    this.selectionStart = caret
  }
  /** Das Feld selbst hört auf `input` - wie im Browser nach dem Filter, der in der Capture-Phase davor liegt. */
  listen(): this {
    this.addEventListener('input', () => this.seen.push(this.value))
    return this
  }
  setSelectionRange(start: number): void {
    this.selectionStart = start
  }
  /** Text an der Schreibmarke einfügen, wie es die Tastatur tut, und das Ereignis melden. */
  insert(text: string, init: { composing?: boolean } = {}): void {
    const at = this.selectionStart ?? this.value.length
    this.value = this.value.slice(0, at) + text + this.value.slice(at)
    this.selectionStart = at + text.length
    this.fire('input', init)
  }
  fire(type: string, init: { composing?: boolean; data?: string | null; cancelable?: boolean } = {}): Event {
    const e = new Event(type, { cancelable: init.cancelable ?? false })
    Object.defineProperty(e, 'isComposing', { value: init.composing ?? false })
    Object.defineProperty(e, 'data', { value: init.data ?? null })
    this.dispatchEvent(e)
    return e
  }
}
const field = (value = '', caret = value.length): Field => {
  const f = new Field(value, caret)
  installEmojiFreeInput(f)
  return f.listen()
}

test('stripEmojiAt: die Schreibmarke rückt um die davor entfernten Zeichen nach vorn', () => {
  assert.deepEqual(stripEmojiAt('abc', 2), { value: 'abc', caret: 2 }, 'ohne Emoji bleibt alles, wie es ist')
  assert.deepEqual(stripEmojiAt('ab😀cd', 4), { value: 'abcd', caret: 2 }, 'Marke hinter dem Emoji')
  assert.deepEqual(stripEmojiAt('ab😀cd', 1), { value: 'abcd', caret: 1 }, 'Marke vor dem Emoji')
  assert.deepEqual(stripEmojiAt('😀ab👍🏽cd🇩🇪', 8), { value: 'abcd', caret: 2 }, 'mehrere, Marke in der Mitte')
  assert.deepEqual(stripEmojiAt('a👨‍👩‍👧b', 9), { value: 'ab', caret: 1 }, 'ganze Folge')
  assert.deepEqual(stripEmojiAt('a👨‍👩‍👧b', 4), { value: 'ab', caret: 1 }, 'Marke mitten in einer Folge')
  assert.deepEqual(stripEmojiAt('😀', 2), { value: '', caret: 0 })
})

test('Emoji an der Schreibmarke: verschwindet sofort, Marke steht wieder an der Stelle', () => {
  const f = field('Pat. wach', 4)
  f.insert('😀')
  assert.equal(f.value, 'Pat. wach')
  assert.equal(f.selectionStart, 4)
  assert.deepEqual(f.seen, ['Pat. wach'], 'das Feld liest schon den bereinigten Text')
})

test('gewöhnlicher Text, Umlaute und typografische Zeichen bleiben im Feld', () => {
  const f = field()
  f.insert('„Größe“ – 5 … ç ✓ 1 # *')
  assert.equal(f.value, '„Größe“ – 5 … ç ✓ 1 # *')
  assert.equal(f.selectionStart, f.value.length)
})

test('eingefügter Text mit Emojis: nur die Emojis fallen heraus', () => {
  const f = field('A: ', 3)
  f.insert('gut 👍🏽 – ok 🇩🇪 1️⃣')
  assert.equal(f.value, 'A: gut – ok ')
  assert.equal(f.selectionStart, f.value.length)
})

test('Symbole wie © ♀ ⚠ werden ebenso wenig angenommen', () => {
  const f = field('Pat. ', 5)
  assert.equal(f.fire('beforeinput', { data: '♀', cancelable: true }).defaultPrevented, true)
  f.insert('♀, 54 J. ⚠ Aspirin® ©')
  assert.equal(f.value, 'Pat. , 54 J. Aspirin ')
  assert.equal(f.selectionStart, f.value.length)
})

test('Schreibmarke hinter einem entfernten Wort samt Leerzeichen steht richtig', () => {
  assert.deepEqual(stripEmojiAt('gut 😀 weiter', 6), { value: 'gut weiter', caret: 4 }, 'Marke direkt hinter dem Emoji')
  assert.deepEqual(stripEmojiAt('gut 😀 weiter', 7), { value: 'gut weiter', caret: 4 }, 'Marke hinter dem Leerzeichen')
  assert.deepEqual(stripEmojiAt('gut 😀 weiter', 9), { value: 'gut weiter', caret: 6 })
})

test('beforeinput: eine Eingabe nur aus Emojis wird abgelehnt, alles andere nicht', () => {
  const f = field('Pizza', 5)
  assert.equal(f.fire('beforeinput', { data: '🍕', cancelable: true }).defaultPrevented, true, 'Emoji-Taste oder Emoji-Vorschlag')
  assert.equal(f.fire('beforeinput', { data: '👨‍👩‍👧', cancelable: true }).defaultPrevented, true)
  assert.equal(f.fire('beforeinput', { data: 'a', cancelable: true }).defaultPrevented, false)
  assert.equal(f.fire('beforeinput', { data: 'ok 👍', cancelable: true }).defaultPrevented, false, 'gemischt: wird danach bereinigt')
  assert.equal(f.fire('beforeinput', { data: null, cancelable: true }).defaultPrevented, false, 'Löschen, Einfügen ohne Text')
  assert.equal(f.fire('beforeinput', { data: '😀', cancelable: true, composing: true }).defaultPrevented, false, 'während einer Komposition nie')
  assert.equal(f.value, 'Pizza')
})

test('laufende Komposition: der Text wird nicht angefasst, erst an ihrem Ende bereinigt', () => {
  const f = field()
  f.fire('compositionstart')
  f.insert('ni😀', { composing: true })
  assert.equal(f.value, 'ni😀', 'isComposing: unangetastet')
  f.insert('h') // manche Browser melden isComposing nicht - es zählt compositionstart
  assert.equal(f.value, 'ni😀h', 'zwischen compositionstart und compositionend: unangetastet')
  f.fire('compositionend')
  assert.equal(f.value, 'nih')
  assert.equal(f.selectionStart, 3)
  assert.equal(f.seen.at(-1), 'nih', 'das Feld bekommt danach ein input mit dem bereinigten Text')
  f.insert('😀')
  assert.equal(f.value, 'nih', 'nach der Komposition greift der Filter wieder sofort')
})

test('beim Verlassen des Feldes wird sicherheitshalber bereinigt', () => {
  const f = field()
  f.fire('compositionstart')
  f.insert('a😀', { composing: true })
  f.fire('focusout')
  assert.equal(f.value, 'a')
  const g = field()
  g.value = 'b🙂' // ohne input-Ereignis ins Feld gelangt
  g.fire('change')
  assert.equal(g.value, 'b')
  assert.equal(g.seen.at(-1), 'b')
})

test('nur Textfelder; andere Elemente und ausgenommene Felder bleiben unberührt', () => {
  const number = new Field('1😀')
  number.tagName = 'INPUT'
  number.type = 'number'
  installEmojiFreeInput(number)
  number.fire('input')
  assert.equal(number.value, '1😀')

  const search = new Field('a😀')
  search.tagName = 'INPUT'
  search.type = 'search'
  installEmojiFreeInput(search)
  search.fire('input')
  assert.equal(search.value, 'a')

  const outside = new Field('a😀')
  installEmojiFreeInput(outside, () => false)
  outside.fire('input')
  assert.equal(outside.value, 'a😀', 'applies() grenzt ein')
})

test('abschalten: danach greift der Filter nicht mehr', () => {
  const f = new Field()
  const stop = installEmojiFreeInput(f)
  f.insert('😀')
  assert.equal(f.value, '')
  stop()
  f.insert('😀')
  assert.equal(f.value, '😀')
})

test('Feld ohne Schreibmarke: der Text wird trotzdem bereinigt', () => {
  const f = new Field('a😀b')
  Object.defineProperty(f, 'selectionStart', {
    get() {
      throw new Error('kein Auswahlbereich')
    },
  })
  assert.equal(removeEmojiFrom(f), true)
  assert.equal(f.value, 'ab')
  assert.equal(removeEmojiFrom(f), false)
})
