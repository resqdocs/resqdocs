import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportHeader, exportFooter, exportPageChunk, createExportJsonStream } from './pznExport.ts'
import { exportLibrary, parseImport, fromEntries, listSorted, type PznEntry } from './pznLibrary.ts'

/** Baut die Bibliothek wie der Export-Stream: Header + Seiten-Chunks + Footer. */
function assembleStreamed(entries: PznEntry[], pageSize: number): string {
  let out = exportHeader()
  let isFirst = true
  for (let i = 0; i < entries.length; i += pageSize) {
    const chunk = exportPageChunk(entries.slice(i, i + pageSize), isFirst)
    isFirst = chunk.isFirst
    out += chunk.text
  }
  return out + exportFooter()
}

function sampleLib() {
  // Mischung: reine Bezeichnung (→ String-Wert) und volle Felder (→ Objekt-Wert).
  return fromEntries([
    { pzn: '00000001', wirkstoff: '', label: 'Nur Bezeichnung', category: '', note: '' },
    { pzn: '00000002', wirkstoff: 'Ibuprofen', label: 'Ibu 400', category: 'Analgetikum', note: 'Test' },
    { pzn: '00000003', wirkstoff: '', label: 'Sonderzeichen: "Anführung", \\Backslash, € äöü', category: '', note: '' },
  ] as PznEntry[])
}

test('streamed export erzeugt DASSELBE Format wie exportLibrary (über Seitengrenzen)', () => {
  const lib = sampleLib()
  const entries = listSorted(lib)
  for (const pageSize of [1, 2, 3, 100]) {
    const assembled = assembleStreamed(entries, pageSize)
    const parsed = JSON.parse(assembled) // gültiges JSON (Komma-Handhabung korrekt)
    assert.deepEqual(parsed, exportLibrary(lib), `pageSize=${pageSize}: Format identisch zu exportLibrary`)
  }
})

test('streamed export ist import-kompatibel (Round-trip via parseImport)', () => {
  const lib = sampleLib()
  const assembled = assembleStreamed(listSorted(lib), 2)
  const back = parseImport(JSON.parse(assembled))
  assert.ok(back, 'parseImport liest die gestreamte Ausgabe')
  assert.deepEqual(exportLibrary(back), exportLibrary(lib), 'Round-trip identisch')
})

test('streamed export: leere Bibliothek → gültiges {version:2,entries:{}}', () => {
  const assembled = assembleStreamed([], 5)
  assert.deepEqual(JSON.parse(assembled), { version: 2, entries: {} })
})

test('createExportJsonStream: echter Pipeline-Round-trip (Stream→gzip→gunzip→parseImport), kein Deadlock', async () => {
  const lib = sampleLib()
  const all = listSorted(lib)
  // Quelle mit kleiner Seitengröße erzwingt mehrere pull()-Runden über Seitengrenzen.
  const PAGE = 2
  const src = {
    async count() { return all.length },
    async page({ offset, limit }: { offset: number; limit: number; dir: 'asc' | 'desc' }) {
      return all.slice(offset, offset + limit)
    },
  }
  const seen: Array<{ done: number; total: number }> = []
  const gz = createExportJsonStream(src, (done, total) => seen.push({ done, total }))
    .pipeThrough(new CompressionStream('gzip'))
  const text = await new Response(gz.pipeThrough(new DecompressionStream('gzip'))).text()
  const back = parseImport(JSON.parse(text))
  assert.ok(back, 'gunzip+parse der gestreamten gzip-Ausgabe gelingt')
  assert.deepEqual(exportLibrary(back), exportLibrary(lib), 'End-to-End-Round-trip identisch')
  assert.equal(seen.at(-1)?.done, all.length, 'Fortschritt erreicht 100 %')
})

test('exportPageChunk: globales first-Flag verhindert Trailing/Leading-Commas', () => {
  const rows = listSorted(sampleLib())
  const a = exportPageChunk(rows.slice(0, 1), true)
  assert.ok(!a.text.startsWith(','), 'kein führendes Komma am Anfang')
  const b = exportPageChunk(rows.slice(1, 2), a.isFirst)
  assert.ok(b.text.startsWith(','), 'Folge-Seite beginnt mit Komma')
})
