import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportTemplate, parseTemplate, PROTOCOL_SCHEMA, PROTOCOL_VERSION } from './templateIO.ts'
import { createContainer, addChild } from './creator.ts'

test('Export -> Import Roundtrip erhaelt den Baum', () => {
  let root = createContainer('protokoll')
  root = addChild(root, 'protokoll', { type: 'container', id: 'a', title: 'Anamnese', showTitle: true, children: [] })
  const r = parseTemplate(exportTemplate(root))
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.tree, root)
})

test('Import: falsches schema -> Fehler', () => {
  assert.equal(parseTemplate(JSON.stringify({ schema: 'foo', version: 1, tree: {} })).ok, false)
})

test('Import: zu hohe Version -> Fehler', () => {
  const r = parseTemplate(JSON.stringify({ schema: PROTOCOL_SCHEMA, version: PROTOCOL_VERSION + 1, tree: createContainer('x') }))
  assert.equal(r.ok, false)
})

test('Import: ungueltiges JSON -> Fehler', () => {
  assert.equal(parseTemplate('{nope').ok, false)
})

test('Import: kein Container-Baum -> Fehler', () => {
  assert.equal(parseTemplate(JSON.stringify({ schema: PROTOCOL_SCHEMA, version: 1, tree: { type: 'field' } })).ok, false)
})
