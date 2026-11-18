import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyText, foreignCandidates, fromCloze, gapFromRange, gapNames, removeGap, retargetGap, revertGap, sectionText, toCloze, tokenize } from './clozeEdit.ts'
import { clozeGapIds } from './cloze.ts'
import { render } from './render.ts'
import type { ClozePart, Container, Field, FunctionNode, Node } from './model.ts'

const field = (id: string, extra: Partial<Field> = {}): Field => ({ type: 'field', id, ...extra })
const section = (id: string, children: Node[], extra: Partial<Container> = {}): Container => ({ type: 'container', id, children, ...extra })
const cloze = (parts: ClozePart[], children: Node[]): Container => section('lt', children, { cloze: { parts } })
const ids = (prefix = 'n'): (() => string) => {
  let n = 0
  return () => `${prefix}${++n}`
}
const base = (): Container =>
  cloze(['Patient ist ', { gap: 'bew' }, ', RR ', { gap: 'rr' }, '.'], [field('bew', { title: 'Bewusstsein', options: ['wach', 'müde'] }), field('extra', { title: 'Zusatz' })])
const root = (lt: Container): Container => section('root', [section('vital', [field('rr', { title: 'RR', default: '120/80' })], { title: 'Vitalwerte' }), lt])

test('sectionText: jede Lücke steht als {Name}, gleiche Titel bekommen einen Zähler', () => {
  const lt = base()
  assert.equal(sectionText(lt, root(lt)), 'Patient ist {Bewusstsein}, RR {RR}.')
  const twice = cloze([{ gap: 'a' }, ' ', { gap: 'b' }, ' ', { gap: 'c' }], [field('a', { title: 'Wert' }), field('b', { title: 'wert' }), field('c')])
  assert.deepEqual([...gapNames(twice, null).values()], ['Wert', 'wert 2', 'Lücke'])
  assert.equal(sectionText(twice, null), '{Wert} {wert 2} {Lücke}')
})

test('tokenize: Lage jedes Stücks, bekannte und neue Namen', () => {
  const tokens = tokenize('A {Bewusstsein} b {Neu}', new Map([['bew', 'Bewusstsein']]))
  assert.deepEqual(tokens.map((t) => [t.kind, t.start, t.end, t.text, t.id]), [
    ['text', 0, 2, 'A ', undefined],
    ['gap', 2, 15, 'Bewusstsein', 'bew'],
    ['text', 15, 18, ' b ', undefined],
    ['gap', 18, 23, 'Neu', undefined],
  ])
  assert.deepEqual(tokenize('ohne { Klammer', new Map()).map((t) => t.kind), ['text'])
})

test('applyText: Text ändern lässt die Lücken stehen; unverändert -> selbe Referenz', () => {
  const lt = base()
  const r = root(lt)
  assert.equal(applyText(lt, r, sectionText(lt, r), ids()), lt)
  const next = applyText(lt, r, 'Der Patient wirkt {Bewusstsein}. Blutdruck {RR} mmHg.', ids())
  assert.deepEqual(next.cloze?.parts, ['Der Patient wirkt ', { gap: 'bew' }, '. Blutdruck ', { gap: 'rr' }, ' mmHg.'])
  assert.deepEqual(next.children.map((c) => c.id), ['bew', 'extra'])
})

test('applyText: neuer {Name} legt eine Freitext-Lücke an, derselbe Name zweimal ist eine Lücke', () => {
  const lt = base()
  const next = applyText(lt, root(lt), '{Bewusstsein}, {Schmerz} seit {Dauer}. {schmerz} bleibt.', ids())
  assert.deepEqual(next.children.map((c) => [c.id, c.title]), [['bew', 'Bewusstsein'], ['n1', 'Schmerz'], ['n2', 'Dauer'], ['extra', 'Zusatz']])
  assert.deepEqual(clozeGapIds(next.cloze!), ['bew', 'n1', 'n2'])
})

test('applyText: eine aus dem Text gelöschte Lücke verschwindet samt Feld; Felder ohne Lücke und fremde Elemente bleiben', () => {
  const lt = base()
  const r = root(lt)
  const next = applyText(lt, r, 'Nur noch Text und {RR}.', ids())
  assert.deepEqual(next.children.map((c) => c.id), ['extra'])
  assert.deepEqual(next.cloze?.parts, ['Nur noch Text und ', { gap: 'rr' }, '.'])
  const none = applyText(lt, r, 'Gar keine Lücke.', ids())
  assert.deepEqual(none.cloze?.parts, ['Gar keine Lücke.'])
  assert.equal(render(section('root', [r.children[0], none])), '120/80\nGar keine Lücke.')
})

test('applyText: eigene Felder stehen in der Reihenfolge des Textes', () => {
  const lt = cloze([{ gap: 'a' }, ' ', { gap: 'b' }], [field('a', { title: 'A' }), field('b', { title: 'B' })])
  assert.deepEqual(applyText(lt, null, '{B} vor {A}', ids()).children.map((c) => c.id), ['b', 'a'])
})

