// untypeableNotice.ts - Wortlaut des Hinweises auf Zeichen, die die Bridge nicht tippen kann.
// Ein Wortlaut für App (vor dem Senden, beim Text für den Knopf an der Bridge) und Online-Editor (am Protokolltext).

import { untypeable } from '@resqdocs/protocol-core/typeable'

/** So viele Zeichen nennt der Hinweis höchstens beim Namen; der Rest wird gezählt. */
export const UNTYPEABLE_SHOWN = 8

/**
 * Was am Zielgerät anstelle eines nicht tippbaren Zeichens steht. Die Bridge tippt [?] mit den Tasten der
 * Windows-Belegung; am iPad liegen auf diesen Tasten die geschweiften Klammern, dort kommt {?} an.
 */
export function typingMarker(os?: string | null): string {
  return os === 'ios' ? '{?}' : '[?]'
}

/** Ein Zeichen so, dass man es im Hinweis sieht: Ein Akzent ohne Buchstaben bekommt einen Platzhalter. */
function shown(char: string): string {
  return /^\p{M}/u.test(char) ? `◌${char}` : char
}

/**
 * Der Hinweis zum Protokolltext, '' wenn alles tippbar ist. Die Zahl meint verschiedene Zeichen (jedes wird
 * einmal genannt), nicht die Stellen im Text.
 */
export function untypeableNotice(text: string, marker: string = typingMarker()): string {
  const chars = untypeable(text)
  if (!chars.length) return ''
  const named = chars.slice(0, UNTYPEABLE_SHOWN).map(shown).join(' ')
  const more = chars.length - UNTYPEABLE_SHOWN
  const list = more > 0 ? `${named} und ${more} ${more === 1 ? 'weiteres' : 'weitere'}` : named
  return `${chars.length} Zeichen kann die Bridge nicht tippen: ${list}. Dort kommt ${marker} an.`
}
