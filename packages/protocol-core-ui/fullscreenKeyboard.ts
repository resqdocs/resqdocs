// Vollbild-Fenster mit Tastatur (großes Textfeld, Lückentext ausfüllen, Lückentext einrichten): Höhe und Lage.
//
// Zwei Modelle, je nach Host:
//   App (keyboardLayoutKey eingesteckt): Die Tastatur verkleinert das Layout (@capacitor/keyboard, iOS und Android).
//     Das Fenster ist einfach so hoch wie das Layout (100dvh) und ändert seine Höhe genau einmal, wenn die Tastatur
//     auf- oder zugeht. Kein Nachführen, kein Versatz (translateY), keine gemerkte Tastaturhöhe, nichts gleitet:
//     nur die Deckkraft blendet beim Öffnen und Schließen.
//   Online-Editor (ohne Provider, iOS-Safari): Die Tastatur liegt über der Seite und verkleinert nur den sichtbaren
//     Bereich. Das Fenster folgt ihm (window.visualViewport) und lässt Höhenwechsel gleiten; das große Textfeld
//     nimmt beim Öffnen die zuletzt gemessene Höhe über der Tastatur vorweg. Quellen: docs/sources.md.
//
// In beiden Modellen gilt: das Fenster blendet ein und aus und fährt nie gegen die Tastatur; beim Schließen deckt es
// sofort die ganze Fläche.

import { computed, inject, ref } from 'vue'
import { keyboardLayoutKey } from './injection.ts'
import { keyboardCovers, visibleBox, type VisibleBox } from './visibleViewport.ts'

// Online-Editor, großes Textfeld: zuletzt gemessene sichtbare Höhe bei offener Tastatur, zusammen mit der
// Layout-Höhe, für die sie gilt. Für alle Schreib-Fenster gemeinsam; gilt, solange die Seite läuft.
let lastWithKeyboard: { layout: number; height: number } | null = null

export interface FullscreenKeyboardOptions {
  /** Beim Öffnen die zuletzt gemessene Höhe über der Tastatur vorwegnehmen (Fenster öffnet mit Fokus im Text). */
  remember?: boolean
}

export function useFullscreenKeyboard(opts: FullscreenKeyboardOptions = {}) {
  const host = inject(keyboardLayoutKey, null)
  const box = ref<VisibleBox | null>(null)
  const measuredCover = ref(false)
  const closing = ref(false)
  /** Endet das Fenster gerade an der Tastatur? (Fuß ohne Abstand für den Home-Balken, Inhalt rückt zusammen.) */
  const covered = computed(() => (host ? host.open.value : measuredCover.value))

  function measure(): void {
    const vv = window.visualViewport
    const layout = window.innerHeight
    box.value = visibleBox(vv, layout)
    measuredCover.value = keyboardCovers(vv, layout)
    if (opts.remember && measuredCover.value) lastWithKeyboard = { layout, height: box.value.height }
  }
  function track(on: boolean): void {
    const vv = window.visualViewport
    if (host || !vv) return
    for (const ev of ['resize', 'scroll'] as const) {
      if (on) vv.addEventListener(ev, measure)
      else vv.removeEventListener(ev, measure)
    }
  }

  let settle: ReturnType<typeof setTimeout> | undefined
  /** Vor showModal(): die Höhe steht, bevor das Fenster erscheint, nichts rückt beim Einblenden nach. */
  function prepare(): void {
    closing.value = false
    if (host) return
    const expected = opts.remember && lastWithKeyboard && lastWithKeyboard.layout === window.innerHeight ? lastWithKeyboard.height : null
    if (expected) {
      box.value = { top: 0, height: expected }
      measuredCover.value = true
    } else measure()
  }
  /** Nach showModal(): im Online-Editor ab jetzt dem sichtbaren Bereich folgen. */
  function follow(): void {
    if (host) return
    track(true)
    // Kam doch keine Tastatur (z. B. Hardware-Tastatur am Tablet), ersetzt der Messwert die Annahme.
    if (opts.remember) {
      clearTimeout(settle)
      settle = setTimeout(measure, 700)
    }
  }
  /** Vor dialog.close(): nicht mehr folgen und sofort die ganze Fläche decken; es blendet nur noch aus. */
  function release(): void {
    track(false)
    clearTimeout(settle)
    closing.value = true
    if (host) return
    measuredCover.value = false
    box.value = { top: 0, height: window.innerHeight }
  }
  /** Fenster zu oder Komponente weg. */
  function stop(): void {
    track(false)
    clearTimeout(settle)
  }

  const boxStyle = computed(() => {
    // App: Höhe = Layout (Klasse h-[var(--lt-h,100dvh)] ohne --lt-h); sie ändert sich nur mit der Tastatur, einmal.
    if (host) return { transitionProperty: 'opacity' }
    return box.value
      ? {
          '--lt-h': `${box.value.height}px`,
          transform: box.value.top ? `translateY(${box.value.top}px)` : undefined,
          transitionProperty: closing.value ? 'opacity' : undefined,
        }
      : undefined
  })
  /** Verdeckt die Tastatur auch den mittigen Dialog breiter Bildschirme, rückt er nach oben. */
  const dialogStyle = computed(() => (covered.value ? { placeItems: 'start center' } : undefined))

  return { covered, closing, boxStyle, dialogStyle, prepare, follow, release, stop }
}
