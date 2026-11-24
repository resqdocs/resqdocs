// typeable.ts - was die Bridge tippen kann, und was am Protokolltext vorher ausgeglichen wird.
//
// Die Bridge ist eine USB-Tastatur mit deutscher Belegung. Sie tippt nur Zeichen, für die ihre Tabellen
// eine Taste kennen (firmware/bridge/libraries/Typer/src/Typer.cpp); alles andere kommt am Zielgerät als
// [?] an. Diese Datei hält dieselbe Menge für App und Online-Editor bereit und gleicht aus, was sich ohne
// Änderung des Inhalts ausgleichen lässt:
//   1. normalizeForTyping: gleichwertige Zeichen ersetzen (typografische Anführungszeichen, Gedankenstriche,
//      Auslassungspunkte, Sonder-Leerzeichen), unsichtbare Zeichen, Emojis und Symbole entfernen.
//   2. untypeable: was danach noch übrig ist und nicht getippt werden kann (für den Hinweis vor dem Senden).
//
// Reine Logik, im Node-Test nutzbar. typeable.test.ts liest Typer.cpp und prüft, dass die Menge hier mit den
// Tabellen der Firmware übereinstimmt.

/**
 * Zeichen außerhalb von ASCII, für die die Bridge eine Taste hat (Typer.cpp: WIN_DE_DIRECT und WIN_DE_DEAD).
 *
 * Die drei Zielgeräte-Einstellungen (win_de, mac_de, ios) nutzen dieselben beiden Tabellen; ios legt nur
 * einzelne Zeichen auf andere Tasten. Die Menge ist deshalb für alle drei gleich. Sollten sie sich je
 * unterscheiden, gilt hier die gemeinsame Menge: Eine Vorlage wird für jedes Zielgerät geschrieben, und der
 * Online-Editor kennt das Zielgerät nicht. Der Test hält genau das fest.
 */
export const TYPEABLE_NON_ASCII = 'äöüÄÖÜß€§°µ´éèêàâîôûáíóú'

const NON_ASCII = new Set([...TYPEABLE_NON_ASCII].map((c) => c.codePointAt(0)!))

/**
 * Kann die Bridge dieses Zeichen (Codepoint) tippen?
 * ASCII: alle sichtbaren Zeichen samt Leerzeichen (0x20 bis 0x7E), dazu Zeilenumbruch (Eingabetaste) und
 * Tabulator (Tab-Taste). Die Firmware reicht ASCII an die deutsche Tastaturbelegung weiter; ^ und ` tippt sie
 * als Tottaste mit Leerzeichen.
 */
export function isTypeable(codePoint: number): boolean {
  if (codePoint === 0x0a || codePoint === 0x09) return true
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true
  return NON_ASCII.has(codePoint)
}

