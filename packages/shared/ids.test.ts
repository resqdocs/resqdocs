import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeId } from './ids.ts'

test('sanitizeId: immer klein + Leerzeichen -> Unterstrich', () => {
  assert.equal(sanitizeId('Kritische Blutung'), 'kritische_blutung')
  assert.equal(sanitizeId('Feld_1-A'), 'feld_1-a')
})

test('sanitizeId: Umlaute/ß transliteriert', () => {
  assert.equal(sanitizeId('ärztlich'), 'aerztlich')
  assert.equal(sanitizeId('Übergabe Größe'), 'uebergabe_groesse')
})

test('sanitizeId: Sonderzeichen -> Unterstrich', () => {
  assert.equal(sanitizeId('a/b.c'), 'a_b_c')
})

test('sanitizeId: Mehrfach- und Rand-Unterstriche bereinigt', () => {
  assert.equal(sanitizeId('  /x/  '), 'x')
  assert.equal(sanitizeId('a // b'), 'a_b')
})

test('sanitizeId: nur Sonderzeichen -> leer', () => {
  assert.equal(sanitizeId('  $$  '), '')
})
