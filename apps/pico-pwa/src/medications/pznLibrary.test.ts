// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  addManyDecoupled,
  addOne,
  addPzn,
  count,
  emptyLibrary,
  exportLibrary,
  getLabel,
  importMerge,
  listSorted,
  normalizePzn,
  parseImport,
  removePzn,
  setLabel,
} from './pznLibrary.ts'

test('normalizePzn: 4–8 Ziffern -> 8-stellig, sonst null', () => {
  assert.equal(normalizePzn('12345678'), '12345678')
  assert.equal(normalizePzn('-2953075'), '02953075') // 7-stellig + führende Null
  assert.equal(normalizePzn('524306'), '00524306')
  assert.equal(normalizePzn('123'), null) // zu kurz
  assert.equal(normalizePzn('123456789'), null) // >8
  assert.equal(normalizePzn('abc'), null)
})

test('addPzn: Mengen-Semantik (Dedup); vorhandenes Label gewinnt, nur setLabel ändert', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '12345678', 'Aspirin')
  lib = addPzn(lib, '12345678') // erneut, ohne Label -> bestehende Bezeichnung bleibt
  assert.equal(count(lib), 1)
  assert.equal(getLabel(lib, '12345678'), 'Aspirin')
  lib = addPzn(lib, '12345678', 'Aspirin 500') // Konfliktregel: vorhandenes Label GEWINNT
  assert.equal(getLabel(lib, '12345678'), 'Aspirin')
  lib = setLabel(lib, '12345678', 'Aspirin 500') // bewusste Änderung nur über setLabel
  assert.equal(getLabel(lib, '12345678'), 'Aspirin 500')
})

test('addPzn: leeres Label wird durch nicht-leeren Vorschlag gefüllt (nicht-destruktiv)', () => {
  let lib = addPzn(emptyLibrary(), '12345678') // ohne Label -> ""
  assert.equal(getLabel(lib, '12345678'), '')
  lib = addPzn(lib, '12345678', 'Ibu 600') // leeres Label darf gefüllt werden
  assert.equal(getLabel(lib, '12345678'), 'Ibu 600')
})

test('addOne: Einzel-Transfer = genau EIN Eintrag, Dedup, Konfliktregel wie addPzn', () => {
  let lib = emptyLibrary()
  lib = addOne(lib, '12345678', 'Eigen') // erster Transfer (neu)
  lib = addOne(lib, '12345678', 'Fremd') // zweiter Transfer derselben PZN -> Eigen gewinnt
  assert.equal(count(lib), 1)
  assert.equal(getLabel(lib, '12345678'), 'Eigen')
})

test('Negativtest: Einzel-Transfers aus EINEM Plan -> Kombination NICHT rekonstruierbar', () => {
  // Simuliert die Pfeil-Transfers aus dem Protokoll: jede PZN einzeln, bewusst.
  // Plan eines Patienten: [A, B, C]. Es darf danach NICHT ableitbar sein, dass
  // A,B,C zusammen auf einem Plan standen, noch in welcher Reihenfolge.
  let lib = emptyLibrary()
  for (const pzn of ['11111111', '22222222', '33333333']) lib = addOne(lib, pzn)
  const exported = exportLibrary(lib)
  // Ergebnis = reine, sortierte Menge: keine Gruppen-/Reihenfolge-/Zeit-Information.
  assert.deepEqual(Object.keys(exported.entries), ['11111111', '22222222', '33333333'])
  // Eintragswerte sind nur Strings (Labels), nichts verweist auf einen Plan/Fall.
  for (const v of Object.values(exported.entries)) assert.equal(typeof v, 'string')
  // Form trägt ausschließlich version + entries.
  assert.deepEqual(Object.keys(exported).sort(), ['entries', 'version'])
})

test('setLabel/removePzn', () => {
  let lib = addPzn(emptyLibrary(), '00524306', '')
  lib = setLabel(lib, '524306', 'Ibu') // Normalisierung greift auch beim Setzen
  assert.equal(getLabel(lib, '00524306'), 'Ibu')
  lib = removePzn(lib, '00524306')
  assert.equal(count(lib), 0)
})

