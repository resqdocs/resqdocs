// App-Hülle: Kopfzeile, Inhalt und Tab-Leiste stehen fest, das Dokument scrollt nie. Jeder Tab hat einen eigenen
// Scrollbereich (`data-tab-scroll="<tab>"` in App.vue), der seine Position behält, während der Tab ausgeblendet ist.
// Alles, was früher das Fenster gescrollt hat (window.scrollTo), spricht hier den Bereich des Tabs an.

export type AppTab = 'einsatz' | 'protokolle' | 'bausteine' | 'einstellungen'

/** Kennzeichen des Scrollbereichs eines Tabs. */
export const TAB_SCROLL_ATTR = 'data-tab-scroll'

/** Scrollbereich eines Tabs (oder null, solange die Hülle noch nicht steht). */
export function tabScroller(tab: AppTab): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TAB_SCROLL_ATTR}="${tab}"]`)
}

/** Scrollbereich, in dem ein Element liegt; null außerhalb der Tabs (Fenster, Teleport an body). */
export function tabScrollerOf(el: Element | null | undefined): HTMLElement | null {
  return el?.closest<HTMLElement>(`[${TAB_SCROLL_ATTR}]`) ?? null
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Ein frisch aufgeklapptes Element (z. B. Bearbeiten-Karte) im Bereich des Tabs ins Bild holen. „nearest" scrollt
 *  nur, wenn nötig, und reißt die Liste nicht unnötig herum; Kopfzeile und Tab-Leiste liegen außerhalb des
 *  Bereichs, das scroll-margin am Element hält nur etwas Abstand zum Rand.
 *
 *  Geht danach eine Tastatur auf (Fokus im Titel), verkleinert sie das Layout (iOS über das Plugin erst nach der
 *  Einblend-Animation, Android sofort): einmal nachziehen, damit die ganze Karte über der Tastatur steht und nicht
 *  nur das Feld. Einmalig und zeitlich begrenzt, damit späteres eigenes Scrollen nicht überschrieben wird.
 *
 *  Instanceof-Prüfung bewusst streng: bei einer String-Ref in einem v-for liefert Vue ein ARRAY, und der Aufruf
 *  schlug dann still im requestAnimationFrame fehl. */
export function scrollIntoViewSoon(el: unknown): void {
  if (!(el instanceof HTMLElement)) return
  const doScroll = (): void => el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  requestAnimationFrame(() => requestAnimationFrame(doScroll))
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    window.removeEventListener('resize', once)
    requestAnimationFrame(doScroll)
  }
  window.addEventListener('resize', once)
  window.setTimeout(() => {
    done = true
    window.removeEventListener('resize', once)
  }, 1500)
}

/** Bereich eines Tabs an den Anfang (z. B. erneutes Antippen des aktiven Tabs). */
export function scrollTabToTop(tab: AppTab, smooth = true): void {
  tabScroller(tab)?.scrollTo({ top: 0, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
}
