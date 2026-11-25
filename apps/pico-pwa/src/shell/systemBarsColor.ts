// systemBarsColor.ts — reine Farbrechnung für systemBars.ts (testbar, ohne Capacitor).

/** „#rrggbb“ aus den Farbanteilen 0–255. */
export function toHex(r: number, g: number, b: number): string {
  const part = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Dunkle Fläche → helle Leisten-Symbole. Wahrgenommene Helligkeit (Rec. 709), Schwelle in der Mitte. */
export function isDarkColor(r: number, g: number, b: number): boolean {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

/** Farbe mit Deckkraft (0 = durchsichtig, 1 = deckend). */
export type Rgba = [number, number, number, number]

/** Flächen übereinanderlegen, die unterste zuerst: Was am Ende zu sehen ist, auf deckendem Grund. */
export function composite(base: readonly [number, number, number], layers: readonly Rgba[]): [number, number, number] {
  let [r, g, b] = base
  for (const [lr, lg, lb, alpha] of layers) {
    const a = Math.max(0, Math.min(1, alpha))
    if (a === 0) continue
    r = lr * a + r * (1 - a)
    g = lg * a + g * (1 - a)
    b = lb * a + b * (1 - a)
  }
  return [r, g, b]
}
