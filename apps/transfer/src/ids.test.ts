import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newId, newDeleteToken } from './ids.ts'

test('newId: 12 Zeichen, nur aus dem verwechslungsfreien Alphabet, keine Kollision in 5000', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 5000; i++) {
    const id = newId()
    assert.match(id, /^[A-HJ-NP-Za-km-z2-9]{12}$/, id)
    assert.ok(!seen.has(id), 'keine Kollision')
    seen.add(id)
  }
})

test('newDeleteToken: 32 Zeichen, verschieden', () => {
  assert.equal(newDeleteToken().length, 32)
  assert.notEqual(newDeleteToken(), newDeleteToken())
})
