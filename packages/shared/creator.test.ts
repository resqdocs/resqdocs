import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createContainer, createField, createFunction, addChild, updateNode, removeNode, moveChild, moveUp, moveDown, findNode, findPath, suggestFreeId, collectIds, parentOf, isDescendant, reparent, indentChild, outdentChild, canMoveUp, canMoveDown, canIndent, canOutdent, moveTargets, previewValues } from './creator.ts'
import { render } from './render.ts'
import type { Container } from './model.ts'

test('createContainer / createField', () => {
  assert.deepEqual(createContainer('a'), { type: 'container', id: 'a', children: [] })
  assert.deepEqual(createField('f'), { type: 'field', id: 'f' })
})

test('addChild + findNode: Container und Feld verschachteln/finden', () => {
  let root = createContainer('root')
  root = addChild(root, 'root', createContainer('c1'))
  root = addChild(root, 'c1', createField('f1'))
  assert.equal(findNode(root, 'c1')?.type, 'container')
  assert.equal(findNode(root, 'f1')?.type, 'field')
})

test('updateNode: Container immutabel patchen, Original unveraendert', () => {
  const root = addChild(createContainer('root'), 'root', createContainer('c1'))
  const next = updateNode(root, 'c1', { title: 'Hallo', showTitle: true })
  assert.notEqual(next, root)
  assert.equal(findNode(next, 'c1')?.title, 'Hallo')
  assert.equal(findNode(root, 'c1')?.title, undefined)
})

test('updateNode: FELD patchen (Standardwert, inline)', () => {
  let root = addChild(createContainer('root'), 'root', createField('f'))
  root = updateNode(root, 'f', { title: 'RR', default: '120', inline: true })
  const f = findNode(root, 'f')
  assert.equal(f?.type, 'field')
  assert.equal(f?.title, 'RR')
  assert.equal((f as { default?: string }).default, '120')
  assert.equal((f as { inline?: boolean }).inline, true)
})

test('removeNode: Feld per id entfernen', () => {
  let root = createContainer('root')
  root = addChild(root, 'root', createField('f'))
  root = addChild(root, 'root', createContainer('c'))
  assert.deepEqual(removeNode(root, 'f').children.map((n) => n.id), ['c'])
})

test('moveChild: Feld per id verschieben', () => {
  let root = createContainer('root')
  root = addChild(root, 'root', createField('a'))
  root = addChild(root, 'root', createField('b'))
  assert.deepEqual(moveChild(root, 'a', 1).children.map((n) => n.id), ['b', 'a'])
})

test('findPath: Pfad Wurzel -> Knoten (inkl.), [] wenn nicht da', () => {
  let root = createContainer('root')
  root = addChild(root, 'root', createContainer('a'))
  root = addChild(root, 'a', createField('f'))
  assert.deepEqual(findPath(root, 'f').map((n) => n.id), ['root', 'a', 'f'])
  assert.deepEqual(findPath(root, 'root').map((n) => n.id), ['root'])
  assert.deepEqual(findPath(root, 'nope'), [])
})

test('No-Op-Ops geben dieselbe Referenz zurueck (Identitaet erhalten)', () => {
  let root = createContainer('root')
  root = addChild(root, 'root', createField('f'))
  assert.equal(updateNode(root, 'nichtda', { title: 'x' }), root)
  assert.equal(addChild(root, 'nichtda', createField('x')), root)
  assert.equal(removeNode(root, 'nichtda'), root)
  assert.equal(moveChild(root, 'nichtda', 1), root)
  assert.equal(moveChild(root, 'f', -1), root) // Rand -> No-Op
})

test('suggestFreeId: erste freie Variante (base, base-2, base-3, …)', () => {
  let root = createContainer('r')
  root = addChild(root, 'r', createField('anamnese'))
  root = addChild(root, 'r', createField('anamnese-2'))
  assert.equal(suggestFreeId(root, 'frei'), 'frei') // frei -> unveraendert
  assert.equal(suggestFreeId(root, 'anamnese'), 'anamnese-3') // anamnese + anamnese-2 belegt
})

test('createFunction: Funktions-Blatt; Tree-Ops behandeln es als Blatt', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createFunction('mp'))
  r = addChild(r, 'r', createContainer('c'))
  const fn = findNode(r, 'mp')
  assert.equal(fn?.type, 'function')
  assert.equal((fn as { functionKind?: string }).functionKind, 'medikamentenplan')
  assert.equal(fn?.title, 'Medikamentenplan') // Default-Titel aus der Registry (Editor==Einsatz)
  assert.equal(parentOf(r, 'mp')?.id, 'r')
  assert.equal(parentOf(reparent(r, 'mp', 'c'), 'mp')?.id, 'c') // verschiebbar wie ein Blatt
  assert.deepEqual(moveTargets(r, 'mp').map((t) => t.id).sort(), ['c', 'r']) // Funktion selbst kein Ziel
})

