// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAndParse, kindNoun } from './importRouter.ts'
import { exportTemplate } from './templateIO.ts'
import { exportBlock, BLOCK_SCHEMA } from './blockIO.ts'
import { exportSnippet, SNIPPET_SCHEMA } from './snippetIO.ts'
import { createContainer } from './creator.ts'
import type { Container } from './model.ts'

const container = (id = 'c1', title = 'X'): Container => ({ ...createContainer(id), title })

test('detectAndParse: Vorlage/Baustein/Snippet werden am schema korrekt erkannt', () => {
  const proto = detectAndParse(exportTemplate(container('p', 'Vorlage')))
  assert.ok(proto.ok && proto.kind === 'protocol')
  if (proto.ok && proto.kind === 'protocol') assert.equal(proto.tree.title, 'Vorlage')

  const block = detectAndParse(exportBlock(container('b', 'Baustein')))
  assert.ok(block.ok && block.kind === 'block')

  const snippet = detectAndParse(exportSnippet({ title: 'S', text: 'Hallo' }))
  assert.ok(snippet.ok && snippet.kind === 'snippet')
  if (snippet.ok && snippet.kind === 'snippet') assert.equal(snippet.snippet.text, 'Hallo')
})

test('detectAndParse: fehlendes schema -> ok:false, kein kind', () => {
  const r = detectAndParse(JSON.stringify({ tree: container() }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.kind, undefined)
    assert.match(r.error, /schema fehlt/)
  }
})

test('detectAndParse: unbekanntes schema (z. B. resqdocs-backup) -> abgelehnt, kein kind', () => {
  const r = detectAndParse(JSON.stringify({ schema: 'resqdocs-backup', version: 1, protocols: [] }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.kind, undefined)
    assert.match(r.error, /Unbekanntes Schema/)
  }
})

test('detectAndParse: kaputtes JSON (auch PZN-gzip-artig) -> „Kein gueltiges JSON"', () => {
  assert.equal(detectAndParse('{kaputt').ok, false)
  assert.equal(detectAndParse(' binär').ok, false) // gzip-Magic o. ae. -> kein JSON
})

test('detectAndParse: bekanntes schema, aber Parser lehnt ab -> ok:false MIT kind (bessere UI-Meldung)', () => {
  const tooNew = JSON.stringify({ schema: BLOCK_SCHEMA, version: 999, tree: container() })
  const r = detectAndParse(tooNew)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.kind, 'block') // Typ erkannt, nur Version zu neu

  const emptySnippet = JSON.stringify({ schema: SNIPPET_SCHEMA, version: 1, snippet: { title: 'a', text: '  ' } })
  const s = detectAndParse(emptySnippet)
  assert.equal(s.ok, false)
  if (!s.ok) assert.equal(s.kind, 'snippet')
})

test('kindNoun: nutzerlesbare Substantive', () => {
  assert.equal(kindNoun('protocol'), 'Vorlage')
  assert.equal(kindNoun('block'), 'Baustein')
  assert.equal(kindNoun('snippet'), 'Snippet')
})
