// visibleViewport.ts — der Bereich des Bildschirms, den die Bildschirmtastatur NICHT verdeckt.
//
// Auf iOS verkleinert die Tastatur nur den sichtbaren Bereich (visualViewport); das Layout bleibt so hoch wie
// zuvor. Ein Fenster, das sich am Layout ausrichtet, liegt dann zur Hälfte hinter der Tastatur. Android
// verkleinert dagegen die ganze Ansicht - dort sind beide Höhen gleich. Diese Rechnung deckt beides ab.

export interface ViewportLike {
  height: number
  offsetTop: number
}

export interface VisibleBox {
  /** Abstand des sichtbaren Bereichs vom oberen Rand des Layouts (iOS schiebt ihn beim Tippen). */
  top: number
  /** Höhe des sichtbaren Bereichs. */
  height: number
}

/** Sichtbarer Bereich; ohne visualViewport (alte Browser) die volle Layout-Höhe. */
export function visibleBox(vv: ViewportLike | null | undefined, layoutHeight: number): VisibleBox {
  if (!vv || !(vv.height > 0)) return { top: 0, height: Math.max(0, Math.round(layoutHeight)) }
  return { top: Math.max(0, Math.round(vv.offsetTop)), height: Math.round(vv.height) }
}

/** Ab diesem Unterschied gilt die Tastatur als offen. Adressleisten und Zoom ändern die Höhe weniger. */
export const KEYBOARD_MIN_HEIGHT = 120

/** Verdeckt die Tastatur gerade einen Teil des Layouts? (Nur dort erkennbar, wo das Layout nicht mitschrumpft.) */
export function keyboardCovers(vv: ViewportLike | null | undefined, layoutHeight: number): boolean {
  if (!vv || !(vv.height > 0)) return false
  return layoutHeight - vv.height > KEYBOARD_MIN_HEIGHT
}