test('collectIds: alle ids des Teilbaums (fuer Werte-Aufraeumen)', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createField('x'))
  r = addChild(r, 'a', createFunction('mp'))
  assert.deepEqual(collectIds(findNode(r, 'a')!).sort(), ['a', 'mp', 'x'])
})

test('FunctionNode mit Config + titleInline: JSON-Roundtrip verlustfrei', () => {
  const fn = { ...createFunction('mp'), titleInline: true, config: { rowLayout: 'inline' as const, rowSeparator: ' | ', rowPrefix: '- ', rowSuffix: ';' } }
  assert.deepEqual(JSON.parse(JSON.stringify(fn)), fn)
})

test('parentOf / isDescendant', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createField('x'))
  r = addChild(r, 'r', createField('y'))
  assert.equal(parentOf(r, 'x')?.id, 'a')
  assert.equal(parentOf(r, 'a')?.id, 'r')
  assert.equal(parentOf(r, 'r'), null)
  assert.equal(isDescendant(r, 'a', 'x'), true)
  assert.equal(isDescendant(r, 'a', 'a'), true) // gleich -> true
  assert.equal(isDescendant(r, 'a', 'y'), false)
})

test('reparent: Feld in anderen Container (id bleibt, ans Ende)', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'r', createContainer('b'))
  r = addChild(r, 'a', createField('x'))
  const out = reparent(r, 'x', 'b')
  assert.equal(parentOf(out, 'x')?.id, 'b')
  assert.equal(findNode(out, 'x')?.id, 'x') // id erhalten -> Werte unberuehrt
  assert.equal((findNode(out, 'a') as Container).children.length, 0)
})

test('reparent: Zyklus/Field-Ziel/Wurzel/unbekannt -> No-Op (selbe Referenz)', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createContainer('a1'))
  r = addChild(r, 'r', createField('f'))
  assert.equal(reparent(r, 'a', 'a1'), r) // Container in eigenen Teilbaum
  assert.equal(reparent(r, 'a', 'a'), r) // in sich selbst
  assert.equal(reparent(r, 'a', 'f'), r) // Ziel ist ein Feld
  assert.equal(reparent(r, 'r', 'a'), r) // Wurzel verschieben
  assert.equal(reparent(r, 'nichtda', 'a'), r) // child unbekannt
  assert.equal(reparent(r, 'a', 'nichtda'), r) // Ziel unbekannt
})

test('indentChild: wird letztes Kind des Container-Vorgaengers; sonst No-Op', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'r', createField('x'))
  assert.equal(parentOf(indentChild(r, 'x'), 'x')?.id, 'a') // x folgt auf Container a -> einruecken
  assert.equal(indentChild(r, 'a'), r) // a ist erstes Kind -> kein Vorgaenger
  let r2 = createContainer('r')
  r2 = addChild(r2, 'r', createField('p'))
  r2 = addChild(r2, 'r', createField('x'))
  assert.equal(indentChild(r2, 'x'), r2) // Vorgaenger ist ein Feld -> No-Op
})

test('previewValues (#55): feste Beispielwerte fuer JEDE Funktion mit sampleFill (Editor-Vorschau)', () => {
  // Baum: reines Feld (kein sampleFill) + Score + Listen-Funktion.
  let root = createContainer('root')
  root = addChild(root, 'root', createField('feld'))
  root = addChild(root, 'root', createFunction('py', 'packYears'))
  root = addChild(root, 'root', createFunction('med', 'medikamentenplan'))
  const vals = previewValues(root)
  // Beide Funktionen bekommen ein Demo-Fill, das reine Feld nicht.
  assert.deepEqual(Object.keys(vals).sort(), ['med', 'py'])
  assert.deepEqual(vals.py, { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] })
  // End-to-end: mit diesen Werten werden Score UND Medikamente in der Vorschau-Ausgabe sichtbar.
  const out = render(root, vals)
  assert.ok(out.includes('≈23 py (30/Tag, 15 J.)'))
  assert.ok(out.includes('Beispiel-Wirkstoff A 500 mg, 1-0-1'))
  // Ohne previewValues (leere Werte = Einsatz-Start) bleiben die Funktions-Bodies leer (nur der Titel).
  assert.ok(!render(root).includes('py ('))
  assert.ok(!render(root).includes('Beispiel-Wirkstoff'))
})

test('outdentChild: wird Geschwister hinter dem Eltern-Container; Wurzel-Ebene -> No-Op', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createField('x'))
  r = addChild(r, 'r', createField('z'))
  const out = outdentChild(r, 'x')
  assert.equal(parentOf(out, 'x')?.id, 'r')
  assert.deepEqual(out.children.map((c) => c.id), ['a', 'x', 'z']) // direkt hinter a
  assert.equal(outdentChild(r, 'z'), r) // schon auf Wurzel-Ebene
})

