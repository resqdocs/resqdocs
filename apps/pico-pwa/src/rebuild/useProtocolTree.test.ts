// Laeuft mit:  node --test --experimental-strip-types
// Testet die Snippet-Einfuege-Primitive des Editors (Bausteine-Rework Slice 1). useProtocolTree haelt
// Modul-Singleton-State -> Tests additiv (keine Reset-API); Assertions haengen nur an den neu erzeugten Feldern.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useProtocolTree } from './useProtocolTree.ts'
import { findNode, collectIds, createContainer, createField, createFunction, addChild } from '@resqdocs/protocol-core/creator'
import type { Container } from '@resqdocs/protocol-core/model'

test('insertSnippet: Snippet als Feld-Vorgabe (default=text, showTitle=false), im Baum, immutabel, kollisionsfrei', () => {
  const tree = useProtocolTree()
  const rootId = tree.root.value.id
  const before = tree.root.value

  const field = tree.insertSnippet(rootId, 'Standardtext ohne Titel')
  if (field.type !== 'field') throw new Error('insertSnippet muss ein Field liefern')
  assert.equal(field.default, 'Standardtext ohne Titel')
  assert.equal(field.showTitle, false)
  assert.notEqual(field.multiline, true) // einzeilig -> kein multiline

  // Feld ist an der Wurzel gelandet
  const inTree = findNode(tree.root.value, field.id)
  assert.ok(inTree && inTree.type === 'field' && inTree.default === 'Standardtext ohne Titel')

  // immutabel: Wurzel-Referenz nach dem Insert neu
  assert.notEqual(tree.root.value, before)

  // kollisionsfreie IDs (nextId)
  const field2 = tree.insertSnippet(rootId, 'Zweiter')
  assert.notEqual(field.id, field2.id)

  // mehrzeiliger Text -> multiline (grosses Textfeld)
  const ml = tree.insertSnippet(rootId, 'Zeile 1\nZeile 2')
  assert.ok(ml.type === 'field' && ml.multiline === true)
})

test('insertBlock: verschachtelter Block kollisionsfrei re-IDt, Quelle unveraendert, zwei Inserts disjunkt', () => {
  const tree = useProtocolTree()
  const rootId = tree.root.value.id

  // verschachtelter Block: Container > (Field, Container > FunctionNode)
  let block = createContainer('B_ROOT')
  block = addChild(block, 'B_ROOT', createField('B_F1')) as Container
  block = addChild(block, 'B_ROOT', createContainer('B_SUB')) as Container
  block = addChild(block, 'B_SUB', createFunction('B_FN', 'medikamentenplan')) as Container
  block = { ...block, title: 'Testblock' }
  const srcIds = collectIds(block)

  const inserted = tree.insertBlock(rootId, block)
  if (inserted.type !== 'container') throw new Error('insertBlock muss einen Container liefern')

  // alle eingefuegten ids frisch (keine der Quell-ids), gleiche Knotenzahl
  const newIds = collectIds(inserted)
  assert.equal(newIds.length, srcIds.length)
  for (const id of newIds) assert.ok(!srcIds.includes(id), `id ${id} darf nicht aus der Quelle stammen`)

  // im Baum gelandet, Quelle unveraendert (Kopie, keine Referenz)
  assert.ok(findNode(tree.root.value, inserted.id))
  assert.deepEqual(collectIds(block), srcIds)

  // zweimal einfuegen -> disjunkte id-Mengen (kein Teilen zwischen den Instanzen)
  const inserted2 = tree.insertBlock(rootId, block)
  const set1 = new Set(collectIds(inserted))
  for (const id of collectIds(inserted2)) assert.ok(!set1.has(id), `zweiter Insert teilt id ${id}`)
})
