// Sammlung mit Vorlagen, gespeicherten Abschnitten und Textbausteinen: Export, Wiedererkennung, Kompatibilität
// und die Import-Regeln bei Namensgleichheit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createContainer } from './creator.ts'
import { exportTemplates } from './templateIO.ts'
import { exportCollection, describeCollection } from './collectionIO.ts'
import { detectAndParse } from './importRouter.ts'
import { planNamedImport } from './namedImport.ts'

const vorlage = (t: string) => { const c = createContainer('v'); c.title = t; return c }
const abschnitt = (t: string) => { const c = createContainer('blk'); c.title = t; return c }

test('nur Vorlagen: Ausgabe exakt wie bisher (ältere Versionen lesen sie)', () => {
  const a = vorlage('Erste'), b = vorlage('Zweite')
  assert.equal(exportCollection({ templates: [a], blocks: [], snippets: [] }), exportTemplates([a]))
  assert.equal(exportCollection({ templates: [a, b], blocks: [], snippets: [] }), exportTemplates([a, b]))
})

test('genau ein Abschnitt oder Textbaustein: Einzelformat', () => {
  const b = detectAndParse(exportCollection({ templates: [], blocks: [abschnitt('Vitalwerte')], snippets: [] }))
  assert.ok(b.ok && b.kind === 'block' && b.tree.title === 'Vitalwerte')
  const s = detectAndParse(exportCollection({ templates: [], blocks: [], snippets: [{ title: 'Übergabe', text: 'Pat. an NA übergeben.' }] }))
  assert.ok(s.ok && s.kind === 'snippet' && s.snippet.text === 'Pat. an NA übergeben.')
})

test('gemischte Sammlung wird vollständig wiedererkannt', () => {
  const json = exportCollection({
    templates: [vorlage('Standard')],
    blocks: [abschnitt('Vitalwerte')],
    snippets: [{ title: 'Übergabe', text: 'Pat. an NA übergeben.' }, { title: 'Ablehnung', text: 'Transport abgelehnt.' }],
  })
  const r = detectAndParse(json)
  assert.ok(r.ok && r.kind === 'bundle')
  assert.deepEqual(r.trees.map((t) => t.title), ['Standard'])
  assert.deepEqual(r.blocks.map((t) => t.title), ['Vitalwerte'])
  assert.deepEqual(r.snippets.map((s) => s.title), ['Übergabe', 'Ablehnung'])
})

test('nur Textbausteine (mehrere) ohne Vorlage', () => {
  const r = detectAndParse(exportCollection({ templates: [], blocks: [], snippets: [{ title: 'A', text: 'a' }, { title: 'B', text: 'b' }] }))
  assert.ok(r.ok && r.kind === 'bundle' && r.trees.length === 0 && r.snippets.length === 2)
})

test('nichts gewählt oder leerer Textbaustein: Fehler statt kaputter Datei', () => {
  assert.throws(() => exportCollection({ templates: [], blocks: [], snippets: [] }), /Nichts/)
  assert.throws(() => exportCollection({ templates: [vorlage('X')], blocks: [], snippets: [{ title: 'Leer', text: '  ' }] }), /„Leer“ ist leer/)
})

test('Sammlung mit fehlerhaftem Eintrag wird ganz abgelehnt, mit Position und Art', () => {
  const ok = JSON.parse(exportTemplates([vorlage('A')]))
  const r = detectAndParse(JSON.stringify([ok, { schema: 'resqdocs-snippet', version: 1, snippet: { title: 'x', text: '' } }]))
  assert.ok(!r.ok && r.kind === 'bundle')
  assert.match(r.error, /Eintrag 2 von 2 \(Textbaustein\)/)
  const fremd = detectAndParse(JSON.stringify([ok, { schema: 'irgendwas' }]))
  assert.ok(!fremd.ok && /Eintrag 2 von 2 ist keine ResQDocs-Vorlage/.test(fremd.error))
})

test('describeCollection', () => {
  assert.equal(describeCollection({ templates: [1, 2], blocks: [1], snippets: [1, 2, 3] }), '2 Vorlagen, 1 gespeicherter Abschnitt, 3 Textbausteine')
  assert.equal(describeCollection({ templates: [], blocks: [], snippets: [1] }), '1 Textbaustein')
})

test('Import-Regeln: neu, Zusatz „(Import)“ bei gleichem Namen, Überschreiben nur Vorhandenes und nur einmal', () => {
  const vorhanden = [{ id: 's1', title: 'Übergabe' }, { id: 's2', title: 'Ablehnung' }]
  const { actions, overwritten, renamed } = planNamedImport(vorhanden, [
    { item: { title: 'Neu' }, name: '', overwrite: false },
    { item: { title: 'Übergabe' }, name: '', overwrite: false },
    { item: { title: 'ablehnung ' }, name: '', overwrite: true },
    { item: { title: 'Ablehnung' }, name: '', overwrite: true },
    { item: { title: 'X' }, name: 'Eigener Name', overwrite: false },
  ])
  assert.deepEqual(actions.map((a) => [a.kind, a.title, a.kind === 'overwrite' ? a.id : '']), [
    ['add', 'Neu', ''],
    ['add', 'Übergabe (Import)', ''],
    ['overwrite', 'ablehnung', 's2'],
    ['add', 'Ablehnung (Import)', ''],
    ['add', 'Eigener Name', ''],
  ])
  assert.equal(overwritten, 1)
  assert.equal(renamed, 2)
})

test('Import-Regeln: zwei gleichnamige neue Einträge kollidieren auch untereinander nicht still', () => {
  const { actions } = planNamedImport([], [
    { item: { title: 'A' }, name: '', overwrite: false },
    { item: { title: 'A' }, name: '', overwrite: true },
  ])
  assert.deepEqual(actions.map((a) => [a.kind, a.title]), [['add', 'A'], ['add', 'A (Import)']])
})
