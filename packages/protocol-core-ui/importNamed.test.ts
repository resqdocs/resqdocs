// Übernehmen von Textbausteinen aus einer Sammlung (Schreibwege als Parameter) und die Ergebnis-Meldung.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importSnippetsWithChoices, importMessage } from './importNamed.ts'

test('Textbausteine: neu, überschreiben und „(Import)“; Fehler gehen nicht still verloren', async () => {
  const lib = [{ id: 's1', title: 'Übergabe', text: 'alt' }]
  const calls: string[] = []
  const r = await importSnippetsWithChoices(
    [
      { item: { title: 'Übergabe', text: 'neu' }, name: '', overwrite: true },
      { item: { title: 'Übergabe', text: 'zweite' }, name: '', overwrite: false },
      { item: { title: 'Kaputt', text: 'x' }, name: '', overwrite: false },
    ],
    {
      existing: () => lib,
      add: async (title, text) => { if (title === 'Kaputt') throw new Error('voll'); calls.push(`add ${title}=${text}`) },
      update: async (id, p) => { calls.push(`update ${id} ${p.title}=${p.text}`) },
    },
  )
  assert.deepEqual(calls, ['update s1 Übergabe=neu', 'add Übergabe (Import)=zweite'])
  assert.deepEqual({ added: r.added, overwritten: r.overwritten, renamed: r.renamed, failed: r.failed }, { added: 1, overwritten: 1, renamed: 1, failed: ['Kaputt'] })
  assert.equal(
    importMessage({ trees: 1, treesOverwritten: 0, treesRenamed: 0, blocks: null, snippets: r }),
    '1 Vorlage, 2 Textbausteine übernommen. 1 vorhandener Eintrag ersetzt. 1 mit dem Zusatz „(Import)“, weil der Name schon vergeben war. Nicht gespeichert: „Kaputt“.',
  )
})

test('Abschnitte: Überschreiben ersetzt den vorhandenen, sonst neu mit „(Import)“', async () => {
  const { importBlocksWithChoices } = await import('./importNamed.ts')
  const c = (id: string, title: string) => ({ type: 'container', id, title, children: [] }) as never
  const calls: string[] = []
  const lib = {
    loaded: { value: true },
    blocks: { value: [c('b1', 'Vitalwerte')] },
    reload: async () => {},
    addBausteinFromContainer: async (_c: never, name: string) => { calls.push(`add ${name}`); return { ok: true as const, title: name } },
    replaceBlock: async (id: string, _c: never, name: string) => { calls.push(`replace ${id} ${name}`); return { ok: true as const, title: name } },
  }
  const r = await importBlocksWithChoices([
    { item: c('x', 'Vitalwerte'), name: '', overwrite: true },
    { item: c('y', 'Vitalwerte'), name: '', overwrite: false },
  ], lib)
  assert.deepEqual(calls, ['replace b1 Vitalwerte', 'add Vitalwerte (Import)'])
  assert.equal(r.overwritten, 1)
})
