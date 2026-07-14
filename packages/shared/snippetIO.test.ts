// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportSnippet, parseSnippet, SNIPPET_SCHEMA, SNIPPET_VERSION } from './snippetIO.ts'
import { exportBlock, parseBlock } from './blockIO.ts'
import { createContainer } from './creator.ts'
import type { Container } from './model.ts'

test('exportSnippet -> parseSnippet: Roundtrip, Titel + Text erhalten', () => {
  const r = parseSnippet(exportSnippet({ title: 'Aufklärung Punktion', text: 'Zeile 1\nZeile 2' }))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.snippet.title, 'Aufklärung Punktion')
  assert.equal(r.snippet.text, 'Zeile 1\nZeile 2')
})

test('exportSnippet: versioniertes Huelle-Format mit eigenem Schema', () => {
  const o = JSON.parse(exportSnippet({ title: 'T', text: 'X' })) as { schema: string; version: number; snippet: unknown }
  assert.equal(o.schema, SNIPPET_SCHEMA)
  assert.equal(o.version, SNIPPET_VERSION)
  assert.deepEqual(o.snippet, { title: 'T', text: 'X' })
})

test('parseSnippet: klare Fehler bei kaputtem JSON / falschem Schema / zu neuer Version / leerem Text', () => {
  assert.equal(parseSnippet('{kaputt').ok, false)
  assert.equal(parseSnippet(JSON.stringify({ schema: 'resqdocs-block', version: 1, snippet: { title: 'a', text: 'b' } })).ok, false)
  assert.equal(parseSnippet(JSON.stringify({ schema: SNIPPET_SCHEMA, version: SNIPPET_VERSION + 1, snippet: { title: 'a', text: 'b' } })).ok, false)
  assert.equal(parseSnippet(JSON.stringify({ schema: SNIPPET_SCHEMA, version: 1, snippet: { title: 'a', text: '   ' } })).ok, false)
  assert.equal(parseSnippet(JSON.stringify({ schema: SNIPPET_SCHEMA, version: 1, snippet: { title: 'a' } })).ok, false)
})

test('parseSnippet: fehlender Titel wird zu leerem String (nicht abgelehnt)', () => {
  const r = parseSnippet(JSON.stringify({ schema: SNIPPET_SCHEMA, version: 1, snippet: { text: 'nur text' } }))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.snippet.title, '')
  assert.equal(r.snippet.text, 'nur text')
})

test('Trennung: parseSnippet lehnt Block-Datei ab, parseBlock lehnt Snippet-Datei ab', () => {
  let block: Container = createContainer('blk-1')
  block = { ...block, title: 'Block' }
  const blockFile = exportBlock(block)
  const snippetFile = exportSnippet({ title: 'Snippet', text: 'Hallo' })
  assert.equal(parseSnippet(blockFile).ok, false) // Block-Datei ist kein Snippet
  assert.equal(parseBlock(snippetFile).ok, false) // Snippet-Datei ist kein Block
  assert.equal(parseSnippet(snippetFile).ok, true)
})
