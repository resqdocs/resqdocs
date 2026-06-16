// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFakeKeyValueAdapter } from '../storage/keyValueAdapter.ts'
import { createPznLibraryRepository, PZN_LIBRARY_KEY } from './pznLibraryRepository.ts'
import { addPzn, emptyLibrary, listSorted } from './pznLibrary.ts'

test('load: leer, wenn nichts gespeichert', async () => {
  const repo = createPznLibraryRepository(createFakeKeyValueAdapter())
  assert.deepEqual(listSorted(await repo.load()), [])
})

test('save -> load Round-Trip (Menge bleibt Menge, sortiert)', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createPznLibraryRepository(adapter)
  let lib = emptyLibrary()
  lib = addPzn(lib, '00000002', 'B'); lib = addPzn(lib, '00000001', 'A')
  await repo.save(lib)
  assert.deepEqual(listSorted(await repo.load()).map((e) => e.pzn), ['00000001', '00000002'])
})

test('eigener Key, getrennt von Einsatzentwurf/Settings/Wörterbuch', () => {
  assert.equal(PZN_LIBRARY_KEY, 'pzn.library')
  assert.notEqual(PZN_LIBRARY_KEY, 'case.draft.temp')
  assert.notEqual(PZN_LIBRARY_KEY, 'app.settings')
  assert.notEqual(PZN_LIBRARY_KEY, 'medications.dictionary')
})

test('unlesbarer/fremder Inhalt -> leere Bibliothek', async () => {
  const adapter = createFakeKeyValueAdapter({ [PZN_LIBRARY_KEY]: '{not valid' })
  const repo = createPznLibraryRepository(adapter)
  assert.deepEqual(listSorted(await repo.load()), [])
})

test('Storage enthält nur version + entries (keine Linkage-Felder)', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createPznLibraryRepository(adapter)
  await repo.save(addPzn(emptyLibrary(), '12345678', 'X'))
  const stored = JSON.parse(adapter.dump()[PZN_LIBRARY_KEY])
  assert.deepEqual(Object.keys(stored).sort(), ['entries', 'version'])
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Netz, kein direkter Web-Storage', () => {
  const src = readFileSync(new URL('./pznLibraryRepository.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})
