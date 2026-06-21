import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLibraryBlock, applyBlockEdit } from './bausteineMapping.ts'
import { isValidLibraryBlock } from '../storage/libraryValidation.ts'
import type { Block } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { LibraryBlock } from '../storage/types.ts'

function filledBlock(): Block {
  return {
    id: 'xabcde',
    title: 'xABCDE',
    points: [
      { type: 'finding', id: 'a_atemweg', label: 'Atemweg', normal: 'frei' },
      { type: 'findingGroup', id: 'grp', key: 'B', findings: [{ id: 'b1', normal: 'regelrecht' }] },
      { type: 'field', id: 'f1', label: 'Bemerkung' },
    ],
  } as unknown as Block
}

test('buildLibraryBlock: gefüllter Block landet MIT Punkten (nicht points:[])', () => {
  const lb = buildLibraryBlock(filledBlock(), [], '2026-01-01T00:00:00.000Z')
  assert.equal(lb.title, 'xABCDE')
  assert.equal(lb.block.points.length, 3, 'alle Punkte uebernommen')
  assert.deepEqual(lb.block.points.map((p) => p.type), ['finding', 'findingGroup', 'field'])
  assert.ok(isValidLibraryBlock(lb), 'als LibraryBlock valide')
})

test('buildLibraryBlock: tiefe Kopie — Quelle unberuehrt, Baustein unabhaengig', () => {
  const src = filledBlock()
  const snapshot = JSON.stringify(src)
  const lb = buildLibraryBlock(src, [], '2026-01-01T00:00:00.000Z')
  // Quelle nach dem Bauen unveraendert
  assert.equal(JSON.stringify(src), snapshot)
  // Mutation der Quelle wirkt NICHT auf den Baustein zurueck
  src.points.push({ type: 'text', id: 'x', content: 'neu' } as never)
  src.title = 'GEAENDERT'
  assert.equal(lb.block.points.length, 3)
  assert.equal(lb.title, 'xABCDE')
})

test('buildLibraryBlock: id kollisionsfrei gegen bestehende Bausteine', () => {
  const lb = buildLibraryBlock(filledBlock(), ['baustein'], '2026-01-01T00:00:00.000Z')
  assert.notEqual(lb.id, 'baustein')
  assert.ok(lb.id.startsWith('baustein'))
})

test('buildLibraryBlock: invalider Block (findingGroup ohne key) ist als LibraryBlock NICHT valide', () => {
  const bad = { id: 'b', title: 'B', points: [{ type: 'findingGroup', id: 'g', key: '', findings: [] }] } as unknown as Block
  const lb = buildLibraryBlock(bad, [], '2026-01-01T00:00:00.000Z')
  assert.equal(isValidLibraryBlock(lb), false)
})

// --- Variante A: applyBlockEdit (bestehenden Baustein aktualisieren) ---

function existingLibBlock(): LibraryBlock {
  return {
    id: 'baustein-7', title: 'Alt',
    block: { id: 'blk', title: 'Alt', points: [{ type: 'text', id: 't', content: 'x' }] } as unknown as Block,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

test('applyBlockEdit: id+createdAt bleiben, block+title+updatedAt aktualisiert', () => {
  const cur = existingLibBlock()
  const edited = filledBlock() // anderer, gefüllter Block (Titel "xABCDE", 3 Punkte)
  const out = applyBlockEdit(cur, edited, '2026-02-02T00:00:00.000Z')
  assert.equal(out.id, 'baustein-7', 'id stabil')
  assert.equal(out.createdAt, '2026-01-01T00:00:00.000Z', 'createdAt stabil')
  assert.equal(out.updatedAt, '2026-02-02T00:00:00.000Z', 'updatedAt neu')
  assert.equal(out.title, 'xABCDE', 'Titel = Block-Titel')
  assert.equal(out.block.points.length, 3, 'Punkte uebernommen')
  assert.ok(isValidLibraryBlock(out))
})

test('applyBlockEdit: tiefe Kopie — Quelle des bearbeiteten Blocks unabhaengig', () => {
  const cur = existingLibBlock()
  const edited = filledBlock()
  const out = applyBlockEdit(cur, edited, '2026-02-02T00:00:00.000Z')
  edited.points.push({ type: 'text', id: 'z', content: 'neu' } as never)
  assert.equal(out.block.points.length, 3, 'spaetere Mutation wirkt nicht zurueck')
})
