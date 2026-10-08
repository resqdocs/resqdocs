// Laeuft mit:  node --test --experimental-strip-types
//
// Reine Query-Semantik des Medikamenten-Suchfelds (#275). Beide Backends (SQL-LIKE, In-Memory-RegExp)
// leiten ihre Muster hierher ab - deshalb ist die Bedeutung hier festgenagelt, nicht in den Backends.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toLikePattern,
  toSuggestRegExp,
  meaningfulLength,
  pznDigits,
  SUGGEST_MIN_CHARS,
} from './pznSuggest.ts'

test('erst ab 3 bedeutungstragenden Zeichen wird gesucht', () => {
  assert.equal(SUGGEST_MIN_CHARS, 3)
  assert.equal(toLikePattern('me'), null, 'zwei Zeichen zu wenig')
  assert.equal(toSuggestRegExp('me'), null)
  assert.equal(toLikePattern('  m '), null, 'Leerraum zaehlt nicht mit')
  assert.equal(toLikePattern('**'), null, 'nur Platzhalter ist keine Suche')
  assert.equal(toLikePattern('a*b'), null, 'zwei Nutzzeichen zu wenig')
  assert.ok(toLikePattern('met'), 'genau drei Zeichen genuegen')
})

test('meaningfulLength ignoriert Platzhalter und Leerraum', () => {
  assert.equal(meaningfulLength('me*for'), 5)
  assert.equal(meaningfulLength('  a b '), 2)
})

test('LIKE-Muster: * und Leerraum werden zu %, Rumpf in %...% gefasst', () => {
  assert.equal(toLikePattern('metfor'), '%metfor%')
  assert.equal(toLikePattern('me*for'), '%me%for%')
  assert.equal(toLikePattern('*sartan'), '%%sartan%')
  assert.equal(toLikePattern('meto 500'), '%meto%500%', 'Leerraum wirkt wie *')
})

test('LIKE-Muster escapt LIKE-Sonderzeichen, damit sie literal suchen', () => {
  // Ein echtes % im Namen darf nicht selbst als Platzhalter wirken.
  assert.equal(toLikePattern('50%x'), '%50\\%x%')
  assert.equal(toLikePattern('a_b_c'), '%a\\_b\\_c%')
})

test('RegExp matcht Infix und Wildcards gleich wie das LIKE-Muster', () => {
  const re = toSuggestRegExp('me*for')!
  assert.ok(re.test('metformin'), 'me…for mittendrin')
  assert.ok(!re.test('formic'), 'Reihenfolge muss stimmen')

  const infix = toSuggestRegExp('for')!
  assert.ok(infix.test('metformin'), 'blosses Fragment findet die Wortmitte')

  const suffix = toSuggestRegExp('*sartan')!
  assert.ok(suffix.test('valsartan'))
})

test('RegExp behandelt Sonderzeichen literal (kein Regex-Einschleusen)', () => {
  const re = toSuggestRegExp('a.c')!
  assert.ok(re.test('a.c'))
  assert.ok(!re.test('axc'), 'der Punkt ist literal, nicht „beliebiges Zeichen"')
})

test('pznDigits liefert nur ab 3 Ziffern etwas', () => {
  assert.equal(pznDigits('ibu'), null)
  assert.equal(pznDigits('12'), null)
  assert.equal(pznDigits('00524306'), '00524306')
  assert.equal(pznDigits('pzn 524-306'), '524306', 'Ziffern werden herausgezogen')
})