test('gapFromRange: Wort oder Markierung wird Lücke, der Text wird Name und Standardwert', () => {
  const lt = cloze(['Patient ist wach und orientiert.'], [])
  const made = gapFromRange(lt, null, 'Patient ist wach und orientiert.', 12, 16, ids('g'))!
  assert.equal(made.id, 'g1')
  assert.deepEqual(made.section.cloze?.parts, ['Patient ist ', { gap: 'g1' }, ' und orientiert.'])
  assert.deepEqual(made.section.children.map((c) => [c.id, c.title, (c as Field).default]), [['g1', 'wach', 'wach']])
  assert.equal(render(section('root', [made.section])), 'Patient ist wach und orientiert.', 'die Ausgabe bleibt zunächst dieselbe')
})

test('gapFromRange: leere Stelle = neue leere Lücke; doppelte Namen bekommen einen Zähler; Lücken lassen sich nicht schachteln', () => {
  const lt = cloze(['wach, ', { gap: 'a' }], [field('a', { title: 'wach' })])
  const text = sectionText(lt, null)
  assert.equal(text, 'wach, {wach}')
  const made = gapFromRange(lt, null, text, 0, 4, ids('g'))!
  assert.equal(sectionText(made.section, null), '{wach 2}, {wach}')
  const empty = gapFromRange(lt, null, text, 6, 6, ids('g'))!
  assert.equal(sectionText(empty.section, null), 'wach, {Lücke}{wach}')
  assert.equal((empty.section.children.find((c) => c.id === 'g1') as Field).default, undefined)
  assert.equal(gapFromRange(lt, null, text, 4, 9, ids()), null, 'schneidet die bestehende Lücke')
})

test('revertGap: der Standardwert steht wieder als Text da, das Feld ist weg', () => {
  const lt = cloze(['Patient ist ', { gap: 'bew' }, '.'], [field('bew', { title: 'Bewusstsein', options: ['wach', 'müde'] })])
  const back = revertGap(lt, null, 'bew')
  assert.deepEqual(back.cloze?.parts, ['Patient ist wach.'])
  assert.deepEqual(back.children, [])
  const ohneWert = revertGap(cloze(['Ziel: ', { gap: 'z' }], [field('z', { title: 'Zielklinik' })]), null, 'z')
  assert.deepEqual(ohneWert.cloze?.parts, ['Ziel: Zielklinik'])
  const med: FunctionNode = { type: 'function', id: 'm', functionKind: 'medikamentenplan', title: 'Medikation', default: 'keine' }
  assert.deepEqual(revertGap(cloze([{ gap: 'm' }], [med]), null, 'm').cloze?.parts, ['keine'])
})

test('revertGap + removeGap: ein Wert von anderer Stelle lässt das Element dort unberührt', () => {
  const lt = base()
  const r = root(lt)
  assert.deepEqual(revertGap(lt, r, 'rr').cloze?.parts, ['Patient ist ', { gap: 'bew' }, ', RR 120/80.'])
  const removed = removeGap(lt, 'bew')
  assert.deepEqual(removed.cloze?.parts, ['Patient ist RR ', { gap: 'rr' }, '.'])
  assert.deepEqual(removed.children.map((c) => c.id), ['extra'])
  assert.deepEqual(removeGap(lt, 'rr').children.map((c) => c.id), ['bew', 'extra'])
})

test('retargetGap: Wert von anderer Stelle übernehmen, wieder selbst abfragen, Art der Lücke ändern', () => {
  const lt = base()
  const foreign = retargetGap(lt, 'bew', 'rr')
  assert.deepEqual(foreign.children.map((c) => c.id), ['extra'])
  assert.deepEqual(clozeGapIds(foreign.cloze!), ['rr'])
  const own = retargetGap(lt, 'rr', 'neu', field('neu', { title: 'RR' }))
  assert.deepEqual(clozeGapIds(own.cloze!), ['bew', 'neu'])
  assert.deepEqual(own.children.map((c) => c.id), ['bew', 'extra', 'neu'])
  const news: FunctionNode = { type: 'function', id: 'bew', functionKind: 'news2', title: 'NEWS2' }
  const kind = retargetGap(lt, 'bew', 'bew', news)
  assert.deepEqual(kind.children.map((c) => [c.id, c.type]), [['bew', 'function'], ['extra', 'field']])
  assert.deepEqual(clozeGapIds(kind.cloze!), ['bew', 'rr'])
})

test('foreignCandidates: Felder und Funktionen außerhalb des Abschnitts, mit Weg', () => {
  const lt = base()
  assert.deepEqual(foreignCandidates(root(lt), lt), [{ id: 'rr', label: 'Vitalwerte › RR' }])
})

test('toCloze + fromCloze: normaler Abschnitt wird Lückentext mit gleicher Ausgabe-Anordnung und zurück', () => {
  const plain = section('s', [field('a', { title: 'A', default: '1' }), field('b', { title: 'B', default: '2', inline: true }), field('c', { title: 'Befund', showTitle: true, default: '3' })])
  const lt = toCloze(plain)
  assert.deepEqual(lt.cloze?.parts, [{ gap: 'a' }, ', ', { gap: 'b' }, '\nBefund: ', { gap: 'c' }])
  assert.equal(render(section('root', [lt])), '1, 2\nBefund: 3')
  assert.equal(toCloze(lt), lt)
  assert.deepEqual(fromCloze(lt), plain)
})
