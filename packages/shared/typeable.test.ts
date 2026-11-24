// Tests für typeable.ts: dieselbe Zeichenmenge wie die Firmware, jede Ersetzung, Emojis, übrige Zeichen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TYPEABLE_NON_ASCII, isTypeable, normalizeForTyping, stripEmoji, typingEquivalents, untypeable } from './typeable.ts'

const typer = readFileSync(new URL('../../firmware/bridge/libraries/Typer/src/Typer.cpp', import.meta.url), 'utf8')

/** Codepoints einer Tabelle aus Typer.cpp (erste Spalte jeder Zeile `{0x00E4, …}`). */
function table(name: string): number[] {
  const body = new RegExp(`static const (?:Direct|Dead) ${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`).exec(typer)
  assert.ok(body, `Tabelle ${name} in Typer.cpp gefunden`)
  const cps = [...body[1].matchAll(/^\s*\{0x([0-9A-Fa-f]+),/gm)].map((m) => parseInt(m[1], 16))
  assert.ok(cps.length > 0, `Tabelle ${name} hat Einträge`)
  return cps
}
const sorted = (cps: Iterable<number>): string[] => [...new Set(cps)].sort((a, b) => a - b).map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)}`)
const nonAscii = (cps: number[]): number[] => cps.filter((cp) => cp >= 0x80)
const cp = (s: string): number => s.codePointAt(0)!

// --- Firmware ---------------------------------------------------------------------------------------------

/** Was die Firmware je Zielgerät außerhalb von ASCII tippen kann, so wie typeCodepoint() die Tabellen nutzt. */
function firmwareNonAscii(): Record<'win_de' | 'mac_de' | 'ios', number[]> {
  const win = [...table('WIN_DE_DIRECT'), ...table('WIN_DE_DEAD')]
  // tablesForMode() gibt für JEDES Zielgerät die win_de-Tabellen zurück (der Parameter ist unbenutzt).
  const seam = /static void tablesForMode\(OsMode \/\*mode\*\/,[\s\S]*?\n\}/.exec(typer)
  assert.ok(seam, 'tablesForMode() nutzt das Zielgerät nicht: Sobald es je Zielgerät eigene Tabellen gibt, diesen Test und die Menge in typeable.ts anpassen')
  assert.match(seam[0], /\*direct = WIN_DE_DIRECT;/)
  assert.match(seam[0], /\*dead {3}= WIN_DE_DEAD;/)
  // ios schaut zusätzlich zuerst in IOS_DIRECT und IOS_DEAD und fällt sonst auf die gemeinsamen Tabellen zurück.
  assert.match(typer, /if \(g_mode == OsMode::IOS\) \{[\s\S]*?IOS_DIRECT\[i\]\.cp == cp[\s\S]*?IOS_DEAD\[i\]\.cp == cp/)
  return { win_de: nonAscii(win), mac_de: nonAscii(win), ios: nonAscii([...win, ...table('IOS_DIRECT'), ...table('IOS_DEAD')]) }
}

test('Zeichen außerhalb von ASCII: dieselbe Menge wie die Tabellen der Firmware, in jedem Zielgerät', () => {
  const app = [...TYPEABLE_NON_ASCII].map(cp)
  assert.equal(new Set(app).size, app.length, 'kein Zeichen doppelt')
  const modes = firmwareNonAscii()
  for (const [mode, cps] of Object.entries(modes)) {
    const fw = new Set(cps)
    // Jedes Zeichen der App ist in diesem Zielgerät tippbar …
    assert.deepEqual(app.filter((c) => !fw.has(c)).map((c) => String.fromCodePoint(c)), [], `${mode}: App nennt Zeichen, die die Firmware nicht tippt`)
  }
  // … und umgekehrt bleibt keine Lücke: Was ALLE Zielgeräte tippen können, kennt auch die App.
  const common = Object.values(modes).reduce((a, b) => a.filter((c) => b.includes(c)))
  assert.deepEqual(sorted(app), sorted(common))
})

test('ASCII: die Firmware reicht alles unter 0x80 an die Tastaturbelegung weiter', () => {
  assert.match(typer, /if \(cp < 0x80\) \{[\s\S]*?Keyboard\.write\(\(uint8_t\)cp\);/)
  // Die beiden Tottasten der deutschen Belegung sind dort eigens behandelt.
  assert.match(typer, /if \(cp == 0x5E\)/)
  assert.match(typer, /if \(cp == 0x60\)/)
  for (let c = 0x20; c <= 0x7e; c++) assert.equal(isTypeable(c), true, `U+${c.toString(16)}`)
  for (const c of '@\\{}[]|~^`<>"\'') assert.equal(isTypeable(cp(c)), true, c)
  assert.equal(isTypeable(0x0a), true, 'Zeilenumbruch')
  assert.equal(isTypeable(0x09), true, 'Tabulator')
  // Die Ausweich-Tabellen für ios betreffen nur Zeichen, die ohnehin tippbar sind.
  for (const c of [...table('IOS_DIRECT'), ...table('IOS_DEAD')]) assert.equal(isTypeable(c), true, String.fromCodePoint(c))
})

