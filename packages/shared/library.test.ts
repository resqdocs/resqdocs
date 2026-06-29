import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collidesId, reId, duplicateProtocol, renameProtocol, removeProtocol, moveProtocol, resolveInitialProtocolId, protocolExists, importProtocol, overwriteProtocol } from './library.ts'
import { createContainer, createField, createFunction, addChild } from './creator.ts'
import type { Container, Node } from './model.ts'

// deterministischer ID-Generator fuer die Tests
function idGen(start = 0): () => string {
  let c = start
  return () => `g${++c}`
}

const sample = (): Container => {
  let root: Container = createContainer('p1')
  root = addChild(root, 'p1', createField('a')) as Container
  root = addChild(root, 'p1', createContainer('sub')) as Container
  root = addChild(root, 'sub', createField('b')) as Container
  return root
}

const collectIds = (n: Node, acc: string[] = []): string[] => {
  acc.push(n.id)
  if (n.type === 'container') n.children.forEach((c) => collectIds(c, acc))
  return acc
}

test('collidesId: findet IDs ueber mehrere Baeume', () => {
  const ps = [sample(), { ...createContainer('p2'), title: 'X' }]
  assert.equal(collidesId(ps, 'a'), true)
  assert.equal(collidesId(ps, 'sub'), true)
  assert.equal(collidesId(ps, 'p2'), true)
  assert.equal(collidesId(ps, 'zzz'), false)
})

test('reId: komplett frische IDs, keine Ueberlappung mit dem Original (Struktur bleibt)', () => {
  const t = sample()
  const copy = reId(t, idGen()) as Container
  const orig = new Set(collectIds(t))
  const dup = collectIds(copy)
  assert.equal(dup.length, orig.size) // gleiche Knotenzahl
  assert.ok(dup.every((id) => !orig.has(id))) // keine geteilte ID
})

test('duplicateProtocol: haengt Kopie mit frischen IDs + „(Kopie)" an', () => {
  const ps: Container[] = [{ ...sample(), title: 'Standard' }]
  const { protocols, copy } = duplicateProtocol(ps, 'p1', idGen())
  assert.equal(protocols.length, 2)
  assert.ok(copy)
  assert.equal(copy?.title, 'Standard (Kopie)')
  assert.notEqual(copy?.id, 'p1')
  assert.equal(collidesId([ps[0]], copy!.id), false) // keine ID-Ueberlappung mit dem Original
})

test('duplicateProtocol: unbekannte id -> unveraendert', () => {
  const ps = [sample()]
  const { protocols, copy } = duplicateProtocol(ps, 'nope', idGen())
  assert.equal(protocols.length, 1)
  assert.equal(copy, null)
})

test('renameProtocol: setzt den Titel der richtigen Vorlage', () => {
  const ps: Container[] = [
    { ...createContainer('p1'), title: 'A' },
    { ...createContainer('p2'), title: 'B' },
  ]
  const out = renameProtocol(ps, 'p2', 'Neu')
  assert.equal(out.find((p) => p.id === 'p2')?.title, 'Neu')
  assert.equal(out.find((p) => p.id === 'p1')?.title, 'A')
})

test('removeProtocol: entfernt, aber nie die letzte', () => {
  const ps = [createContainer('p1'), createContainer('p2')]
  assert.equal(removeProtocol(ps, 'p1').length, 1)
  assert.equal(removeProtocol([createContainer('p1')], 'p1').length, 1) // letzte bleibt
})

test('resolveInitialProtocolId: Vorrang Standard -> zuletzt -> erste, nur gueltige id', () => {
  const ids = ['a', 'b', 'c']
  assert.equal(resolveInitialProtocolId(ids, 'b', 'c'), 'b') // Standard gewinnt
  assert.equal(resolveInitialProtocolId(ids, null, 'c'), 'c') // sonst zuletzt
  assert.equal(resolveInitialProtocolId(ids, 'weg', 'c'), 'c') // ungueltiger Standard -> zuletzt
  assert.equal(resolveInitialProtocolId(ids, 'weg', 'auch-weg'), 'a') // sonst erste
  assert.equal(resolveInitialProtocolId(ids, null, null), 'a')
  assert.equal(resolveInitialProtocolId([], 'a', 'b'), null) // leere Bibliothek
})

test('importProtocol: ohne Kollision behaelt ids; bei Kollision frische ids', () => {
  const a = createContainer('a')
  const r1 = importProtocol([a], createContainer('b'), idGen())
  assert.equal(r1.protocols.length, 2)
  assert.equal(r1.added.id, 'b') // keine Kollision -> id behalten
  const r2 = importProtocol([a], createContainer('a'), idGen()) // gleiche Kennung
  assert.notEqual(r2.added.id, 'a') // frische id
  assert.equal(collidesId([a], r2.added.id), false)
})

test('importProtocol retitle: haengt „ (Import)" an + frische id', () => {
  const a = { ...createContainer('a'), title: 'Standard' }
  const { added } = importProtocol([a], { ...createContainer('a'), title: 'Standard' }, idGen(), true)
  assert.equal(added.title, 'Standard (Import)')
  assert.notEqual(added.id, 'a')
})

test('overwriteProtocol: ersetzt die Vorlage mit gleicher id', () => {
  const a = { ...createContainer('a'), title: 'Alt' }
  const { protocols } = overwriteProtocol([a, createContainer('c')], { ...createContainer('a'), title: 'Neu' })
  assert.equal(protocols.length, 2)
  assert.equal(protocols.find((p) => p.id === 'a')?.title, 'Neu')
})

test('protocolExists: erkennt Kennungs-Kollision', () => {
  const ps = [createContainer('a'), createContainer('b')]
  assert.equal(protocolExists(ps, 'b'), true)
  assert.equal(protocolExists(ps, 'zzz'), false)
})

test('duplicateProtocol/reId: Funktions-Knoten bleibt erhalten (functionKind, frische ids)', () => {
  let p = createContainer('p1')
  p = addChild(p, 'p1', createFunction('mp'))
  const { copy } = duplicateProtocol([p], 'p1', idGen())
  const fn = copy!.children.find((c: Node) => c.type === 'function')
  assert.equal(fn?.type, 'function')
  assert.equal((fn as { functionKind?: string }).functionKind, 'medikamentenplan')
  assert.notEqual(fn?.id, 'mp') // frische id
})

test('moveProtocol: verschiebt + clamped an den Raendern, no-op bei unbekannt', () => {
  const ps = [createContainer('a'), createContainer('b'), createContainer('c')]
  assert.deepEqual(moveProtocol(ps, 'b', -1).map((p) => p.id), ['b', 'a', 'c'])
  assert.deepEqual(moveProtocol(ps, 'b', 1).map((p) => p.id), ['a', 'c', 'b'])
  assert.deepEqual(moveProtocol(ps, 'a', -1).map((p) => p.id), ['a', 'b', 'c']) // clamp oben
  assert.deepEqual(moveProtocol(ps, 'c', 1).map((p) => p.id), ['a', 'b', 'c']) // clamp unten
  assert.deepEqual(moveProtocol(ps, 'zzz', 1).map((p) => p.id), ['a', 'b', 'c']) // unbekannt
})
