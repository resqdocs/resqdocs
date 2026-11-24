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
