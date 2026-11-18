import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinCloze, clozeOf, clozeGapIds, clozeGaps, clozeLeftovers, dropGaps, mergeParts, pruneCloze } from './cloze.ts'
import { render, renderContainer, gapText } from './render.ts'
import { countOpenRequired } from './required.ts'
import { removeNode, updateNode } from './creator.ts'
import { duplicateNode } from './treeOps.ts'
import { exportTemplate, parseTemplate } from './templateIO.ts'
import { isValidProtocolTree } from './protocolRepository.ts'
import type { ClozePart, Container, Field, FieldFill, FunctionNode, Node } from './model.ts'

const field = (id: string, extra: Partial<Field> = {}): Field => ({ type: 'field', id, ...extra })
const section = (id: string, children: Node[], extra: Partial<Container> = {}): Container => ({ type: 'container', id, children, ...extra })
const cloze = (id: string, parts: ClozePart[], children: Node[], extra: Partial<Container> = {}): Container =>
  section(id, children, { cloze: { parts }, ...extra })
const t = (text: string) => ({ text })
const g = (gap: string) => ({ gap })
const NONE: FieldFill = { state: 'excluded' }

test('joinCloze: gefüllte Lücken stehen an ihrer Stelle, fester Text bleibt unangetastet', () => {
  assert.equal(joinCloze([t('Patient ist '), g('wach'), t(' und  '), g('orientiert'), t(' .')]), 'Patient ist wach und  orientiert .')
})

test('joinCloze: leere Lücke hinterlässt kein doppeltes Leerzeichen und kein Leerzeichen vor dem Punkt', () => {
  assert.equal(joinCloze([t('Schmerzen '), g(''), t(' seit gestern.')]), 'Schmerzen seit gestern.')
  assert.equal(joinCloze([t('Schmerzen seit gestern '), g(''), t('.')]), 'Schmerzen seit gestern.')
  assert.equal(joinCloze([g(''), t(' Patient wach.')]), 'Patient wach.')
})

test('joinCloze: die leere Lücke nimmt ein Komma mit', () => {
  const list = (a: string, b: string, c: string) => joinCloze([g(a), t(', '), g(b), t(', '), g(c), t('.')])
  assert.equal(list('wach', 'orientiert', 'kooperativ'), 'wach, orientiert, kooperativ.')
  assert.equal(list('', 'orientiert', 'kooperativ'), 'orientiert, kooperativ.')
  assert.equal(list('wach', '', 'kooperativ'), 'wach, kooperativ.')
  assert.equal(list('wach', 'orientiert', ''), 'wach, orientiert.')
  assert.equal(list('wach', '', ''), 'wach.')
  assert.equal(joinCloze([t('Patient ist '), g(''), t(', orientiert.')]), 'Patient ist orientiert.')
})

test('joinCloze: „und/oder" ohne Folgewort und leere Klammern entfallen', () => {
  assert.equal(joinCloze([t('wach, orientiert und '), g(''), t('.')]), 'wach, orientiert.')
  assert.equal(joinCloze([t('wach, '), g(''), t(' und kooperativ.')]), 'wach und kooperativ.')
  assert.equal(joinCloze([t('RR 120/80 ('), g(''), t(') gemessen.')]), 'RR 120/80 gemessen.')
  assert.equal(joinCloze([t('Befund ('), g(''), t(').')]), 'Befund.')
  assert.equal(joinCloze([t('Undine ist '), g('wach'), t('.')]), 'Undine ist wach.', 'Wortanfang „und" ist keine Konjunktion')
})

test('joinCloze: eine Zeile nur aus der Lücke entfällt; ohne Buchstaben bleibt nichts', () => {
  assert.equal(joinCloze([t('Zeile 1\n'), g(''), t('\nZeile 3')]), 'Zeile 1\nZeile 3')
  assert.equal(joinCloze([t('Zeile 1\n'), g('Mitte'), t('\nZeile 3')]), 'Zeile 1\nMitte\nZeile 3')
  assert.equal(joinCloze([g(''), t(', '), g(''), t('.')]), '')
  assert.equal(joinCloze([g('   ')]), '', 'nur Leerraum zählt als leer')
})

