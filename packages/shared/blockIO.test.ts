// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportBlock, parseBlock, BLOCK_SCHEMA, BLOCK_VERSION } from './blockIO.ts'
import { exportTemplate, parseTemplate } from './templateIO.ts'
import { createContainer, createField, addChild } from './creator.ts'
import type { Container } from './model.ts'

const sample = (id = 'blk-1', title = 'Anamnese'): Container => {
  let root: Container = createContainer(id)
  root = addChild(root, id, createField('f1')) as Container
  return { ...root, title }
}

test('exportBlock -> parseBlock: Roundtrip, eigene Instanz, ids/Titel/Kinder erhalten', () => {
  const b = sample()
  const r = parseBlock(exportBlock(b))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.tree.id, 'blk-1')
  assert.equal(r.tree.title, 'Anamnese')
  assert.equal(r.tree.children.length, 1)
  assert.notEqual(r.tree, b) // eigene Instanz (kein geteilter Ref)
})

test('exportBlock: versioniertes Huelle-Format mit eigenem Schema', () => {
  const o = JSON.parse(exportBlock(sample())) as { schema: string; version: number; tree: unknown }
  assert.equal(o.schema, BLOCK_SCHEMA)
  assert.equal(o.version, BLOCK_VERSION)
  assert.ok(o.tree)
})

test('parseBlock: klare Fehler bei kaputtem JSON / falschem Schema / zu neuer Version / ohne Container', () => {
  assert.equal(parseBlock('{kaputt').ok, false)
  assert.equal(parseBlock(JSON.stringify({ schema: 'resqdocs-protocol', version: 1, tree: sample() })).ok, false)
  assert.equal(parseBlock(JSON.stringify({ schema: BLOCK_SCHEMA, version: BLOCK_VERSION + 1, tree: sample() })).ok, false)
  assert.equal(parseBlock(JSON.stringify({ schema: BLOCK_SCHEMA, version: 1, tree: { type: 'field', id: 'x' } })).ok, false)
})

test('Trennung: parseTemplate lehnt Block-Datei ab, parseBlock lehnt Vorlagen-Datei ab; jeder parst SEINE', () => {
  const blockFile = exportBlock(sample('blk-9', 'Block'))
  const templateFile = exportTemplate(sample('proto-9', 'Vorlage'))
  assert.equal(parseTemplate(blockFile).ok, false) // Block-Datei ist keine Vorlage
  assert.equal(parseBlock(templateFile).ok, false) // Vorlagen-Datei ist kein Block
  assert.equal(parseBlock(blockFile).ok, true)
  assert.equal(parseTemplate(templateFile).ok, true)
})