// --- Emojis und Symbole ---------------------------------------------------------------------------------
//
// Entfernt wird jedes Bildzeichen (Maintainer 2026-11-24: Symbole verschwinden wie Smileys):
//   - alles mit der Unicode-Eigenschaft Extended_Pictographic (Unicode Technical Standard 51, „Unicode
//     Emoji“). Dazu gehören die Smileys ebenso wie Symbole, die auch ohne Emoji-Zusatz als Schriftzeichen
//     vorkommen: © ® ™ ♀ ♂ ☑ ✔ ⚠ ↔ ▶ ☎ ❤ und rund hundert weitere.
//   - alles aus den Bildzeichen-Blöcken U+1F000 bis U+1FAFF (Smileys, Gesten, Flaggen-Buchstaben, Hauttöne).
//     Der ganze Bereich, nicht nur die heute vergebenen Zeichen: Neue Emojis kommen genau dort dazu, und ein
//     älteres Handy kennt deren Eigenschaften noch nicht.
//   - samt Zusatz und als ganze Folge: U+FE0F und Hauttöne (❤️ ✌🏽), mit U+200D verbundene Bildzeichen
//     (👨‍👩‍👧, 🧑‍⚕️), Flaggen aus zwei Regional-Buchstaben (🇩🇪), Tasten-Emojis aus Ziffer, # oder * mit
//     U+20E3 (1️⃣), Flaggen mit unsichtbaren Tag-Zeichen (🏴󠁧󠁢󠁥󠁮󠁧󠁿).
//   - übrig gebliebene Zusätze allein (U+FE0F, U+20E3, Tag-Zeichen), die ohne ihr Emoji nichts bedeuten.
//
// Ziffern, # und * allein bleiben stehen. Ebenso Zeichen, die Unicode NICHT zu den Bildzeichen zählt, etwa
// ✓ ✗ ☐ ★ → • ≥: Sie bleiben im Text und erscheinen im Hinweis vor dem Senden (am Zielgerät [?]).
//
// Leerzeichen: Stand das Bildzeichen als eigenes „Wort“ da (davor Textanfang, Zeilenanfang oder Leerzeichen,
// dahinter ein Leerzeichen), entfällt dieses eine Leerzeichen mit. So bleibt weder ein doppeltes Leerzeichen
// noch eines am Zeilenanfang zurück („⚠ Allergie“ wird zu „Allergie“). Satzzeichen bleiben unangetastet: Aus
// „♀, 54 J.“ wird „, 54 J.“ - ob das Komma noch gebraucht wird, lässt sich nicht sicher entscheiden.
const ZWJ = '\\u200D'
const VS16 = '\\uFE0F'
const TONE = '[\\u{1F3FB}-\\u{1F3FF}]'
const TAG = '[\\u{E0020}-\\u{E007F}]'
/** Ein Bildzeichen, mit Zusatz (U+FE0F, Hautton, Tag-Zeichen). */
const PICTO = `[\\u{1F000}-\\u{1FAFF}\\p{Extended_Pictographic}\\p{Emoji_Presentation}](?:${VS16}|${TONE})?${TAG}*`
const EMOJI = [
  `[0-9#*]${VS16}?\\u20E3`, // Tasten-Emoji
  `${PICTO}(?:${ZWJ}${PICTO})*`, // Bildzeichen, auch als mit U+200D verbundene Folge
  `[${VS16}\\u20E3]`, // Zusatz ohne Emoji
  TAG,
].join('|')
// Ein U+200D direkt am Emoji gehört zu ihm (halbe Folge, z. B. wenn die Schreibmarke mitten darin steht).
const ONE = `${ZWJ}*(?:${EMOJI})${ZWJ}*`
// Erste Form: als eigenes Wort, samt dem Leerzeichen dahinter. Zweite Form: nur das Bildzeichen.
const EMOJI_RE = new RegExp(`(?<=^|[ \\n])(?:${ONE})+ |${ONE}`, 'gu')

