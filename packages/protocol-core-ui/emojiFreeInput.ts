// emojiFreeInput.ts - Eingabefelder, die keine Emojis und Symbole annehmen.
//
// Die Bridge kann Emojis nicht tippen, und die Emoji-Taste der Handy-Tastatur lässt sich aus der App heraus
// nicht entfernen. Deshalb nimmt das Feld sie nicht an: Ein Emoji wird gar nicht erst eingefügt oder
// verschwindet sofort wieder. „Emoji“ meint hier jedes Bildzeichen, auch Symbole wie © ™ ♀ ⚠ (stripEmoji in
// typeable.ts). EIN Filter für alle Felder (einzeilig, großes Textfenster, Lückentext, Funktionen):
// Er hängt an einem gemeinsamen Vorfahren (in der App am Dokument) und greift VOR den Feldern selbst ein
// (Capture-Phase). Jedes Feld liest danach schon den bereinigten Text, ohne eigenen Code.
//
// Zwei Stufen:
//   1. beforeinput: Besteht die Eingabe NUR aus Emojis (Emoji-Tastatur, Emoji-Vorschlag über der Tastatur), wird
//      sie abgelehnt. Nichts ändert sich, die Schreibmarke bleibt stehen, und ein Wort, das der Vorschlag
//      ersetzt hätte, bleibt erhalten.
//   2. input: Was trotzdem ankommt (Einfügen, Diktat, gemischter Text, Tastaturen ohne ablehnbares
//      beforeinput), wird aus dem Feld entfernt; die Schreibmarke rückt um die entfernten Zeichen nach vorn.
//
// Eingabemethoden (IME, Wortvorschläge unter Android): Während einer laufenden Komposition
// (compositionstart bis compositionend) wird der Text NICHT angefasst, sonst bricht die Tastatur das Wort ab
// oder verdoppelt es. Bereinigt wird am Ende der Komposition und sicherheitshalber beim Verlassen des Feldes.

import { stripEmoji } from '@resqdocs/protocol-core/typeable'

/** Text ohne Emojis und Symbole und die Position, an der die Schreibmarke danach steht. */
export function stripEmojiAt(value: string, caret: number): { value: string; caret: number } {
  const clean = stripEmoji(value)
  if (clean === value) return { value, caret }
  return { value: clean, caret: Math.min(stripEmoji(value.slice(0, caret)).length, clean.length) }
}

/** Was der Filter von einem Feld braucht (HTMLInputElement und HTMLTextAreaElement erfüllen das). */
export interface TextControl {
  tagName: string
  type?: string
  value: string
  selectionStart: number | null
  setSelectionRange(start: number, end: number): void
  dispatchEvent(event: Event): boolean
  /** Für die Eingrenzung über einen Vorfahren, z. B. `el.closest?.('[data-emoji-free]')`. */
  closest?(selector: string): unknown
}

// Nur Felder mit freiem Text. Zahlen-, Datums- und Auswahlfelder können keine Emojis enthalten, und
// selectionStart wirft dort.
const TEXT_TYPES = new Set(['', 'text', 'search', 'tel', 'url', 'email'])

function textControl(target: unknown): TextControl | null {
  const el = target as Partial<TextControl> | null
  if (!el || typeof el.value !== 'string') return null
  if (el.tagName === 'TEXTAREA') return el as TextControl
  if (el.tagName === 'INPUT' && TEXT_TYPES.has((el.type ?? '').toLowerCase())) return el as TextControl
  return null
}

/** Entfernt Emojis aus dem Feld und hält die Schreibmarke an ihrer Stelle. true = es wurde etwas entfernt. */
export function removeEmojiFrom(el: TextControl): boolean {
  const before = el.value
  let caret: number | null = null
  try {
    caret = el.selectionStart
  } catch {
    /* Feld ohne Schreibmarke */
  }
  const next = stripEmojiAt(before, caret ?? before.length)
  if (next.value === before) return false
  el.value = next.value
  if (caret !== null) {
    try {
      el.setSelectionRange(next.caret, next.caret)
    } catch {
      /* Feld ohne Schreibmarke */
    }
  }
  return true
}

/**
 * Schaltet den Filter für alle Textfelder unterhalb von `root` ein. `applies` grenzt ein (z. B. nur im Einsatz);
 * ohne Angabe gilt er für jedes Textfeld. Gibt die Funktion zum Abschalten zurück.
 */
export function installEmojiFreeInput(root: EventTarget, applies: (el: TextControl) => boolean = () => true): () => void {
  const composing = new WeakSet<object>()
  const control = (e: Event): TextControl | null => {
    const el = textControl(e.target)
    return el && applies(el) ? el : null
  }
  /** Bereinigen und den Feldern Bescheid geben: Sie hören auf `input` und übernehmen den neuen Text. */
  const clean = (el: TextControl): void => {
    if (removeEmojiFrom(el)) el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const onBeforeInput = (e: Event): void => {
    const data = (e as InputEvent).data
    if (!e.cancelable || (e as InputEvent).isComposing || typeof data !== 'string' || data === '') return
    if (control(e) && stripEmoji(data) === '') e.preventDefault()
  }
  const onInput = (e: Event): void => {
    const el = control(e)
    if (!el || (e as InputEvent).isComposing || composing.has(el)) return
    removeEmojiFrom(el) // das Feld selbst behandelt dieses Ereignis gleich danach und liest den bereinigten Text
  }
  const onCompositionStart = (e: Event): void => {
    const el = control(e)
    if (el) composing.add(el)
  }
  const onCompositionEnd = (e: Event): void => {
    const el = control(e)
    if (!el) return
    composing.delete(el)
    clean(el)
  }
  const onLeave = (e: Event): void => {
    const el = control(e)
    if (!el) return
    composing.delete(el)
    clean(el)
  }

  const listeners: [string, (e: Event) => void][] = [
    ['beforeinput', onBeforeInput],
    ['input', onInput],
    ['compositionstart', onCompositionStart],
    ['compositionend', onCompositionEnd],
    ['change', onLeave],
    ['focusout', onLeave],
  ]
  for (const [type, fn] of listeners) root.addEventListener(type, fn, true)
  return () => {
    for (const [type, fn] of listeners) root.removeEventListener(type, fn, true)
  }
}