test('moveUp/moveDown: lineares Outliner-Modell (Maintainer-Beispiel 3.2 -> 2.4)', () => {
  // Container[ sub1[1.1], sub2[2.1,2.2,2.3], sub3[3.1,3.2] ]
  let r = createContainer('root')
  r = addChild(r, 'root', createContainer('sub1'))
  r = addChild(r, 'sub1', createField('1.1'))
  r = addChild(r, 'root', createContainer('sub2'))
  r = addChild(r, 'sub2', createField('2.1'))
  r = addChild(r, 'sub2', createField('2.2'))
  r = addChild(r, 'sub2', createField('2.3'))
  r = addChild(r, 'root', createContainer('sub3'))
  r = addChild(r, 'sub3', createField('3.1'))
  r = addChild(r, 'sub3', createField('3.2'))

  // 1x Hoch: 3.2 tauscht mit 3.1 (Blatt-Vorgaenger, innerhalb sub3)
  const s1 = moveUp(r, '3.2')
  assert.deepEqual((findNode(s1, 'sub3') as Container).children.map((c) => c.id), ['3.2', '3.1'])
  // 2x Hoch: 3.2 ist erstes Kind von sub3 -> rueckt VOR sub3 (Container-Ebene)
  const s2 = moveUp(s1, '3.2')
  assert.deepEqual(s2.children.map((c) => c.id), ['sub1', 'sub2', '3.2', 'sub3'])
  // 3x Hoch: Vorgaenger ist sub2 (Container) -> HINEIN ans Ende -> 3.2 wird 2.4
  const s3 = moveUp(s2, '3.2')
  assert.deepEqual((findNode(s3, 'sub2') as Container).children.map((c) => c.id), ['2.1', '2.2', '2.3', '3.2'])
  assert.deepEqual(s3.children.map((c) => c.id), ['sub1', 'sub2', 'sub3'])

  // Runter zurueck: letztes Kind von sub2 -> hinter sub2 ausruecken
  const d1 = moveDown(s3, '3.2')
  assert.deepEqual(d1.children.map((c) => c.id), ['sub1', 'sub2', '3.2', 'sub3'])
  // Nachfolger ist sub3 (Container) -> HINEIN an den Anfang
  const d2 = moveDown(d1, '3.2')
  assert.deepEqual((findNode(d2, 'sub3') as Container).children.map((c) => c.id), ['3.2', '3.1'])

  // Rand: sub1 ist erstes Kind der Wurzel -> Hoch No-Op (selbe Referenz)
  assert.equal(moveUp(r, 'sub1'), r)
  // Rand: sub3 ist letztes Kind der Wurzel -> Runter No-Op
  assert.equal(moveDown(r, 'sub3'), r)
})

test('Move-Praedikate (canMoveUp/Down/Indent/Outdent)', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createField('x'))
  r = addChild(r, 'r', createField('y'))
  r = addChild(r, 'r', createContainer('b')) // r.children = [a, y, b]
  assert.equal(canMoveUp(r, 'a'), false) // erstes Kind
  assert.equal(canMoveUp(r, 'y'), true)
  assert.equal(canMoveDown(r, 'b'), false) // letztes
  assert.equal(canMoveDown(r, 'a'), true)
  assert.equal(canIndent(r, 'a'), false) // kein Vorgaenger
  assert.equal(canIndent(r, 'y'), true) // Vorgaenger a ist Container
  assert.equal(canIndent(r, 'b'), false) // Vorgaenger y ist Feld
  assert.equal(canOutdent(r, 'x'), true) // x liegt in a
  assert.equal(canOutdent(r, 'a'), false) // a liegt direkt unter der Wurzel
})

test('moveTargets: eigener Teilbaum + Felder raus; aktueller Parent markiert', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createContainer('a'))
  r = addChild(r, 'a', createField('x'))
  r = addChild(r, 'r', createContainer('b'))
  const tx = moveTargets(r, 'x') // Feld x: alle Container, Parent a = current
  assert.deepEqual(tx.map((t) => t.id), ['r', 'a', 'b'])
  assert.equal(tx.find((t) => t.id === 'a')?.current, true)
  const ta = moveTargets(r, 'a') // Container a: eigener Teilbaum (a + x) faellt weg
  assert.deepEqual(ta.map((t) => t.id), ['r', 'b'])
})

test('reparent same-parent: Mittel-Index korrekt + No-Op an eigener Position', () => {
  let r = createContainer('r')
  r = addChild(r, 'r', createField('a'))
  r = addChild(r, 'r', createField('b'))
  r = addChild(r, 'r', createField('c')) // [a, b, c]
  assert.deepEqual(reparent(r, 'a', 'r', 2).children.map((c) => c.id), ['b', 'c', 'a'])
  assert.deepEqual(reparent(r, 'b', 'r', 0).children.map((c) => c.id), ['b', 'a', 'c'])
  assert.equal(reparent(r, 'a', 'r', 0), r) // schon an Position 0 -> selbe Referenz
})
