// Übernahme der alten PZN-Bibliothek in die Tabelle - auch nach einem Abbruch mittendrin vollständig.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { KeyValueAdapter } from '@resqdocs/protocol-core/adapters'
import { runLegacyBackfill, PZN_BACKFILL_STATE_KEY, type BackfillTarget } from './pznLegacyBackfill.ts'
import { PZN_LIBRARY_KEY } from './pznLibraryRepository.ts'
import { addPzn, emptyLibrary, exportLibrary, type ImportMode, type PznEntry } from './pznLibrary.ts'

/** Gültige PZN (Prüfziffer nach PZN-8) aus einer laufenden Nummer. */
function pzn(n: number): string {
  for (let k = n; ; k++) {
    const d = String(k).padStart(7, '0').split('').map(Number)
    const c = d.reduce((s, x, i) => s + x * (i + 1), 0) % 11
    if (c !== 10) return d.join('') + c
  }
}

function kv(init: Record<string, string> = {}): KeyValueAdapter & { data: Map<string, string> } {
  const data = new Map(Object.entries(init))
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v), remove: async (k) => void data.delete(k) }
}

/** Tabelle als Map; failAfter simuliert einen Abbruch nach n geschriebenen Einträgen. */
function table(failAfter = Infinity, rows = new Map<string, PznEntry>()): BackfillTarget & { rows: Map<string, PznEntry>; modes: ImportMode[] } {
  const modes: ImportMode[] = []
  let written = 0
  return {
    rows,
    modes,
    count: async () => rows.size,
    async bulkPut(entries, mode) {
      modes.push(mode)
      for (const e of entries) {
        if (written >= failAfter) throw new Error('App beendet')
        if (mode === 'skip' && rows.has(e.pzn)) continue
        rows.set(e.pzn, e)
        written++
      }
    },
  }
}

async function fill(rows: Map<string, PznEntry>, entries: PznEntry[], mode: ImportMode): Promise<void> {
  for (const e of entries) if (!(mode === 'skip' && rows.has(e.pzn))) rows.set(e.pzn, e)
}

function blob(n: number): string {
  let lib = emptyLibrary()
  for (let i = 1; i <= n; i++) lib = addPzn(lib, pzn(i * 13), `Beispiel ${i}`)
  return JSON.stringify(exportLibrary(lib))
}

test('frische Übernahme: alles in die Tabelle, danach erledigt', async () => {
  const a = kv({ [PZN_LIBRARY_KEY]: blob(5) })
  const t = table()
  await runLegacyBackfill(t, a)
  assert.equal(t.rows.size, 5)
  assert.equal(a.data.get(PZN_BACKFILL_STATE_KEY), 'done')
})

test('Abbruch mittendrin: der nächste Start holt den Rest nach und lässt Übernommenes in Ruhe', async () => {
  const a = kv({ [PZN_LIBRARY_KEY]: blob(5) })
  const erst = table(2)
  await assert.rejects(runLegacyBackfill(erst, a))
  assert.equal(erst.rows.size, 2)
  assert.equal(a.data.get(PZN_BACKFILL_STATE_KEY), 'running')
  // Zwischen den Starts geändert: darf nicht vom alten Blob überschrieben werden.
  const [first] = [...erst.rows.keys()]
  erst.rows.set(first, { ...erst.rows.get(first)!, staerke: 'selbst gepflegt' })

  const weiter = table(Infinity, erst.rows) // nächster App-Start, dieselbe Tabelle
  await runLegacyBackfill(weiter, a)
  assert.equal(erst.rows.size, 5, 'Rest fehlt')
  assert.equal(erst.rows.get(first)!.staerke, 'selbst gepflegt')
  assert.deepEqual(weiter.modes, ['skip'])
  assert.equal(a.data.get(PZN_BACKFILL_STATE_KEY), 'done')
})


test('Bestand aus der alten Logik (gefüllt, ohne Status): nichts zurückholen, nur als erledigt markieren', async () => {
  const a = kv({ [PZN_LIBRARY_KEY]: blob(5) })
  const t = table()
  await fill(t.rows, [{ pzn: pzn(999), wirkstoff: '', staerke: '', label: 'eigener Eintrag', category: '', note: '' } as PznEntry], 'overwrite')
  await runLegacyBackfill(t, a)
  assert.equal(t.rows.size, 1, 'seither gelöschte Einträge kämen sonst zurück')
  assert.equal(a.data.get(PZN_BACKFILL_STATE_KEY), 'done')
})

test('erledigt: kein erneutes Lesen des alten Blobs', async () => {
  const a = kv({ [PZN_LIBRARY_KEY]: blob(3), [PZN_BACKFILL_STATE_KEY]: 'done' })
  const t = table()
  await runLegacyBackfill(t, a)
  assert.equal(t.rows.size, 0)
})

test('ohne alten Blob oder mit unlesbarem Blob: erledigt, Tabelle unberührt', async () => {
  for (const init of [{}, { [PZN_LIBRARY_KEY]: '{kaputt' }]) {
    const a = kv(init)
    const t = table()
    await runLegacyBackfill(t, a)
    assert.equal(t.rows.size, 0)
    assert.equal(a.data.get(PZN_BACKFILL_STATE_KEY), 'done')
  }
})