/** Entfernt Emojis und Symbole (Bildzeichen) aus dem Text. Alles andere bleibt, wie es ist. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '')
}

// --- Gleichwertige Zeichen --------------------------------------------------------------------------------
//
// Bewusst kurz gehalten: nur Zeichen, deren Ersatz dasselbe aussagt. Nichts, was den Inhalt ändert
// (kein É zu E, kein ç zu c, kein ² zu 2); solche Zeichen bleiben stehen und erscheinen im Hinweis.
const EQUIVALENTS: readonly (readonly [from: string, to: string])[] = [
  // Doppelte Anführungszeichen. Die Handy-Tastatur setzt sie beim Tippen von " von selbst ein.
  ['„', '"'], // „ deutsch öffnend
  ['“', '"'], // “ deutsch schließend, englisch öffnend
  ['”', '"'], // ” englisch schließend
  ['«', '"'], // « französisch, schweizerisch
  ['»', '"'], // »
  // Einfache Anführungszeichen und der typografische Apostroph (aus ' in „geht's“).
  ['‚', "'"], // ‚ deutsch öffnend
  ['‘', "'"], // ‘ deutsch schließend, englisch öffnend
  ['’', "'"], // ’ englisch schließend, Apostroph
  // Striche. Die Handy-Tastatur macht aus -- einen Gedankenstrich; die übrigen sehen gleich aus und kommen
  // aus eingefügtem Text.
  ['‐', '-'], // ‐ Bindestrich (eigenes Zeichen)
  ['‑', '-'], // ‑ geschützter Bindestrich
  ['‒', '-'], // ‒ Ziffernstrich
  ['–', '-'], // – Halbgeviertstrich (Gedankenstrich, „bis“)
  ['—', '-'], // — Geviertstrich
  ['―', '-'], // ― waagerechter Strich
  ['−', '-'], // − Minuszeichen
  // Auslassungspunkte: Die Handy-Tastatur macht aus ... ein einziges Zeichen.
  ['…', '...'],
  // Leerzeichen besonderer Breite oder ohne Umbruch: am Zielgerät ein gewöhnliches Leerzeichen.
  [' ', ' '], // geschütztes Leerzeichen
  [' ', ' '], // schmales geschütztes Leerzeichen (z. B. in „z. B.“ und vor Einheiten)
  [' ', ' '], // feste Breiten: Halbgeviert, Geviert, Drittel, Viertel, Sechstel, Ziffern-, Interpunktions-,
  [' ', ' '], // schmales und Haar-Leerzeichen (U+2000 bis U+200A)
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '],
  [' ', ' '], // mittleres mathematisches Leerzeichen
  ['　', ' '], // ideografisches Leerzeichen
  // Zeilen- und Absatztrenner aus eingefügtem Text: ein Zeilenumbruch.
  [' ', '\n'],
  [' ', '\n'],
]
const EQUIVALENT_OF = new Map(EQUIVALENTS)
const EQUIVALENT_RE = new RegExp(`[${EQUIVALENTS.map(([from]) => from).join('')}]`, 'g')

// Unsichtbare Zeichen: am Bildschirm nicht zu sehen, am Zielgerät ein [?] oder nichts.
//   U+00AD            weicher Trennstrich
//   U+200B bis U+200D Leerzeichen ohne Breite, Verbinder und Nicht-Verbinder
//   U+2060, U+FEFF    Wortverbinder, Byte-Order-Marke
//   U+200E, U+200F, U+202A bis U+202E, U+2066 bis U+2069  Schreibrichtungs-Marken (z. B. um kopierte
//                     Telefonnummern)
//   U+FE00 bis U+FE0F Varianten-Auswahl (U+FE0E verlangt die Textform eines Zeichens)
//   Steuerzeichen außer Zeilenumbruch und Tabulator (U+0000 bis U+001F, U+007F bis U+009F): Die Tastatur der
//   Bridge hat dafür keine Taste; die Rücktaste (U+0008) würde am Zielgerät ein Zeichen löschen.
const INVISIBLE_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠⁦-⁩︀-️﻿]/g

/** Nur tippbare Zeichen: nichts zu tun (der häufigste Fall, Vorschau bei jedem Tastendruck). */
const PLAIN_RE = new RegExp(`^[\\n\\t\\x20-\\x7E${TYPEABLE_NON_ASCII}]*$`)

/**
 * Der Text so, wie ihn die Bridge bekommt: zusammengesetzte Zeichen vereinheitlicht (ein eingefügtes
 * „a + Punkte“ wird zu ä), Zeilenenden vereinheitlicht, gleichwertige Zeichen ersetzt, Emojis und Symbole sowie
 * unsichtbare Zeichen entfernt. Buchstaben, Ziffern und Satzzeichen bleiben, wie sie sind. Mehrfaches Anwenden
 * ändert nichts mehr.
 */
export function normalizeForTyping(text: string): string {
  if (PLAIN_RE.test(text)) return text
  // Bildzeichen NACH den Leerzeichen (ein geschütztes Leerzeichen daneben zählt dann wie ein gewöhnliches)
  // und VOR den unsichtbaren Zeichen (U+200D und U+FE0F gehören noch zu ihren Folgen).
  return stripEmoji(
    text
      .normalize('NFC')
      .replace(/\r\n?/g, '\n') // Zeilenenden aus Windows und altem Mac
      .replace(EQUIVALENT_RE, (c) => EQUIVALENT_OF.get(c) ?? c),
  ).replace(INVISIBLE_RE, '')
}

/** Die Ersetzungen als Liste (Zeichen, Ersatz) - für Tests und Doku. */
export function typingEquivalents(): readonly (readonly [from: string, to: string])[] {
  return EQUIVALENTS
}

/**
 * Zeichen des Textes, die die Bridge nicht tippen kann: jedes einmal, in der Reihenfolge des ersten
 * Auftretens. Für den fertigen Protokolltext gedacht (nach normalizeForTyping).
 */
export function untypeable(text: string): string[] {
  if (PLAIN_RE.test(text)) return []
  const seen = new Set<string>()
  for (const char of text) {
    if (!isTypeable(char.codePointAt(0)!)) seen.add(char)
  }
  return [...seen]
}