test('joinCloze: zwei Lücken direkt nebeneinander', () => {
  assert.equal(joinCloze([t('Wert '), g('12'), g('mg'), t('.')]), 'Wert 12mg.')
  assert.equal(joinCloze([t('Wert '), g(''), g('mg'), t('.')]), 'Wert mg.')
})

const tree = (): Container =>
  section('root', [
    section('vital', [field('rr', { default: '120/80' }), field('puls', { default: '72' })], { excludable: true }),
    cloze(
      'lt',
      ['Patient ist ', { gap: 'bew' }, ', ', { gap: 'ori' }, '. RR ', { gap: 'rr' }, ' mmHg.'],
      [field('bew', { title: 'Bewusstsein', options: ['wach', 'somnolent'], showTitle: true }), field('ori', { title: 'Orientierung', default: 'orientiert' })],
    ),
  ])

test('render: Lückentext gibt den Satz aus, in der Lücke nur den Wert (ohne Titel)', () => {
  const out = render(tree())
  assert.equal(out, '120/80\n72\nPatient ist wach, orientiert. RR 120/80 mmHg.')
})

test('render: eigene Lücke folgt dem Wert im Einsatz, „nicht erhoben" räumt auf', () => {
  const lt = tree().children[1] as Container
  assert.equal(renderContainer(lt, { bew: { state: 'custom', value: 'somnolent' } }, undefined, tree()), 'Patient ist somnolent, orientiert. RR 120/80 mmHg.')
  assert.equal(renderContainer(lt, { ori: NONE }, undefined, tree()), 'Patient ist wach. RR 120/80 mmHg.')
})

test('render: Wert von anderer Stelle der Vorlage folgt dem Feld dort', () => {
  const root = tree()
  assert.match(render(root, { rr: { state: 'custom', value: '90/60' } }), /RR 90\/60 mmHg\.$/)
  // Der Abschnitt mit dem Quellfeld ist „nicht erhoben": dann steht der Wert auch in der Lücke nicht.
  assert.equal(render(root, { vital: NONE }), 'Patient ist wach, orientiert. RR mmHg.')
  // Ein Teil ohne Vorlage: die fremde Lücke findet ihr Ziel nicht und bleibt leer.
  assert.equal(renderContainer(root.children[1] as Container), 'Patient ist wach, orientiert. RR mmHg.')
})

test('render: Titel, Ersatztext und „nicht erhoben" des Abschnitts wirken wie bei jedem Abschnitt', () => {
  const lt = cloze('lt', ['Befund: ', { gap: 'a' }], [field('a')], { title: 'Neuro', showTitle: true, excludable: true, emptyText: 'kein Befund' })
  assert.equal(render(section('root', [lt]), { a: { state: 'custom', value: 'unauffällig' } }), '## Neuro\nBefund: unauffällig')
  assert.equal(render(section('root', [lt]), { lt: NONE }), '')
  const nurLuecke = cloze('lt', [{ gap: 'a' }], [field('a')], { emptyText: 'kein Befund' })
  assert.equal(render(section('root', [nurLuecke])), 'kein Befund')
})

test('render: Kinder ohne Lücke folgen unter dem Text, mehrzeiliger Text und Funktion in der Lücke', () => {
  const med: FunctionNode = { type: 'function', id: 'med', functionKind: 'medikamentenplan', title: 'Medikation', showTitle: true, default: 'keine Dauermedikation' }
  const lt = cloze('lt', ['Anamnese\n', { gap: 'an' }, '\n\nMedikation:\n', { gap: 'med' }], [field('an', { default: 'Sturz' }), med, field('extra', { default: 'Zusatz' })])
  assert.equal(render(section('root', [lt])), 'Anamnese\nSturz\n\nMedikation:\nkeine Dauermedikation\nZusatz')
  assert.equal(gapText(med, { state: 'function', rows: [], status: 'custom', text: 'ASS 100' }), 'ASS 100')
  assert.equal(gapText(med, { state: 'function', rows: [], status: 'excluded' }), '')
})

test('render: dieselbe Lücke darf mehrfach im Text stehen', () => {
  const lt = cloze('lt', [{ gap: 'n' }, ' klagt über Schmerzen. ', { gap: 'n' }, ' ist wach.'], [field('n', { default: 'Patient' })])
  assert.equal(render(section('root', [lt])), 'Patient klagt über Schmerzen. Patient ist wach.')
  assert.deepEqual(clozeGapIds(lt.cloze!), ['n'])
})

