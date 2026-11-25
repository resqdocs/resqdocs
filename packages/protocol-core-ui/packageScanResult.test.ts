// Gescannte Packungen im Medikationsplan: jede PZN höchstens einmal, klare Rückmeldung.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasOwnName, libraryOffer, librarySignature, packageScanMessage, planPackageScan, pznKey } from './packageScanResult.ts'

test('PZN-Schlüssel: sieben- und achtstellig meinen dasselbe Medikament', () => {
  assert.equal(pznKey('2223945'), '02223945')
  assert.equal(pznKey('02223945'), '02223945')
  assert.equal(pznKey(' 0222-3945 '), '02223945')
  for (const leer of [null, undefined, '', 'abc', '123', '123456789']) assert.equal(pznKey(leer), null, String(leer))
})

test('eine PZN, die schon in der Liste steht, kommt nicht noch einmal hinein', () => {
  const plan = planPackageScan(['02223945', '01126111'], ['2223945', undefined, null])
  assert.deepEqual(plan, { add: ['01126111'], duplicates: 1, unreadable: 0 })
})

test('dieselbe Packung dreihundert Mal gescannt ergibt einen Eintrag', () => {
  const plan = planPackageScan(Array.from({ length: 300 }, () => '01126111'), [])
  assert.deepEqual(plan, { add: ['01126111'], duplicates: 299, unreadable: 0 })
})

test('Reihenfolge bleibt, Packungen ohne PZN werden gezählt und nie übernommen', () => {
  const plan = planPackageScan(['00000003', null, '00000001', '3', ''], [])
  assert.deepEqual(plan, { add: ['00000003', '00000001'], duplicates: 0, unreadable: 3 })
})

test('Rückmeldung: Einzel-Scan', () => {
  assert.equal(packageScanMessage(planPackageScan(['01126111'], [])), null)
  assert.deepEqual(packageScanMessage(planPackageScan(['01126111'], ['1126111'])), { kind: 'warn', text: 'Dieses Medikament steht schon in der Liste.' })
  assert.deepEqual(packageScanMessage(planPackageScan([null], [])), { kind: 'warn', text: 'Keine PZN auf der Packung erkannt — näher heranführen oder manuell eintippen.' })
  assert.equal(packageScanMessage(planPackageScan([], [])), null)
})

test('Rückmeldung: mehrere Packungen', () => {
  assert.deepEqual(packageScanMessage(planPackageScan(['1', '00000002', '00000003'].map((p) => p.padStart(8, '0')), [])), { kind: 'ok', text: '3 Packungen übernommen.' })
  assert.deepEqual(packageScanMessage(planPackageScan(['00000001', '00000001', null], [])), { kind: 'warn', text: '1 Packung übernommen. 1 stand schon in der Liste. Bei 1 war keine PZN erkennbar.' })
  assert.deepEqual(packageScanMessage(planPackageScan(['00000001', '00000002', '00000001', '00000002', null, null], ['00000002'])), { kind: 'warn', text: '1 Packung übernommen. 3 standen schon in der Liste. Bei 2 war keine PZN erkennbar.' })
  assert.deepEqual(packageScanMessage(planPackageScan(['00000001', '00000001'], ['00000001'])), { kind: 'warn', text: 'Keine neue Packung übernommen. 2 standen schon in der Liste.' })
})

test('eigener Name: erst wenn der PZN-Platzhalter ersetzt ist', () => {
  for (const ja of ['Ramipril', 'Ibuflam 600', ' Metoprolol 95 mg ', 'Pantoprazol (nüchtern)']) assert.equal(hasOwnName(ja), true, ja)
  for (const nein of ['', '   ', null, undefined, 'PZN 01126111', 'pzn 1126111', 'Ramipril (PZN 01126111, community/ungeprüft)', 'PZN01126111']) assert.equal(hasOwnName(nein), false, String(nein))
})

test('Angebot für die PZN-Bibliothek: neu aufnehmen nur mit Namen, ändern nur nach eigener Änderung', () => {
  const eintrag = { name: 'Ibuprofen', staerke: '600 mg' }
  // unbekannte PZN
  assert.equal(libraryOffer({ entry: null, name: 'PZN 01126111', edited: true }), null)
  assert.equal(libraryOffer({ entry: null, name: 'Ramipril', edited: false }), 'add')
  // noch nicht nachgeschlagen
  assert.equal(libraryOffer({ entry: undefined, name: 'Ramipril', edited: true }), null)
  // bekannte PZN: Der Plan nennt sie anders, niemand hat getippt -> nichts
  assert.equal(libraryOffer({ entry: eintrag, name: 'Ibuflam 600 (Ibuprofen 600 mg)', staerke: '600 mg', edited: false }), null)
  // bekannte PZN, selbst geändert
  assert.equal(libraryOffer({ entry: eintrag, name: 'Ibuprofen akut', staerke: '600 mg', edited: true }), 'update')
  assert.equal(libraryOffer({ entry: eintrag, name: 'Ibuprofen', staerke: '400 mg', edited: true }), 'update')
  // getippt, aber am Ende wie in der Bibliothek; leere Stärke löscht dort nichts; Platzhalter nie
  assert.equal(libraryOffer({ entry: eintrag, name: ' Ibuprofen ', staerke: '600 mg', edited: true }), null)
  assert.equal(libraryOffer({ entry: eintrag, name: 'Ibuprofen', staerke: '', edited: true }), null)
  assert.equal(libraryOffer({ entry: eintrag, name: 'PZN 02223945', edited: true }), null)
})

test('Haken nach dem Speichern erlischt, sobald Name oder Stärke wieder geändert werden', () => {
  assert.equal(librarySignature(' Ramipril ', '5 mg'), librarySignature('Ramipril', ' 5 mg'))
  assert.notEqual(librarySignature('Ramipril', '5 mg'), librarySignature('Ramipril', '10 mg'))
  assert.notEqual(librarySignature('Ramipril', ''), librarySignature('Ramipril plus', undefined))
})
