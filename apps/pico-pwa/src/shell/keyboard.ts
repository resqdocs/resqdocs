// Bildschirmtastatur in der App (@capacitor/keyboard, Einstellungen in capacitor.config.ts).
//
// Modell: Die Tastatur verkleinert das Layout, auf Android von sich aus, auf iOS über das Plugin (resize 'native').
// Das Dokument scrollt nie (App-Hülle), gescrollt wird nur im Bereich des Tabs bzw. im Fenster. Deshalb braucht die
// App keine Messung des sichtbaren Bereichs (visualViewport) mehr; Fenster und Knopfzeilen richten sich am Layout
// aus. Hier wird nur festgehalten, OB eine Tastatur offen ist:
//   data-keyboard-open  am <html>, solange eine Tastatur offen ist (iOS und Android): Tab-Leiste aus, Linie über der
//                       Knopfzeile, kein Abstand für den Home-Balken (keyboard.css)
//   data-keyboard       nur iOS, solange die Tastatur offen ist: Knopfzeilen von Karten (.kb-sticky) stehen über ihr,
//                       wie bisher nur auf iOS
//   keyboardOpen        derselbe Zustand für Komponenten (Vollbild-Fenster über keyboardLayoutKey)
//
// Nur iOS: Das Plugin blendet die Leiste ↑ ↓ ✓ über der Tastatur aus (Maintainer-Entscheidung). Damit fehlt dort
// der Haken zum Schließen, und ein Feld, das vor dem Verkleinern unter der Tastatur lag, steht danach unterhalb
// des sichtbaren Bereichs. Die Helfer unten gleichen genau das aus. Android hat eigene Schließen-Knöpfe an der
// Tastatur und holt das Feld nach dem Verkleinern selbst ins Bild; dort ändert sich nichts.

import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { layoutShrunk } from '@resqdocs/protocol-core-ui/keyboardInset'
import { isSingleLine, isTextField, tapClosesKeyboard, TAP_SLOP } from './keyboardRules'

/** Ist gerade eine Bildschirmtastatur offen? */
export const keyboardOpen = ref(false)

function setOpen(open: boolean, ios: boolean): void {
  const was = keyboardOpen.value
  keyboardOpen.value = open
  const root = document.documentElement
  root.toggleAttribute('data-keyboard-open', open)
  if (ios) root.toggleAttribute('data-keyboard', open)
  if (was && !open) releaseTabsSoon()
}

// Fenster mit Tastatur: der Tab darunter bleibt, wo er war. Verkleinert die Tastatur das Layout, holt das System
// das Feld im Fenster ins Bild und schob dabei (gemessen in Chromium, also Android) auch den Bereich des Tabs
// darunter weiter; nach „Fertig“ stand die Einsatz-Ansicht dann woanders. Beim Fokus in ein Fenster werden die
// Positionen der Tab-Bereiche gemerkt und bei jeder Größenänderung wiederhergestellt, bis die Tastatur zu ist.
const MODAL = 'dialog[open], .modal, .overlay-backdrop'
let held: Array<[HTMLElement, number]> | null = null
let releaseTimer: ReturnType<typeof setTimeout> | undefined
function restoreTabs(): void {
  for (const [el, top] of held ?? []) if (el.scrollTop !== top) el.scrollTop = top
}
function releaseTabsSoon(): void {
  clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    restoreTabs()
    held = null
  }, 600)
}
function installTabHold(): void {
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element | null
    if (held || !isTextField(el) || !el.closest(MODAL)) return
    clearTimeout(releaseTimer)
    held = [...document.querySelectorAll<HTMLElement>('[data-tab-scroll]')].map((t) => [t, t.scrollTop])
  })
  // Fokus verlässt das Fenster (oder es geht zu): kurz darauf wieder freigeben, auch ohne Bildschirmtastatur.
  document.addEventListener('focusout', (e) => {
    const next = (e as FocusEvent).relatedTarget as Element | null
    if (held && !next?.closest(MODAL)) releaseTabsSoon()
  })
  window.addEventListener('resize', () => {
    if (!held) return
    restoreTabs()
    requestAnimationFrame(restoreTabs)
    setTimeout(restoreTabs, 150)
  })
}

/** iOS: Tastatur ohne Zubehörleiste schließbar machen und das Feld nach dem Verkleinern ins Bild holen. */
function installIosHelpers(): void {
  // Enter-Taste beschriftet sich bei einzeiligen Feldern als „Fertig“, sofern das Feld nichts anderes festlegt.
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element | null
    if (isSingleLine(el) && !el.hasAttribute('enterkeyhint')) el.enterKeyHint = 'done'
  })
  // Enter in einem einzeiligen Feld schließt die Tastatur, wenn das Feld Enter nicht selbst verarbeitet hat
  // (z. B. „Weiter“ im Lückentext springt zum nächsten Feld: dann ist das alte Feld schon nicht mehr aktiv).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
    const el = e.target as Element | null
    if (isSingleLine(el) && document.activeElement === el) el.blur()
  })
  // Tipp neben das Feld auf eine Fläche ohne eigene Bedienung schließt die Tastatur. Wischen (Scrollen) nicht.
  let down: { x: number; y: number; target: Element | null } | null = null
  document.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, target: e.target as Element | null }
  }, { passive: true })
  document.addEventListener('pointerup', (e) => {
    const d = down
    down = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return
    const active = document.activeElement
    if (tapClosesKeyboard(d.target, active)) (active as HTMLElement).blur()
  }, { passive: true })
  // Das Plugin verkleinert die WebView erst nach der Einblend-Animation. Ein Feld, das vorher hinter der Tastatur
  // lag, liegt danach unterhalb des Scrollbereichs: einmal ins Bild holen. „nearest“ bewegt nichts, wenn das Feld
  // schon sichtbar ist.
  window.addEventListener('resize', () => {
    if (!keyboardOpen.value) return
    requestAnimationFrame(() => {
      const el = document.activeElement
      if (isTextField(el)) el.scrollIntoView({ block: 'nearest' })
    })
  })
}

/** Im Browser (Vorschau der App, ohne Plugin): offen, wenn ein Feld den Fokus hat und das Layout deutlich schrumpft. */
function installWebFallback(): void {
  const tallest = new Map<number, number>() // Breite -> größte gesehene Layout-Höhe
  const apply = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    tallest.set(w, Math.max(tallest.get(w) ?? 0, h))
    setOpen(layoutShrunk(h, tallest.get(w) ?? h, isTextField(document.activeElement)), false)
  }
  const later = (): void => void setTimeout(apply, 50)
  apply()
  window.addEventListener('resize', apply)
  document.addEventListener('focusin', later)
  document.addEventListener('focusout', later)
}

/** Einmal beim Start aufrufen. */
export function installAppKeyboard(): void {
  installTabHold()
  if (!Capacitor.isNativePlatform()) {
    installWebFallback()
    return
  }
  const ios = Capacitor.getPlatform() === 'ios'
  void Keyboard.addListener('keyboardWillShow', () => setOpen(true, ios))
  void Keyboard.addListener('keyboardWillHide', () => setOpen(false, ios))
  if (ios) installIosHelpers()
}
