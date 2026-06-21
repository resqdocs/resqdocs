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
  filterEntries,
  fromEntries,
  getEntry,
  getLabel,
  importMerge,
  listSorted,
  normalizePzn,
  setCategory,
  setNote,
  sortEntries,
  parseImport,
  removePzn,
  setLabel,
  setWirkstoff,
  upsertEntry,
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

test('importMerge: Merge — nur-lokale Einträge bleiben, fehlende werden ergänzt', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'Lokal' }) // nur lokal
  const incoming = parseImport({ version: 2, entries: { '00524306': 'Neu' } })!
  lib = importMerge(lib, incoming)
  assert.equal(getLabel(lib, '12345678'), 'Lokal') // nur lokal -> bleibt
  assert.equal(getLabel(lib, '00524306'), 'Neu')   // nur im Import -> ergänzt
  assert.equal(count(lib), 2)
})

test('importMerge: bei Konflikt GEWINNT der Import (überschreibt Bezeichnung/Kategorie/Bemerkung); KEINE Löschung', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'Alt', category: 'Analgetikum (Nicht-Opioid)', note: 'alt' })
  lib = upsertEntry(lib, '99999999', { label: 'BleibtLokal' }) // NICHT im Import -> darf nicht gelöscht werden
  const incoming = parseImport({ version: 2, entries: { '12345678': { label: 'Neu', category: 'Antidot', note: 'neu' } } })!
  lib = importMerge(lib, incoming)
  const e = getEntry(lib, '12345678')!
  assert.equal(e.label, 'Neu')        // Import gewinnt
  assert.equal(e.category, 'Antidot') // Import gewinnt
  assert.equal(e.note, 'neu')         // Import gewinnt
  assert.equal(getLabel(lib, '99999999'), 'BleibtLokal') // nur-lokal: erhalten
  assert.equal(count(lib), 2)
})

test("importMerge mode 'skip': Duplikate überspringen, nur fehlende ergänzen", () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'Alt', category: 'Analgetikum (Nicht-Opioid)' })
  const incoming = parseImport({ version: 2, entries: {
    '12345678': { label: 'Neu', category: 'Antidot', note: 'neu' }, // Duplikat
    '00524306': 'Fehlte',                                            // fehlt lokal
  } })!
  lib = importMerge(lib, incoming, 'skip')
  const e = getEntry(lib, '12345678')!
  assert.equal(e.label, 'Alt')          // Duplikat übersprungen -> unverändert
  assert.equal(e.category, 'Analgetikum (Nicht-Opioid)')
  assert.equal(getLabel(lib, '00524306'), 'Fehlte') // fehlender Eintrag ergänzt
  assert.equal(count(lib), 2)
})

// O(n)-Umbau der Massen-Builder (parseImport/fromEntries): Ergebnis identisch zur alten
// withEntry-Schleife — insbesondere die Last-Wins-Auflösung bei kollidierender PZN, die der
// Spread `{...map,[pzn]:v}` lieferte. Sichert ab, dass der Performance-Fix nichts am Inhalt ändert.
test('parseImport: kollidierende normalisierte PZN -> Last-Wins wie beim Spread (O(n)-Umbau)', () => {
  // '1234' (numerischer Key, iteriert ZUERST) und '00001234' normalisieren beide auf '00001234'.
  // Iterationsreihenfolge: '1234' -> dann '00001234'. Letzter (= '00001234' -> 'A') gewinnt.
  const lib = parseImport({ version: 2, entries: { '00001234': 'A', '1234': 'B' } })!
  assert.equal(count(lib), 1)
  assert.equal(getLabel(lib, '00001234'), 'A')
})

test('fromEntries: doppelte normalisierte PZN -> letzter Eintrag gewinnt (O(n)-Umbau, Last-Wins)', () => {
  // Array-Reihenfolge bleibt erhalten: '1234' zuerst, '00001234' danach -> letzter gewinnt.
  const lib = fromEntries([
    { pzn: '1234', wirkstoff: '', label: 'A', category: '', note: '' },
    { pzn: '00001234', wirkstoff: '', label: 'B', category: '', note: '' },
  ])
  assert.equal(count(lib), 1)
  assert.equal(getLabel(lib, '00001234'), 'B')
  // Sanitizing/Reihenfolge unberührt: listSorted bleibt nach PZN sortiert.
  assert.deepEqual(listSorted(lib).map((e) => e.pzn), ['00001234'])
})

test('upsertEntry/getEntry: Bezeichnung + Kategorie + Bemerkung; gezieltes Überschreiben, Felder bleiben', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'Adrenalin', category: 'Vasopressor/Katecholamin', note: 'Reanimation' })
  let e = getEntry(lib, '12345678')!
  assert.equal(e.label, 'Adrenalin')
  assert.equal(e.category, 'Vasopressor/Katecholamin')
  assert.equal(e.note, 'Reanimation')
  lib = upsertEntry(lib, '12345678', { note: 'nur Notiz neu' }) // nur ein Feld
  e = getEntry(lib, '12345678')!
  assert.equal(e.label, 'Adrenalin')                    // unverändert
  assert.equal(e.category, 'Vasopressor/Katecholamin')  // unverändert
  assert.equal(e.note, 'nur Notiz neu')                 // gezielt überschrieben
  assert.equal(getEntry(lib, '00000000'), null)
})