test('nicht tippbar: Steuerzeichen, andere Buchstaben, Symbole', () => {
  for (const c of [0x00, 0x08, 0x0d, 0x1b, 0x7f, 0x85, 0xa0]) assert.equal(isTypeable(c), false, `U+${c.toString(16)}`)
  for (const c of 'çñÉÈÀÂÊÁÍÓÚåøæœ²³½„“”–—…‚‘’«»') assert.equal(isTypeable(cp(c)), false, c)
  assert.equal(isTypeable(cp('😀')), false)
})

test('die Firmware tippt für alles andere die Markierung [?]', () => {
  assert.match(typer, /static void typeMarker\(\) \{\s*Keyboard\.write\('\['\);\s*Keyboard\.write\('\?'\);\s*Keyboard\.write\('\]'\);/)
})

// --- Ersetzungen ------------------------------------------------------------------------------------------

test('Anführungszeichen: doppelte werden zu ", einfache und der Apostroph zu \'', () => {
  assert.equal(normalizeForTyping('„Hallo“'), '"Hallo"')
  assert.equal(normalizeForTyping('“Hello”'), '"Hello"')
  assert.equal(normalizeForTyping('«Salut» »Hallo«'), '"Salut" "Hallo"')
  assert.equal(normalizeForTyping('‚so‘ ‘so’'), "'so' 'so'")
  assert.equal(normalizeForTyping('geht’s'), "geht's")
})

test('Striche werden zum Bindestrich', () => {
  assert.equal(normalizeForTyping('10–12 Uhr'), '10-12 Uhr')
  assert.equal(normalizeForTyping('wach — orientiert'), 'wach - orientiert')
  assert.equal(normalizeForTyping('a‐b‑c‒d―e'), 'a-b-c-d-e')
  assert.equal(normalizeForTyping('−5 °C'), '-5 °C')
})

test('Auslassungspunkte werden zu drei Punkten', () => {
  assert.equal(normalizeForTyping('und dann…'), 'und dann...')
})

test('Sonder-Leerzeichen werden zum gewöhnlichen Leerzeichen', () => {
  assert.equal(normalizeForTyping('z. B. 5 mg'), 'z. B. 5 mg')
  for (let c = 0x2000; c <= 0x200a; c++) assert.equal(normalizeForTyping(`a${String.fromCharCode(c)}b`), 'a b', `U+${c.toString(16)}`)
  assert.equal(normalizeForTyping('a b　c'), 'a b c')
})

test('unsichtbare Zeichen entfallen', () => {
  assert.equal(normalizeForTyping('Blut­druck'), 'Blutdruck', 'weicher Trennstrich')
  assert.equal(normalizeForTyping('a​b‌c‍d⁠e﻿f'), 'abcdef', 'ohne Breite')
  assert.equal(normalizeForTyping('‭+49 151 1234‬'), '+49 151 1234', 'Schreibrichtung um eine kopierte Nummer')
  assert.equal(normalizeForTyping('a‎b‏c⁦d⁩e'), 'abcde')
  assert.equal(normalizeForTyping('x︎y'), 'xy', 'Varianten-Auswahl')
  assert.equal(normalizeForTyping('a\u0000b\u0008c\u001Bd\u007Fe\u0085f'), 'abcdef', 'Steuerzeichen')
})

test('Zeilenenden: \\r\\n, \\r und die Unicode-Trenner werden zum Zeilenumbruch; Tabulator bleibt', () => {
  assert.equal(normalizeForTyping('a\r\nb\rc d e\nf'), 'a\nb\nc\nd\ne\nf')
  assert.equal(normalizeForTyping('a\tb – c'), 'a\tb - c')
})

test('zerlegte Umlaute und Akzente werden zusammengesetzt (NFC)', () => {
  assert.equal(normalizeForTyping('Mädchen'), 'Mädchen')
  assert.equal(normalizeForTyping('Übung, Straße, café'), 'Übung, Straße, café')
  assert.deepEqual(untypeable(normalizeForTyping('Mädchen café')), [])
  // Zusammensetzen ändert den Inhalt nicht: ç bleibt ç (und bleibt damit ein Fall für den Hinweis).
  assert.equal(normalizeForTyping('ça'), 'ça')
})

test('jeder Eintrag der Liste: wird ersetzt, der Ersatz ist tippbar, kein Zeichen doppelt', () => {
  const list = typingEquivalents()
  assert.equal(new Set(list.map(([from]) => from)).size, list.length)
  for (const [from, to] of list) {
    assert.equal([...from].length, 1, 'ein Zeichen je Eintrag')
    assert.equal(isTypeable(cp(from)), false, `U+${cp(from).toString(16)} ist nicht ohnehin tippbar`)
    assert.equal(normalizeForTyping(`a${from}b`), `a${to}b`, `U+${cp(from).toString(16)}`)
    assert.deepEqual(untypeable(to), [], `Ersatz für U+${cp(from).toString(16)}`)
  }
})

test('nichts, was den Inhalt ändert: Buchstaben, Hochzahlen und Symbole bleiben stehen', () => {
  for (const s of ['É', 'ç', 'ñ', 'Å', 'ø', '²', '½', 'μ', '‹', '›', '′', '″', '•', '→', '±', '≥', '✓', '✗', '☐', '★', '═']) {
    assert.equal(normalizeForTyping(s), s, s)
    assert.deepEqual(untypeable(normalizeForTyping(s)), [s], s)
  }
})

test('tippbarer Text bleibt unverändert; mehrfaches Anwenden ändert nichts mehr', () => {
  const plain = 'RR 120/80 mmHg, SpO2 97 % @ Raumluft\n\täöü ÄÖÜ ß € § ° µ ´ é è ê à â î ô û á í ó ú [x] {y} | ~ ^ ` \\'
  assert.equal(normalizeForTyping(plain), plain)
  assert.deepEqual(untypeable(plain), [])
  const mixed = '„Pat. klagt…“ – Temp. 38,5 °C 😀 ç\r\nSoft­hyphen 👨‍👩‍👧 ‚ok‘'
  const once = normalizeForTyping(mixed)
  assert.equal(once, '"Pat. klagt..." - Temp. 38,5 °C ç\nSofthyphen \'ok\'')
  assert.equal(normalizeForTyping(once), once)
  assert.deepEqual(untypeable(once), ['ç'])
})

// --- Emojis -------------------------------------------------------------------------------------------------

test('Emojis entfallen: Smileys, Symbole, mit und ohne Zusatz', () => {
  assert.equal(stripEmoji('Alles gut 😀!'), 'Alles gut !')
  assert.equal(stripEmoji('a😀😃🙂b'), 'ab')
  assert.equal(stripEmoji('a❤️b☺️c✌️d☀️e⚠️f♀️g©️h™️iℹ️j↔️k'), 'abcdefghijk', 'Symbole mit Emoji-Zusatz U+FE0F')
  assert.equal(stripEmoji('⌚☕⚡✅❌⭐⏩'), '', 'Emoji-Darstellung von Haus aus')
  assert.equal(stripEmoji('🚑🩺💊🫀🩸'), '')
})

test('Emoji-Folgen entfallen ganz: verbundene Bildzeichen, Hauttöne, Flaggen, Tasten', () => {
  assert.equal(stripEmoji('x👨‍👩‍👧‍👦y'), 'xy', 'Familie (U+200D)')
  assert.equal(stripEmoji('x🧑‍⚕️y👩🏽‍⚕️z'), 'xyz', 'Beruf, mit Hautton')
  assert.equal(stripEmoji('x🤷‍♂️y🤷🏿‍♀z'), 'xyz', 'Geschlechtszeichen als Glied, auch ohne U+FE0F')
  assert.equal(stripEmoji('x👁‍🗨y🏳️‍🌈z❤️‍🔥'), 'xyz')
  assert.equal(stripEmoji('👍🏻👍🏼👍🏽👍🏾👍🏿'), '', 'Hauttöne')
  assert.equal(stripEmoji('☝🏽✌🏿'), '', 'Schriftzeichen mit Hautton')
  assert.equal(stripEmoji('a🏽b'), 'ab', 'Hautton allein')
  assert.equal(stripEmoji('a🇩🇪b🇨🇭🇦🇹c'), 'abc', 'Flaggen aus Regional-Buchstaben')
  assert.equal(stripEmoji('a🇩b'), 'ab', 'einzelner Regional-Buchstabe')
  assert.equal(stripEmoji('🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}!'), '!', 'Flagge mit Tag-Zeichen')
  assert.equal(stripEmoji('a1️⃣b2⃣c#️⃣d*️⃣e'), 'abcde', 'Tasten-Emojis')
})

test('Ziffern, # und * bleiben; ein übrig gebliebener Zusatz entfällt', () => {
  assert.equal(stripEmoji('Tel. *100# 0123456789'), 'Tel. *100# 0123456789')
  assert.equal(stripEmoji('1️'), '1', 'Ziffer mit Emoji-Zusatz, aber ohne Taste')
  assert.equal(stripEmoji('a️b⃣c'), 'abc')
  assert.equal(stripEmoji('😀‍'), '', 'halbe Folge')
  assert.equal(stripEmoji('‍😀'), '')
})

test('Symbole entfallen wie Smileys, auch ohne Emoji-Zusatz', () => {
  for (const s of ['♀', '♂', '©', '®', '™', '☑', '✔', '✖', '⚠', '↔', '▶', '‼', 'ℹ', '☎', '✉', '❤', '☺', '⚕', '☠', '☢']) {
    assert.equal(stripEmoji(`a${s}b`), 'ab', s)
    assert.equal(normalizeForTyping(`a${s}b`), 'ab', s)
  }
  assert.equal(stripEmoji('Aspirin® 500 mg'), 'Aspirin 500 mg')
  assert.equal(stripEmoji('ä ö ü ß é „x“ – … ç ñ'), 'ä ö ü ß é „x“ – … ç ñ', 'kein Eingriff in anderen Text')
})

test('was Unicode nicht zu den Bildzeichen zählt, bleibt stehen (und erscheint im Hinweis)', () => {
  const text = '✓ ✗ ✘ ☐ ☒ ★ → ← • ≥ ± ✎ ⓘ'
  assert.equal(stripEmoji(text), text)
  assert.equal(normalizeForTyping(text), text)
  assert.deepEqual(untypeable(normalizeForTyping('✓ ok ✔')), ['✓'])
})

test('Leerzeichen: ein Bildzeichen als eigenes Wort nimmt das Leerzeichen dahinter mit', () => {
  assert.equal(stripEmoji('gut 😀 weiter'), 'gut weiter', 'kein doppeltes Leerzeichen')
  assert.equal(stripEmoji('a 😀 👍🏽 🇩🇪 b'), 'a b', 'mehrere hintereinander')
  assert.equal(stripEmoji('a 😀😀 b'), 'a b')
  assert.equal(stripEmoji('⚠ Allergie: Penicillin'), 'Allergie: Penicillin', 'am Textanfang')
  assert.equal(stripEmoji('Befund\n☑ erhoben\n© Dienst'), 'Befund\nerhoben\nDienst', 'am Zeilenanfang')
  assert.equal(normalizeForTyping('5\u00A0😀\u00A0mg'), '5 mg', 'geschützte Leerzeichen zählen mit')
  // Kein eigenes Wort: nur das Zeichen entfällt.
  assert.equal(stripEmoji('Alles gut 😀!'), 'Alles gut !')
  assert.equal(stripEmoji('Alles gut 😀'), 'Alles gut ')
  assert.equal(stripEmoji('gut😀 weiter'), 'gut weiter')
  assert.equal(stripEmoji('a  b'), 'a  b', 'vorhandene doppelte Leerzeichen bleiben')
})

test('Satzzeichen neben einem entfernten Symbol bleiben, wie sie sind', () => {
  // Ob das Komma noch gebraucht wird, lässt sich nicht sicher entscheiden: nichts erfinden, nichts streichen.
  assert.equal(normalizeForTyping('♀, 54 J.'), ', 54 J.')
  assert.equal(normalizeForTyping('Pat. ♂, 54 J.'), 'Pat. , 54 J.')
  assert.equal(normalizeForTyping('wach 😀, orientiert'), 'wach , orientiert')
})

test('vollständig: jedes Bildzeichen (Extended_Pictographic), jedes Emoji mit Zusatz, die ganzen Bildzeichen-Blöcke', () => {
  const keep = new Set([...'0123456789#*'].map(cp))
  for (let c = 0; c <= 0x10ffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue
    const s = String.fromCodePoint(c)
    if (/\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(s)) assert.equal(stripEmoji(`a${s}b`), 'ab', `U+${c.toString(16)}`)
    if (/\p{Emoji}/u.test(s) && !keep.has(c)) assert.equal(stripEmoji(`a${s}️b`), 'ab', `U+${c.toString(16)} + U+FE0F`)
    if (/\p{Emoji_Modifier_Base}/u.test(s)) assert.equal(stripEmoji(`a${s}\u{1F3FD}b`), 'ab', `U+${c.toString(16)} + Hautton`)
    if (c >= 0x1f000 && c <= 0x1faff) assert.equal(stripEmoji(`a${s}b`), 'ab', `U+${c.toString(16)}`)
  }
  for (const k of keep) {
    const s = String.fromCodePoint(k)
    assert.equal(stripEmoji(s), s)
    assert.equal(stripEmoji(`${s}️⃣`), '')
  }
  // Alle Flaggen: jedes Paar aus Regional-Buchstaben.
  for (let a = 0x1f1e6; a <= 0x1f1ff; a++) for (let b = 0x1f1e6; b <= 0x1f1ff; b++) assert.equal(stripEmoji(String.fromCodePoint(a, b)), '')
})

test('vollständig: was Unicode als fertiges Emoji führt (RGI), entfällt', () => {
  // Der Maßstab der Laufzeit selbst (Eigenschaft RGI_Emoji), unabhängig vom eigenen Muster.
  const rgi = new RegExp('^\\p{RGI_Emoji}$', 'v')
  const samples = ['😀', '❤️', '👍🏽', '🇩🇪', '1️⃣', '#️⃣', '👨‍👩‍👧‍👦', '🧑‍⚕️', '👩🏽‍⚕️', '🤷‍♂️', '🏳️‍🌈', '🏴‍☠️', '❤️‍🔥', '👁️‍🗨️', '🧑🏻‍🤝‍🧑🏿', '🐻‍❄️', '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', '©️', '™️', '☑️', '⚕️', '🫨', '🪿']
  for (const s of samples) {
    assert.match(s, rgi, `${s} ist ein Emoji laut Unicode`)
    assert.equal(stripEmoji(`a${s}b`), 'ab', s)
    assert.equal(normalizeForTyping(`a${s}b`), 'ab', s)
  }
})

// --- Übrige Zeichen -----------------------------------------------------------------------------------------

test('untypeable: jedes Zeichen einmal, in der Reihenfolge des ersten Auftretens', () => {
  assert.deepEqual(untypeable(''), [])
  assert.deepEqual(untypeable('Façade, señor, Façon, ñ'), ['ç', 'ñ'])
  assert.deepEqual(untypeable('É ² ç É'), ['É', '²', 'ç'])
  assert.deepEqual(untypeable('a𝒳b♀'), ['𝒳', '♀'], 'Zeichen außerhalb der Grundebene zählen als eines')
})

test('untypeable nach dem Ausgleich: nur was sich nicht ersetzen ließ', () => {
  assert.deepEqual(untypeable(normalizeForTyping('„Garçon“ – 3 m² … 😀 ♀ ©')), ['ç', '²'])
  assert.deepEqual(untypeable('„x“'), ['„', '“'], 'ohne Ausgleich zählt auch das Ersetzbare')
})