test('listSorted ist reihenfolge-unabhängig (kein Leak der Einfüge-Reihenfolge)', () => {
  let a = emptyLibrary()
  a = addPzn(a, '00000003'); a = addPzn(a, '00000001'); a = addPzn(a, '00000002')
  let b = emptyLibrary()
  b = addPzn(b, '00000001'); b = addPzn(b, '00000002'); b = addPzn(b, '00000003')
  assert.deepEqual(listSorted(a), listSorted(b))
  assert.deepEqual(listSorted(a).map((e) => e.pzn), ['00000001', '00000002', '00000003'])
})

test('addManyDecoupled: ENTKOPPELT — Kombination/Reihenfolge nicht rekonstruierbar', () => {
  // Zwei "Pläne" importieren; danach ist nicht ableitbar, welche PZN zusammengehörten.
  let lib = emptyLibrary()
  lib = addManyDecoupled(lib, ['11111111', '22222222']) // Plan A
  lib = addManyDecoupled(lib, ['22222222', '33333333']) // Plan B (Überschneidung 22222222)
  // Ergebnis ist eine reine Menge: 3 eindeutige PZN, KEINE Gruppen/Reihenfolge/Zeit.
  assert.deepEqual(listSorted(lib).map((e) => e.pzn), ['11111111', '22222222', '33333333'])
  // Keine Bezeichnung aus dem Plan aufgelöst:
  assert.equal(getLabel(lib, '11111111'), '')
})

test('Datenmodell trägt KEINEN Zeitstempel/Sitzungs-/Quelle-Feld', () => {
  let lib = addPzn(emptyLibrary(), '12345678', 'X')
  const exported = exportLibrary(lib)
  assert.deepEqual(Object.keys(exported).sort(), ['entries', 'version'])
  // Eintragswert ist NUR die Bezeichnung (String), kein Objekt mit ts/source.
  assert.equal(typeof exported.entries['12345678'], 'string')
})

test('Export/Import Round-Trip: Menge bleibt Menge', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '12345678', 'A'); lib = addPzn(lib, '00524306', 'B')
  const json = JSON.stringify(exportLibrary(lib))
  const back = parseImport(JSON.parse(json))
  assert.ok(back)
  assert.deepEqual(listSorted(back!), listSorted(lib))
})

test('parseImport verwirft Fremdstruktur/ungültige PZN', () => {
  assert.equal(parseImport(null), null)
  assert.equal(parseImport({ foo: 1 }), null)
  const lib = parseImport({ version: 1, entries: { '12345678': 'A', 'bad': 'x', '999999999': 'y' } })
  assert.ok(lib)
  assert.deepEqual(listSorted(lib!).map((e) => e.pzn), ['12345678']) // 'bad'/>8 verworfen
})

test('importMerge: Mengen-Vereinigung, vorhandene Bezeichnung bleibt bei leerem Import-Label', () => {
  let lib = addPzn(emptyLibrary(), '12345678', 'Eigen')
  const incoming = parseImport({ version: 1, entries: { '12345678': '', '00524306': 'Neu' } })!
  lib = importMerge(lib, incoming)
  assert.equal(getLabel(lib, '12345678'), 'Eigen') // nicht von '' überschrieben
  assert.equal(getLabel(lib, '00524306'), 'Neu')
})

test('importMerge: Konfliktregel — vorhandenes Label gewinnt auch über nicht-leeres Import-Label', () => {
  let lib = addPzn(emptyLibrary(), '12345678', 'Eigen')
  const incoming = parseImport({ version: 1, entries: { '12345678': 'Fremd' } })!
  lib = importMerge(lib, incoming) // Merge, KEIN Overwrite
  assert.equal(getLabel(lib, '12345678'), 'Eigen') // vorhandenes bleibt erhalten
  assert.equal(count(lib), 1) // keine Linkage, kein Duplikat
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Netz, kein direkter Web-Storage', () => {
  const src = readFileSync(new URL('./pznLibrary.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})