test('Kategorie: nur fixe Admin-Werte; Freitext/unbekannt -> "" (keine)', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'X', category: 'Phantasiegruppe' })
  assert.equal(getEntry(lib, '12345678')!.category, '') // nicht in der Admin-Liste -> verworfen
  lib = setCategory(lib, '12345678', 'Antidot')
  assert.equal(getEntry(lib, '12345678')!.category, 'Antidot')
  lib = setCategory(lib, '12345678', 'quatsch')
  assert.equal(getEntry(lib, '12345678')!.category, '')
})

test('setNote: freier Text, einzeilig gesäubert', () => {
  let lib = addPzn(emptyLibrary(), '12345678', 'X')
  lib = setNote(lib, '12345678', '  mehrzeilig\nzweite zeile  ')
  assert.equal(getEntry(lib, '12345678')!.note, 'mehrzeilig zweite zeile')
})

test('filterEntries: matcht auch Kategorie und Bemerkung', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { label: 'Adrenalin', category: 'Vasopressor/Katecholamin', note: 'Reanimation' })
  lib = upsertEntry(lib, '00524306', { label: 'Aspirin', category: 'Antikoagulans/Thrombozytenhemmer', note: 'ACS' })
  const all = listSorted(lib)
  assert.deepEqual(filterEntries(all, 'vasopressor').map((e) => e.pzn), ['12345678']) // Kategorie
  assert.deepEqual(filterEntries(all, 'acs').map((e) => e.pzn), ['00524306'])          // Bemerkung
})

test('sortEntries: nach Kategorie; ohne Kategorie immer ans Ende', () => {
  let lib = upsertEntry(emptyLibrary(), '00000001', { label: 'B', category: 'Bronchodilatator' })
  lib = upsertEntry(lib, '00000002', { label: 'A', category: 'Analgetikum (Nicht-Opioid)' })
  lib = upsertEntry(lib, '00000003', { label: 'C' }) // ohne Kategorie
  const all = listSorted(lib)
  assert.deepEqual(sortEntries(all, 'category', 'asc').map((e) => e.category || '∅'), ['Analgetikum (Nicht-Opioid)', 'Bronchodilatator', '∅'])
  assert.deepEqual(sortEntries(all, 'category', 'desc').map((e) => e.category || '∅'), ['Bronchodilatator', 'Analgetikum (Nicht-Opioid)', '∅'])
})

test('Migration v1->v2: alter String-Wert wird zu { label, "", "" }', () => {
  const lib = parseImport({ version: 1, entries: { '12345678': 'Altbestand' } })!
  const e = getEntry(lib, '12345678')!
  assert.equal(e.label, 'Altbestand')
  assert.equal(e.category, '')
  assert.equal(e.note, '')
})

test('exportLibrary: kompakt (String) nur bei reiner Bezeichnung, sonst Objekt (inkl. Wirkstoff); version 2', () => {
  let lib = addPzn(emptyLibrary(), '12345678', 'NurName')
  lib = upsertEntry(lib, '00524306', { wirkstoff: 'Naloxon', label: 'Narcanti', category: 'Antidot', note: 'Opioid-Antagonist' })
  const ex = exportLibrary(lib)
  assert.equal(ex.version, 2)
  assert.equal(ex.entries['12345678'], 'NurName') // nur Bezeichnung → kompakt
  assert.deepEqual(ex.entries['00524306'], { wirkstoff: 'Naloxon', label: 'Narcanti', category: 'Antidot', note: 'Opioid-Antagonist' })
})

test('Wirkstoff: setWirkstoff/getEntry, Suche und Sortierung; Export/Import-Roundtrip', () => {
  let lib = upsertEntry(emptyLibrary(), '12345678', { wirkstoff: 'Ibuprofen', label: 'Ibu 600' })
  assert.equal(getEntry(lib, '12345678')!.wirkstoff, 'Ibuprofen')
  lib = setWirkstoff(lib, '12345678', 'Ibuprofen-Lysinat')
  assert.equal(getEntry(lib, '12345678')!.wirkstoff, 'Ibuprofen-Lysinat')
  lib = upsertEntry(lib, '00524306', { wirkstoff: 'Acetylsalicylsäure', label: 'ASS' })
  // Suche matcht den Wirkstoff
  assert.deepEqual(filterEntries(listSorted(lib), 'acetyl').map((e) => e.pzn), ['00524306'])
  // Sortierung nach Wirkstoff
  assert.deepEqual(sortEntries(listSorted(lib), 'wirkstoff', 'asc').map((e) => e.wirkstoff), ['Acetylsalicylsäure', 'Ibuprofen-Lysinat'])
  // Roundtrip behält den Wirkstoff
  const back = parseImport(JSON.parse(JSON.stringify(exportLibrary(lib))))!
  assert.equal(getEntry(back, '12345678')!.wirkstoff, 'Ibuprofen-Lysinat')
})

