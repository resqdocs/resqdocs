// Eintrag aus dem Medikationsplan in die eigene PZN-Bibliothek: neu aufnehmen oder den vorhandenen ändern.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savePznEntry, shownName, type PznLibraryWriter } from './pznLibrarySave.ts'
import type { PznEntry } from './pznLibrary.ts'

function bibliothek(start: PznEntry[] = []) {
  const entries = new Map(start.map((e) => [e.pzn, { ...e }]))
  const calls: string[] = []
  const lib: PznLibraryWriter = {
    entry: async (pzn) => entries.get(pzn) ?? null,
    addOne: async (raw, label, staerke) => {
      calls.push(`addOne ${raw}`)
      if (entries.has(raw)) return 'exists'
      entries.set(raw, { pzn: raw, wirkstoff: '', staerke: staerke ?? '', label: label ?? '', category: '', note: '' })
      return 'added'
    },
    setWirkstoff: async (pzn, v) => { calls.push('setWirkstoff'); entries.get(pzn)!.wirkstoff = v },
    setLabel: async (pzn, v) => { calls.push('setLabel'); entries.get(pzn)!.label = v },
    setStaerke: async (pzn, v) => { calls.push('setStaerke'); entries.get(pzn)!.staerke = v },
  }
  return { lib, entries, calls }
}
const eintrag = (over: Partial<PznEntry>): PznEntry => ({ pzn: '02223945', wirkstoff: '', staerke: '', label: '', category: '', note: '', ...over })

test('unbekannte PZN: neuer Eintrag mit Name und Stärke', async () => {
  const b = bibliothek()
  assert.equal(await savePznEntry(b.lib, '01126111', ' Ramipril ', '5 mg'), 'added')
  assert.deepEqual(b.entries.get('01126111'), { pzn: '01126111', wirkstoff: '', staerke: '5 mg', label: 'Ramipril', category: '', note: '' })
  assert.deepEqual(b.calls, ['addOne 01126111'], 'genau eine PZN')
})

test('bekannte PZN: der Name ersetzt das Feld, aus dem er angezeigt wird', async () => {
  const mitWirkstoff = bibliothek([eintrag({ wirkstoff: 'Ibuprofen', label: 'Ibuflam', staerke: '600 mg' })])
  assert.equal(await savePznEntry(mitWirkstoff.lib, '02223945', 'Ibuprofen akut', '600 mg'), 'updated')
  assert.deepEqual(mitWirkstoff.calls, ['setWirkstoff'])
  assert.equal(mitWirkstoff.entries.get('02223945')!.label, 'Ibuflam', 'die Bezeichnung bleibt')
  assert.equal(shownName(mitWirkstoff.entries.get('02223945')!), 'Ibuprofen akut')

  const nurBezeichnung = bibliothek([eintrag({ label: 'Ibuflam 600' })])
  assert.equal(await savePznEntry(nurBezeichnung.lib, '02223945', 'Ibuprofen', ''), 'updated')
  assert.deepEqual(nurBezeichnung.calls, ['setLabel'])
})

test('bekannte PZN: eine eingetragene Stärke ersetzt die gespeicherte, eine leere löscht nichts', async () => {
  const b = bibliothek([eintrag({ wirkstoff: 'Ibuprofen', staerke: '600 mg' })])
  assert.equal(await savePznEntry(b.lib, '02223945', 'Ibuprofen', '400 mg'), 'updated')
  assert.deepEqual(b.calls, ['setStaerke'])
  assert.equal(await savePznEntry(b.lib, '02223945', 'Ibuprofen', ''), 'unchanged')
  assert.equal(b.entries.get('02223945')!.staerke, '400 mg')
})

test('nichts geändert: kein Schreibzugriff', async () => {
  const b = bibliothek([eintrag({ wirkstoff: 'Ibuprofen', staerke: '600 mg' })])
  assert.equal(await savePznEntry(b.lib, '02223945', ' Ibuprofen ', '600 mg'), 'unchanged')
  assert.deepEqual(b.calls, [])
})