test('Pflicht: eine offene Pflicht-Lücke zählt wie ein Pflichtfeld', () => {
  const lt = cloze('lt', ['Ziel: ', { gap: 'z' }], [field('z', { required: true })])
  assert.equal(countOpenRequired(section('root', [lt]), {}), 1)
  assert.equal(countOpenRequired(section('root', [lt]), { z: { state: 'custom', value: 'Klinik' } }), 0)
})

test('clozeGaps: eigene Lücke und Wert von anderer Stelle, Verweis ohne Ziel entfällt', () => {
  const root = tree()
  const lt = root.children[1] as Container
  const withDangling: Container = { ...lt, cloze: { parts: [...lt.cloze!.parts, { gap: 'weg' }] } }
  assert.deepEqual(clozeGaps(root, withDangling).map((x) => [x.id, x.own]), [['bew', true], ['ori', true], ['rr', false]])
  assert.deepEqual(clozeLeftovers(lt, lt.cloze!), [])
  assert.deepEqual(clozeGaps(root, section('x', [])), [])
})

test('clozeOf: fremde Daten - ohne parts kein Lückentext, unlesbare Stücke entfallen', () => {
  assert.equal(clozeOf(section('a', [], { cloze: {} as never })), null)
  assert.equal(clozeOf(section('a', [], { cloze: 'x' as never })), null)
  assert.deepEqual(clozeOf(section('a', [], { cloze: { parts: ['a', 5, { gap: 1 }, null, { gap: 'b' }] as never } }))?.parts, ['a', { gap: 'b' }])
  // Eine fremde Vorlage mit kaputtem Eintrag rendert als normaler Abschnitt.
  assert.equal(render(section('root', [section('a', [field('f', { default: 'x' })], { cloze: { parts: 7 } as never })])), 'x')
})

test('mergeParts + pruneCloze: Verweise ohne Ziel verschwinden, Nachbartexte wachsen zusammen', () => {
  assert.deepEqual(mergeParts(['a', '', 'b', { gap: 'x' }, 'c']), ['ab', { gap: 'x' }, 'c'])
  const root = section('root', [cloze('lt', ['Vor ', { gap: 'weg' }, 'nach ', { gap: 'da' }], [field('da')])])
  const pruned = pruneCloze(root)
  assert.deepEqual((pruned.children[0] as Container).cloze?.parts, ['Vor nach ', { gap: 'da' }])
  assert.equal(pruneCloze(pruned), pruned, 'nichts zu tun -> selbe Referenz')
  const plain = section('root', [field('a')])
  assert.equal(pruneCloze(plain), plain)
  const broken = pruneCloze(section('root', [section('a', [], { cloze: { parts: 7 } as never })]))
  assert.equal('cloze' in broken.children[0], false, 'unlesbarer Eintrag wird verworfen')
})

test('dropGaps: der Text wächst zusammen, als wäre die Lücke leer geblieben', () => {
  const parts: ClozePart[] = ['RR ', { gap: 'a' }, ' mmHg, Puls ', { gap: 'b' }, ', ', { gap: 'c' }]
  assert.deepEqual(dropGaps(parts, (id) => id === 'a'), ['RR mmHg, Puls ', { gap: 'b' }, ', ', { gap: 'c' }])
  assert.deepEqual(dropGaps(parts, (id) => id === 'c'), ['RR ', { gap: 'a' }, ' mmHg, Puls ', { gap: 'b' }])
  assert.deepEqual(dropGaps(parts, () => true), ['RR mmHg, Puls'])
  assert.deepEqual(dropGaps([{ gap: 'a' }, { gap: 'b' }], (id) => id === 'a'), [{ gap: 'b' }])
})

test('Entfernen: Lücke eines gelöschten Elements verschwindet - auch der Verweis von anderer Stelle', () => {
  const root = tree()
  const ohneOri = removeNode(root, 'ori')
  assert.deepEqual((ohneOri.children[1] as Container).cloze?.parts, ['Patient ist ', { gap: 'bew' }, '. RR ', { gap: 'rr' }, ' mmHg.'])
  const ohneVital = removeNode(root, 'vital')
  assert.deepEqual(clozeGapIds((ohneVital.children[0] as Container).cloze!), ['bew', 'ori'])
})

