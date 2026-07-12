// Laeuft mit:  node --test --experimental-strip-types
// Regression bug-312: die Baustein-id MUSS kollisionsfrei sein, ohne vom (evtl. leeren) In-Memory-Stand
// abzuhaengen - sonst ueberschreibt ein Save bei Boot-Race einen bestehenden Baustein.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBlockId } from './blockId.ts'

test('newBlockId: viele Aufrufe -> alle verschieden (kollisionsfrei, unabhaengig vom Ladezustand)', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 5000; i++) ids.add(newBlockId())
  assert.equal(ids.size, 5000)
})

test('newBlockId: nicht-leer, mit Praefix blk-', () => {
  const id = newBlockId()
  assert.match(id, /^blk-.+/)
})