test('filterEntries: Teilstring auf PZN ODER Bezeichnung, case-insensitiv; leerer Query unverändert', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '12345678', 'Ibuprofen 600')
  lib = addPzn(lib, '00524306', 'Aspirin')
  lib = addPzn(lib, '02953075', 'Ibu Saft')
  const all = listSorted(lib)
  // leerer/Whitespace-Query: identische Liste (gleiche Referenz, keine Kopie)
  assert.equal(filterEntries(all, ''), all)
  assert.equal(filterEntries(all, '   '), all)
  // Bezeichnung, case-insensitiv
  assert.deepEqual(filterEntries(all, 'ibu').map((e) => e.pzn), ['02953075', '12345678'])
  assert.deepEqual(filterEntries(all, 'ASPIRIN').map((e) => e.pzn), ['00524306'])
  // PZN-Teilstring
  assert.deepEqual(filterEntries(all, '5243').map((e) => e.pzn), ['00524306'])
  // kein Treffer
  assert.deepEqual(filterEntries(all, 'xyz'), [])
})

test('sortEntries: nach PZN auf-/absteigend', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '00524306', 'B')
  lib = addPzn(lib, '12345678', 'A')
  lib = addPzn(lib, '02953075', 'C')
  const all = listSorted(lib)
  assert.deepEqual(sortEntries(all, 'pzn', 'asc').map((e) => e.pzn), ['00524306', '02953075', '12345678'])
  assert.deepEqual(sortEntries(all, 'pzn', 'desc').map((e) => e.pzn), ['12345678', '02953075', '00524306'])
})

test('sortEntries: nach Bezeichnung, zahlen-/locale-bewusst; leere Bezeichnungen immer ans Ende', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '00000001', 'Ibu 1000')
  lib = addPzn(lib, '00000002', 'Ibu 100')
  lib = addPzn(lib, '00000003', 'aspirin') // klein -> case-insensitiv vor „Ibu"
  lib = addPzn(lib, '00000004', '') // ohne Bezeichnung
  lib = addPzn(lib, '00000005', '') // ohne Bezeichnung
  const all = listSorted(lib)
  // asc: benannte alphabetisch (numerisch bei Zahlen), leere danach – nach PZN stabil
  assert.deepEqual(
    sortEntries(all, 'label', 'asc').map((e) => e.label || `∅${e.pzn}`),
    ['aspirin', 'Ibu 100', 'Ibu 1000', '∅00000004', '∅00000005'],
  )
  // desc: benannte umgekehrt, leere TROTZDEM am Ende (richtungsunabhängig)
  assert.deepEqual(
    sortEntries(all, 'label', 'desc').map((e) => e.label || `∅${e.pzn}`),
    ['Ibu 1000', 'Ibu 100', 'aspirin', '∅00000004', '∅00000005'],
  )
})

test('sortEntries: gleiche Bezeichnung -> PZN als stabiler Zweitschlüssel; nicht-mutierend', () => {
  let lib = emptyLibrary()
  lib = addPzn(lib, '00000009', 'Gleich')
  lib = addPzn(lib, '00000002', 'Gleich')
  const all = listSorted(lib)
  const before = all.map((e) => e.pzn)
  assert.deepEqual(sortEntries(all, 'label', 'asc').map((e) => e.pzn), ['00000002', '00000009'])
  assert.deepEqual(all.map((e) => e.pzn), before) // Eingabe unverändert (Kopie)
})

test('Normalisierung beim Lookup: 6-/7-stellige Eingabe matcht den 8-stelligen Key', () => {
  // Plan/Etikett lassen führende Nullen weg; der Bestand ist 8-stellig. getEntry/getLabel
  // müssen die Eingabe normalisieren (sonst false negative — Kern des gemeldeten Bugs).
  const lib = upsertEntry(emptyLibrary(), '00524306', { wirkstoff: 'Atorvastatin', label: 'Ator 40' })
  assert.equal(getEntry(lib, '524306')!.wirkstoff, 'Atorvastatin') // 6-stellig → 00524306
  assert.equal(getEntry(lib, '0524306')!.wirkstoff, 'Atorvastatin') // 7-stellig
  assert.equal(getLabel(lib, '524306'), 'Ator 40')
  assert.equal(getEntry(lib, '00524306')!.wirkstoff, 'Atorvastatin') // 8-stellig unverändert
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Netz, kein direkter Web-Storage', () => {
  const src = readFileSync(new URL('./pznLibrary.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})
