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
  assert.equal(kindNoun('block'), 'Gespeicherter Abschnitt')
  assert.equal(kindNoun('snippet'), 'Textbaustein')
})

// „Alle exportieren“ im Online-Editor schreibt eine JSON-LISTE von Vorlagen. Die war bisher nirgends
// importierbar („Keine ResQDocs-Datei erkannt“).
test('Sammlung (Liste von Vorlagen) wird erkannt und vollständig geparst', async () => {
  const { exportTemplate } = await import('./templateIO.ts')
  const { createContainer } = await import('./creator.ts')
  const a = createContainer('a'); a.title = 'Erste'
  const b = createContainer('b'); b.title = 'Zweite'
  const json = JSON.stringify([JSON.parse(exportTemplate(a)), JSON.parse(exportTemplate(b))])
  const r = detectAndParse(json)
  assert.ok(r.ok && r.kind === 'bundle')
  assert.deepEqual(r.trees.map((t) => t.title), ['Erste', 'Zweite'])
})

test('Sammlung: leere Liste und fremde Einträge werden mit Position abgelehnt', async () => {
  const { exportTemplate } = await import('./templateIO.ts')
  const { createContainer } = await import('./creator.ts')
  const leer = detectAndParse('[]')
  assert.ok(!leer.ok && leer.kind === 'bundle')
  const ok = JSON.parse(exportTemplate(createContainer('a')))
  const r = detectAndParse(JSON.stringify([ok, { schema: 'resqdocs-snippet', title: 'x', text: 'y' }]))
  assert.ok(!r.ok && r.kind === 'bundle')
  assert.match(r.error, /Vorlage 2 von 2/)
})

test('exportTemplates: eine Vorlage im Einzelformat, mehrere als Sammlung - beides wieder importierbar', async () => {
  const { exportTemplates } = await import('./templateIO.ts')
  const a = createContainer('a'); a.title = 'Erste'
  const b = createContainer('b'); b.title = 'Zweite'
  const eins = detectAndParse(exportTemplates([a]))
  assert.ok(eins.ok && eins.kind === 'protocol', 'eine Vorlage bleibt im Format, das auch ältere Apps lesen')
  const zwei = detectAndParse(exportTemplates([a, b]))
  assert.ok(zwei.ok && zwei.kind === 'bundle')
  assert.deepEqual(zwei.trees.map((t) => t.title), ['Erste', 'Zweite'])
})
