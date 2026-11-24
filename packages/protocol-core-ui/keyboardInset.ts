// Bildschirmtastatur: iOS legt sie ÜBER die Seite und verkleinert nur den sichtbaren Bereich
// (window.visualViewport), das Layout bleibt groß. Fenster, die sich am Layout ausrichten, enden dann
// hinter der Tastatur. Hier wird der sichtbare Bereich einmal zentral gemessen und als CSS-Variablen am
// <html>-Element bereitgestellt; `keyboard.css` und `keyboardViewport.css` richten Fenster und Knopfzeilen danach aus.
// Nur der Online-Editor (Browser) misst so. Die App verkleinert mit @capacitor/keyboard das Layout und setzt die
// Zustände selbst (apps/pico-pwa/src/shell/keyboard.ts).
//   --vv-h      Höhe des sichtbaren Bereichs
//   --vv-top    sein Abstand vom oberen Rand des Layouts (iOS schiebt die Seite beim Fokus hoch)
//   --kb-inset  wie weit die Tastatur von unten ins Layout ragt
//   data-keyboard       gesetzt, solange die Tastatur die Seite verdeckt (iOS)
//   data-keyboard-open  gesetzt, solange überhaupt eine Tastatur offen ist - auf iOS (verdeckt) wie auf Android
//                       (dort schrumpft das Layout selbst). Für alles, was auf beiden gleich aussehen soll:
//                       Linie über der Knopfzeile, kein Abstand für den Home-Balken über der Tastatur.

import type { Directive } from 'vue'
import { KEYBOARD_MIN_HEIGHT, keyboardCovers, visibleBox, type ViewportLike } from './visibleViewport.ts'

export interface KeyboardVars {
  height: number
  top: number
  inset: number
  covered: boolean
}

export function keyboardVars(vv: ViewportLike | null | undefined, layoutHeight: number): KeyboardVars {
  const box = visibleBox(vv, layoutHeight)
  const covered = keyboardCovers(vv, layoutHeight)
  return { height: box.height, top: box.top, inset: covered ? Math.max(0, Math.round(layoutHeight) - box.height - box.top) : 0, covered }
}

/** Android: Die Tastatur verkleinert das Layout. Offen ist sie, wenn ein Eingabefeld den Fokus hat und das Layout
 *  deutlich niedriger ist als zuvor bei derselben Breite (Drehen ändert die Breite und zählt nicht). */
export function layoutShrunk(height: number, tallest: number, editing: boolean): boolean {
  return editing && tallest - height > KEYBOARD_MIN_HEIGHT
}

function editing(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test((el as HTMLInputElement).type)
}

/** Einmal beim Start aufrufen. Gibt eine Funktion zum Abmelden zurück. */
export function installKeyboardInset(target: HTMLElement = document.documentElement): () => void {
  const vv = window.visualViewport
  if (!vv) return () => {}
  const tallest = new Map<number, number>() // Breite -> größte gesehene Layout-Höhe
  const apply = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    tallest.set(w, Math.max(tallest.get(w) ?? 0, h))
    const v = keyboardVars(vv, h)
    target.style.setProperty('--vv-h', `${v.height}px`)
    target.style.setProperty('--vv-top', `${v.top}px`)
    target.style.setProperty('--kb-inset', `${v.inset}px`)
    target.toggleAttribute('data-keyboard', v.covered)
    target.toggleAttribute('data-keyboard-open', v.covered || layoutShrunk(h, tallest.get(w) ?? h, editing()))
  }
  // Fokuswechsel nach dem Größenwechsel abwarten (Android meldet die neue Höhe teils vor dem Fokus).
  const later = (): void => void setTimeout(apply, 50)
  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  window.addEventListener('resize', apply)
  document.addEventListener('focusin', later)
  document.addEventListener('focusout', later)
  return () => {
    vv.removeEventListener('resize', apply)
    vv.removeEventListener('scroll', apply)
    window.removeEventListener('resize', apply)
    document.removeEventListener('focusin', later)
    document.removeEventListener('focusout', later)
  }
}

/** Kleinste Höhe, auf die eine Liste über der Tastatur zusammengeschoben wird (zwei Zeilen bleiben lesbar). */
export const FIT_MIN_PX = 96

/** Höchste Höhe einer Liste, deren Oberkante bei `top` liegt, damit sie über der Tastatur endet. */
export function fitHeight(vv: ViewportLike, top: number): number {
  return Math.max(FIT_MIN_PX, Math.round(vv.offsetTop + vv.height - top - 8))
}

type FitEl = HTMLElement & { __fitKeyboard?: () => void }
function fit(el: FitEl): void {
  const vv = window.visualViewport
  if (!vv || !keyboardCovers(vv, window.innerHeight)) {
    el.style.maxHeight = ''
    return
  }
  el.style.maxHeight = `${fitHeight(vv, el.getBoundingClientRect().top)}px`
}

/** `v-fit-keyboard`: eine aufklappende Liste (Vorschläge) endet über der Tastatur statt dahinter. */
export const vFitKeyboard: Directive<FitEl> = {
  mounted(el) {
    const run = (): void => fit(el)
    el.__fitKeyboard = run
    run()
    window.visualViewport?.addEventListener('resize', run)
    window.visualViewport?.addEventListener('scroll', run)
    window.addEventListener('scroll', run, { passive: true, capture: true })
  },
  updated(el) {
    el.__fitKeyboard?.()
  },
  unmounted(el) {
    const run = el.__fitKeyboard
    if (!run) return
    window.visualViewport?.removeEventListener('resize', run)
    window.visualViewport?.removeEventListener('scroll', run)
    window.removeEventListener('scroll', run, { capture: true })
  },
}
