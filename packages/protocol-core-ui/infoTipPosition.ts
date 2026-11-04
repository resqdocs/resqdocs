// infoTipPosition.ts - wohin die Erklaerung eines ⓘ kommt. Rein, ohne DOM testbar.
//
// Bevorzugt unter dem Symbol, sonst darueber, sonst auf der Seite mit mehr Platz. Bleibt immer im sichtbaren
// Bereich, auch am Bildschirmrand.

export interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
}
export interface Size {
  width: number
  height: number
}
export interface Viewport extends Size {
  left: number
  top: number
}

const MARGIN = 12
const GAP = 4

export function infoTipPosition(anchor: AnchorRect, size: Size, vp: Viewport): { left: number; top: number } {
  const minLeft = vp.left + MARGIN
  const maxLeft = Math.max(minLeft, vp.left + vp.width - size.width - MARGIN)
  const left = Math.min(maxLeft, Math.max(minLeft, (anchor.left + anchor.right) / 2 - size.width / 2))

  const minTop = vp.top + MARGIN
  const maxTop = Math.max(minTop, vp.top + vp.height - size.height - MARGIN)
  const below = anchor.bottom + GAP
  const above = anchor.top - GAP - size.height
  let top: number
  if (below <= maxTop) top = below
  else if (above >= minTop) top = above
  else top = vp.top + vp.height - anchor.bottom >= anchor.top - vp.top ? below : above
  return { left, top: Math.min(maxTop, Math.max(minTop, top)) }
}
