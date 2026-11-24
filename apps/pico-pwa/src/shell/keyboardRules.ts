// Regeln zur Bildschirmtastatur ohne Abhängigkeit von Capacitor (in Node prüfbar). Verwendet von keyboard.ts.

const NOT_TEXT = /^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/

/** Hat dieses Element eine Bildschirmtastatur? (Textfelder, Textbereiche, editierbare Flächen) */
export function isTextField(el: Element | null | undefined): el is HTMLElement {
  if (!el) return false
  const h = el as HTMLElement
  if (h.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !NOT_TEXT.test((el as HTMLInputElement).type)
}

/** Einzeiliges Textfeld: Enter schließt die Tastatur (statt des fehlenden ✓). */
export function isSingleLine(el: Element | null | undefined): el is HTMLInputElement {
  return isTextField(el) && el.tagName === 'INPUT'
}

/** Elemente, die einen Tipp selbst verarbeiten: ein Tipp darauf lässt die Tastatur in Ruhe. */
const INTERACTIVE = 'input, textarea, select, button, a[href], label, summary, [contenteditable], [role="button"], [tabindex]'

/** Ein Tipp (kein Wischen) auf eine Fläche ohne eigene Bedienung schließt die Tastatur. */
export function tapClosesKeyboard(target: Element | null, active: Element | null): boolean {
  if (!isTextField(active) || !target) return false
  if (active.contains(target)) return false
  return !target.closest(INTERACTIVE)
}

/** Bewegung in px, bis zu der eine Berührung als Tipp zählt; darüber ist es Scrollen. */
export const TAP_SLOP = 10
