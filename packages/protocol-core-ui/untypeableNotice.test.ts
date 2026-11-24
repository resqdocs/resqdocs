// node --test --experimental-strip-types
// Hinweis auf nicht tippbare Zeichen: Wortlaut, Anzahl, Stellen, an denen er steht.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeForTyping, TYPEABLE_NON_ASCII } from '@resqdocs/protocol-core/typeable'
import { INFO } from './terms.ts'
import { typingMarker, untypeableNotice, UNTYPEABLE_SHOWN } from './untypeableNotice.ts'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('kein Hinweis, wenn alles tippbar ist', () => {
  assert.equal(untypeableNotice(''), '')
  assert.equal(untypeableNotice('RR 120/80, Größe 1,80 m, café'), '')
  assert.equal(untypeableNotice(normalizeForTyping('„wach“ – orientiert… 😀')), '', 'ersetzte Zeichen zählen nicht')
})

test('Wortlaut: Anzahl, die Zeichen, was am Zielgerät ankommt', () => {
  assert.equal(untypeableNotice('Garçon'), '1 Zeichen kann die Bridge nicht tippen: ç. Dort kommt [?] an.')
  assert.equal(untypeableNotice('Garçon, señor, ç'), '2 Zeichen kann die Bridge nicht tippen: ç ñ. Dort kommt [?] an.')
  assert.equal(untypeableNotice('É', '{?}'), '1 Zeichen kann die Bridge nicht tippen: É. Dort kommt {?} an.')
})

test('viele verschiedene Zeichen: die ersten werden genannt, der Rest gezählt', () => {
  const chars = 'çñÉÀåøæœ²³'
  assert.equal(UNTYPEABLE_SHOWN, 8)
  assert.equal(untypeableNotice(chars), '10 Zeichen kann die Bridge nicht tippen: ç ñ É À å ø æ œ und 2 weitere. Dort kommt [?] an.')
  assert.equal(untypeableNotice(chars.slice(0, 9)), '9 Zeichen kann die Bridge nicht tippen: ç ñ É À å ø æ œ und 1 weiteres. Dort kommt [?] an.')
})

test('ein Akzent ohne Buchstaben ist im Hinweis zu sehen', () => {
  assert.equal(untypeableNotice('x̂'), '1 Zeichen kann die Bridge nicht tippen: ◌̂. Dort kommt [?] an.')
})

test('was ankommt, hängt am Zielgerät: am iPad {?}, sonst [?]', () => {
  assert.equal(typingMarker('ios'), '{?}')
  assert.equal(typingMarker('win_de'), '[?]')
  assert.equal(typingMarker('mac_de'), '[?]')
  assert.equal(typingMarker(undefined), '[?]')
})

test('die Erklärung nennt genau die Zeichen, die die Bridge außerhalb von ASCII tippt', () => {
  const text = INFO.untypeable.text
  // Große Umlaute und der einzelne Akzent ´ stehen nicht eigens da (Umlaute sind mit ä ö ü genannt).
  for (const c of TYPEABLE_NON_ASCII.replace(/[´ÄÖÜ]/g, '')) assert.ok(text.includes(c), `${c} fehlt in der Erklärung`)
  assert.match(text, /\[\?\]/)
  assert.match(text, /Senden geht trotzdem/)
})

test('der Hinweis ist ein Hinweis: mit ⓘ, ohne Knopf, ohne Sperre', () => {
  const hint = read('components/UntypeableHint.vue')
  assert.match(hint, /<InfoTip :info="INFO\.untypeable" \/>/)
  assert.match(hint, /v-if="notice"/)
  assert.match(hint, /role="status"/)
  // Die Trefferfläche des ⓘ bleibt 44 px (size-11 in InfoTip).
  assert.match(read('components/InfoTip.vue'), /inline-flex size-11 /)
})
