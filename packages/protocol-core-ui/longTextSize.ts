// longTextSize.ts — Schriftgröße im großen Textfeld: drei feste Stufen, die sich das Gerät merkt.
//
// „normal“ (16 px) bleibt der Standard und liegt an der unteren Grenze der Plattform-Vorgaben für Fließtext.
// „klein“ zeigt mehr Text auf einmal, „groß“ hilft bei schlechter Sicht. Quellen: docs/sources.md
// („Großes Textfeld: Fenster, Tastatur und Schriftgröße“).

export const LONG_TEXT_SIZES = ['sm', 'md', 'lg'] as const
export type LongTextSize = (typeof LONG_TEXT_SIZES)[number]

export const LONG_TEXT_SIZE_DEFAULT: LongTextSize = 'md'

/** Schriftgröße in CSS-Pixeln. */
export const LONG_TEXT_SIZE_PX: Record<LongTextSize, number> = { sm: 14, md: 16, lg: 19 }

/** Benennung für Vorlese-Text und Tooltip. */
export const LONG_TEXT_SIZE_LABEL: Record<LongTextSize, string> = { sm: 'klein', md: 'normal', lg: 'groß' }

/** Gespeicherten Wert lesen; alles Unbekannte fällt auf den Standard zurück. */
export function parseLongTextSize(value: unknown): LongTextSize {
  return (LONG_TEXT_SIZES as readonly unknown[]).includes(value) ? (value as LongTextSize) : LONG_TEXT_SIZE_DEFAULT
}
