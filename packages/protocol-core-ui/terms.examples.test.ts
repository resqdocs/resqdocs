// node --test --experimental-strip-types
// Die Beispiele in den ⓘ-Erklaerungen muessen stimmen: Jedes wird hier mit dem echten Renderer erzeugt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render } from '@resqdocs/protocol-core/render'
import { INFO, type InfoText } from './terms.ts'

const H = (prefix = '', suffix = ': ', fill = '', width = 0, fillMode = 'inclusive') => ({ prefix, suffix, fill, width, fillMode })
const root = (...children: unknown[]) => ({ type: 'container', id: 'r', children })
const F = (id: string, title: string | undefined, def: string, extra: object = {}) => ({
  type: 'field',
  id,
  ...(title ? { title, showTitle: true, heading: H() } : {}),
  default: def,
  ...extra,
})
// Abschnitt mit Inhalt: der Inhalt zaehlt nicht zum Beispiel, deshalb wird er danach entfernt.
const S = (id: string, title: string, heading: object, extra: object = {}) => ({
  type: 'container',
  id,
  title,
  showTitle: true,
  heading,
  children: [{ type: 'field', id: `${id}-inhalt`, default: 'INHALT' }],
  ...extra,
})
const out = (tree: unknown, values: object = {}) => render(tree as never, values as never)
const headingsOnly = (text: string) => text.split('\n').filter((l) => l !== 'INHALT').join('\n')
const rows = { m: { state: 'function', status: 'confirmed', rows: [{ name: 'Medikament A' }, { name: 'Medikament B' }] } }
const list = (config: object) => root({ type: 'function', id: 'm', functionKind: 'medikamentenplan', config })
const banner = (fill: 'inclusive' | 'exclusive', width: number) =>
  headingsOnly(out(root(S('a', 'Anamnese', H('# ', ' ', '=', width, fill)), S('b', 'Verlauf', H('# ', ' ', '=', width, fill)))))
const emptySection = (extra: object) => root({ type: 'container', id: 'c', title: 'Verlauf', showTitle: true, heading: H('', ''), children: [{ type: 'field', id: 'x' }], ...extra })

const EXPECTED: Record<string, string[]> = {
  showTitle: [out(root(F('a', 'Puls', '80'))), out(root({ type: 'field', id: 'a', title: 'Puls', default: '80' }))],
  multiline: [out(root(F('a', 'Verlauf', 'Erste Zeile\nZweite Zeile', { heading: H('', ''), multiline: true })))],
  prefix: [out(root(F('a', 'Alter', '56', { heading: H('- ') })))],
  suffix: [out(root(F('a', 'Puls', '80'))), out(root(F('a', 'Puls', '80', { heading: H('', '') })))],
  titleOwnLine: [out(root(F('a', 'Atmung', 'unauffällig', { titleInline: false, heading: H('', '') }))), out(root(F('a', 'Atmung', 'unauffällig')))],
  fill: [headingsOnly(out(root(S('a', 'Anamnese', H('# ', ' ', '=', 20)))))],
  fillMode: [banner('inclusive', 20), banner('exclusive', 5)],
  blankLineBefore: [
    headingsOnly(out(root(F('a', 'Puls', '80'), S('b', 'Verlauf', H('# ', ''), { blankLineBefore: true })))),
    headingsOnly(out(root(F('a', 'Puls', '80'), S('b', 'Verlauf', H('# ', ''))))),
  ],
  inline: [out(root(F('a', 'Puls', '80'), F('b', 'RR', '120/80', { inline: true }))), out(root(F('a', 'Puls', '80'), F('b', 'RR', '120/80')))],
  noSeparatorBefore: [
    out(root(F('a', 'Puls', '80'), F('b', undefined, '/min', { inline: true, noSeparatorBefore: true }))),
    out(root(F('a', 'Puls', '80'), F('b', undefined, '/min', { inline: true }))),
  ],
  separator: [
    out(root(F('a', undefined, 'Kein Stridor'), F('b', undefined, 'Keine Dyspnoe', { inline: true }))),
    out({ ...root(F('a', undefined, 'Kein Stridor'), F('b', undefined, 'Keine Dyspnoe', { inline: true })), separator: '. ' }),
  ],
  emptyText: [out(root(emptySection({ emptyText: 'unauffällig' }))), out(root(emptySection({})))],
  rowLayout: [out(list({ rowLayout: 'inline' }), rows), out(list({ rowLayout: 'block' }), rows)],
  rowSeparator: [out(list({ rowLayout: 'inline', rowSeparator: '; ' }), rows)],
  rowPrefix: [out(list({ rowLayout: 'block', rowPrefix: '- ' }), rows)],
  rowSuffix: [out(list({ rowLayout: 'block', rowSuffix: ';' }), rows)],
}

const infos = INFO as Record<string, InfoText>

for (const [key, expected] of Object.entries(EXPECTED)) {
  test(`Beispiel „${key}“ entspricht der echten Ausgabe`, () => {
    assert.deepEqual(infos[key].examples?.map((e) => e.output), expected)
  })
}

test('jedes Beispiel in den Erklaerungen wird hier geprueft', () => {
  const withExamples = Object.keys(infos).filter((k) => infos[k].examples?.length).sort()
  assert.deepEqual(withExamples, Object.keys(EXPECTED).sort())
})
