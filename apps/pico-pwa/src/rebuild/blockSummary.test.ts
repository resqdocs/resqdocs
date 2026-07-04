// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countDescendants, blockStructureLabel } from './blockSummary.ts'
import { createContainer, createField, createFunction, addChild } from '@resqdocs/protocol-core/creator'
import type { Container } from '@resqdocs/protocol-core/model'

// Wurzel > (sub1 > f1,f2,f3), (sub2 > f4,f5), Funktion fn an der Wurzel
function sample(): Container {
  let r: Container = createContainer('root')
  r = addChild(r, 'root', createContainer('sub1')) as Container
  r = addChild(r, 'root', createContainer('sub2')) as Container
  r = addChild(r, 'root', createFunction('fn', 'medikamentenplan')) as Container
  r = addChild(r, 'sub1', createField('f1')) as Container
  r = addChild(r, 'sub1', createField('f2')) as Container
  r = addChild(r, 'sub1', createField('f3')) as Container
  r = addChild(r, 'sub2', createField('f4')) as Container
  r = addChild(r, 'sub2', createField('f5')) as Container
  return r
}

test('countDescendants: zaehlt ALLE verschachtelten Elemente nach Typ (nicht nur direkte Kinder)', () => {
  const c = countDescendants(sample())
  assert.equal(c.containers, 2)
  assert.equal(c.fields, 5)
  assert.equal(c.functions, 1)
})

test('blockStructureLabel: Null-Kategorien weggelassen, Singular/Plural, leer', () => {
  assert.equal(blockStructureLabel(sample()), '2 Container · 5 Felder · 1 Funktion')
  const oneField = addChild(createContainer('r'), 'r', createField('x')) as Container
  assert.equal(blockStructureLabel(oneField), '1 Feld')
  assert.equal(blockStructureLabel(createContainer('leer')), 'leer')
})
