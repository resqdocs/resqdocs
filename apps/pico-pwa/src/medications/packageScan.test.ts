// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractPznFromPackageCode, packageScanName } from './packageScan.ts'

test('Code 39: fuehrendes "-" + 8-stellige PZN', () => {
  assert.equal(extractPznFromPackageCode('-12345678', 'code39'), '12345678')
})

test('Code 39: reine Ziffern + Padding bei <8 Stellen', () => {
  assert.equal(extractPznFromPackageCode('12345678', 'code39'), '12345678')
  assert.equal(extractPznFromPackageCode('-2953075', 'code39'), '02953075') // 7-stellig -> padStart
  assert.equal(extractPznFromPackageCode('524306', 'code39'), '00524306')
})

test('Data Matrix: PZN aus PPN (9N + Agentur 11); Zusatzdaten werden verworfen', () => {
  // GS1/PPN-aehnlicher Inhalt mit Serien-(21), Charge-(10), Verfall-(17): nur PZN zaehlt.
  const raw = '9N1112345678421721SERIAL99910LOT4217260131'
  assert.equal(extractPznFromPackageCode(raw, 'datamatrix'), '12345678')
})

test('Data Matrix OHNE PPN (nur GTIN) -> keine PZN im MVP (kein GTIN-Mapping)', () => {
  const gtinOnly = '010415012345678321SERIAL17260131'
  assert.equal(extractPznFromPackageCode(gtinOnly, 'datamatrix'), null)
})

test('Ungueltig/keine PZN -> null', () => {
  assert.equal(extractPznFromPackageCode('', 'code39'), null)
  assert.equal(extractPznFromPackageCode('ABCDEF', 'code39'), null)
  assert.equal(extractPznFromPackageCode('123456789', 'code39'), null) // >8 Ziffern
  assert.equal(extractPznFromPackageCode('12', 'code39'), null) // zu kurz
  assert.equal(extractPznFromPackageCode('   ', 'datamatrix'), null)
})

test('packageScanName: Treffer markiert community/ungeprueft, sonst PZN-Platzhalter', () => {
  assert.equal(packageScanName('12345678', 'Aspirin 500'), 'Aspirin 500 (PZN 12345678, community/ungeprüft)')
  assert.equal(packageScanName('12345678', null), 'PZN 12345678')
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Browser-Storage, kein Netz', () => {
  const src = readFileSync(new URL('./packageScan.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})

// Abbildung PZN -> Zeile beim Packungs-Scan (vorher inline im Medikationsplan, jetzt reine Funktion, die die App
// über listCaptureKey einsteckt) - Verhalten muss exakt gleich bleiben.
test('packageScanRow: Wirkstoff vor Bezeichnung, Stärke als eigenes Feld, Platzhalter ohne Bibliothek', async () => {
  const { packageScanRow } = await import('./packageScan.ts')
  let fragen = 0
  const resolve = (): string | null => { fragen++; return 'Ibuprofen' }
  assert.deepEqual(packageScanRow('01234567', { wirkstoff: 'Ibuprofen', label: 'Ibuflam', staerke: '400 mg' }, resolve), { name: 'Ibuprofen', staerke: '400 mg', pzn: '01234567' })
  assert.deepEqual(packageScanRow('01234567', { wirkstoff: '', label: 'Ibuflam 400 mg', staerke: '400 mg' }, resolve), { name: 'Ibuflam 400 mg', staerke: undefined, pzn: '01234567' }, 'Stärke steht schon im Namen')
  assert.equal(fragen, 0, 'mit Bibliotheks-Namen wird nicht nachgeschlagen')
  assert.deepEqual(packageScanRow('01234567', null, () => null), { name: 'PZN 01234567', staerke: undefined, pzn: '01234567' })
  assert.equal(packageScanRow('01234567', { wirkstoff: '', label: '', staerke: '' }, resolve).name, 'Ibuprofen (PZN 01234567, community/ungeprüft)')
})