test('Umbenennen und Kopieren: Lücken ziehen mit', () => {
  const root = tree()
  const renamed = updateNode(root, 'rr', { id: 'blutdruck' })
  assert.deepEqual(clozeGapIds((renamed.children[1] as Container).cloze!), ['bew', 'ori', 'blutdruck'])
  let n = 0
  const copied = duplicateNode(root, 'lt', () => `neu${++n}`)!
  const copy = copied.root.children[2] as Container
  const ownIds = copy.children.map((c) => c.id)
  assert.equal(ownIds.includes('bew'), false, 'die Kopie hat eigene Kennungen')
  // Eigene Lücken zeigen auf die Kopie, der Verweis nach außen bleibt.
  assert.deepEqual(clozeGapIds(copy.cloze!), [...ownIds, 'rr'])
  assert.deepEqual(clozeGaps(copied.root, copy).map((x) => x.own), [true, true, false])
})

test('Export und Import: der Lückentext übersteht den Weg, Verweise ohne Ziel werden entfernt', () => {
  const root = tree()
  const back = parseTemplate(exportTemplate(root))
  assert.ok(back.ok)
  assert.deepEqual(back.tree, root)
  const cut = section('root', [root.children[1]]) // Abschnitt mit dem Quellfeld fehlt
  const imported = parseTemplate(exportTemplate(cut))
  assert.ok(imported.ok)
  assert.deepEqual(clozeGapIds((imported.tree.children[0] as Container).cloze!), ['bew', 'ori'])
  assert.equal(render(imported.tree), 'Patient ist wach, orientiert. RR mmHg.')
})

test('ältere App-Version: ohne die Eigenschaft bleibt ein normaler Abschnitt mit denselben Feldern', () => {
  const lt = tree().children[1] as Container
  const { cloze: _ignored, ...old } = lt
  assert.equal(renderContainer(old), '## Bewusstseinwach\norientiert')
})

test('pruneCloze: ein kaputter Baum wird nicht angefasst und wirft nicht', () => {
  const broken = { type: 'container', id: 'bad', cloze: { parts: [] }, children: [null, { type: 'container', id: 'x' }] } as unknown as Container
  assert.doesNotThrow(() => pruneCloze(broken))
  const parsed = parseTemplate(JSON.stringify({ schema: 'resqdocs-protocol', version: 1, tree: { type: 'container', id: 'bad', children: [null] } }))
  assert.ok(parsed.ok)
})

// Datensicherheit: eine Testversion darf vorhandene Vorlagen nie gefährden, auch nicht beim Wechsel
// zurück auf eine ältere App-Version.
test('Datensicherheit: Vorlage mit Lückentext besteht die Ladeprüfung jeder App-Version', () => {
  // dieselbe Prüfung wie in 1.13.0 (Grundform: type, id, children) - der Lückentext ändert daran nichts
  assert.equal(isValidProtocolTree(tree()), true)
  assert.equal(isValidProtocolTree(JSON.parse(JSON.stringify(tree()))), true)
})

test('Datensicherheit: Aufräumen beim Import und Löschen entfernt nie Felder, nur Verweise im Text', () => {
  const root = section('root', [cloze('lt', ['a ', { gap: 'weg' }, { gap: 'x' }], [field('x'), field('y', { default: 'bleibt' })])])
  const pruned = pruneCloze(root)
  assert.deepEqual((pruned.children[0] as Container).children, (root.children[0] as Container).children)
  const imported = parseTemplate(exportTemplate(root))
  assert.ok(imported.ok)
  assert.deepEqual((imported.tree.children[0] as Container).children.map((c) => c.id), ['x', 'y'])
})

test('Datensicherheit: eine ältere App ändert eine Vorlage, ohne den Lückentext zu verlieren', () => {
  // Ältere Versionen kennen `cloze` nicht, ändern aber über updateNode (Kopie aller Eigenschaften).
  const changed = updateNode(tree(), 'lt', { title: 'Neuer Titel' })
  assert.deepEqual((changed.children[1] as Container).cloze, (tree().children[1] as Container).cloze)
})
