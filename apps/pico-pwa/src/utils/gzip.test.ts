// Läuft mit:  node --test --experimental-strip-types
//
// Robustes Entpacken des PZN-Imports (#218): decodeMaybeGzip muss rohes JSON,
// einfach-gzip UND doppelt-gzip (iOS-/HTTP-Transport re-gzippt die schon gezippte
// Download-Datei) korrekt zu JSON-Text auflösen, dabei aber zu viele Schichten und
// korrupte/fremde Dateien sauber als ungültig (null) abweisen — OHNE zu werfen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeMaybeGzip, bytesToBase64, bytesToBase64Async } from './gzip.ts'

const JSON_TEXT = '{"version":2,"entries":{"00012345":"Aspirin","00524306":{"wirkstoff":"Ibuprofen","label":"Ibu 400","category":"","note":""}}}'

/** gzippt beliebige Bytes/Text (für mehrschichtige Fixtures) — wie der Export-Pfad. */
async function gzipBytes(input: Uint8Array | string): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

test('decodeMaybeGzip: rohes JSON (kein gzip) → unverändert durchgereicht', async () => {
  const raw = new TextEncoder().encode(JSON_TEXT)
  const out = await decodeMaybeGzip(raw)
  assert.equal(out, JSON_TEXT)
  assert.doesNotThrow(() => JSON.parse(out!))
})

test('decodeMaybeGzip: einfach-gzip (App-Export, Fall 2) → JSON-Text', async () => {
  const single = await gzipBytes(JSON_TEXT)
  const out = await decodeMaybeGzip(single)
  assert.equal(out, JSON_TEXT)
})

test('decodeMaybeGzip: DOPPELT-gzip (Kern-Regression #218) → muss jetzt gelingen', async () => {
  const single = await gzipBytes(JSON_TEXT)
  const double = await gzipBytes(single) // gzip ÜBER der schon gzippten Datei
  const out = await decodeMaybeGzip(double)
  assert.equal(out, JSON_TEXT, 'doppelt-gzip wird über die Byte-Schleife korrekt entpackt')
})

test('decodeMaybeGzip: dreifach-gzip akzeptiert (MAX=3, Reserve), 4× abgelehnt (null)', async () => {
  const single = await gzipBytes(JSON_TEXT)
  const double = await gzipBytes(single)
  const triple = await gzipBytes(double)
  assert.equal(await decodeMaybeGzip(triple), JSON_TEXT, 'genau 3 Schichten werden noch entpackt')
  const quad = await gzipBytes(triple)
  assert.equal(await decodeMaybeGzip(quad), null, 'nach MAX_GZIP_LAYERS noch gzip → ungültig')
})

test('decodeMaybeGzip: korruptes/abgeschnittenes gzip (1f 8b + Müll) → null OHNE Throw', async () => {
  // Gültiger 10-Byte-gzip-Header (08=deflate), danach ungültige Deflate-Daten → Inflater wirft.
  const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x99, 0x99, 0x99, 0x99, 0x99])
  let out: string | null = 'unset'
  await assert.doesNotReject(async () => { out = await decodeMaybeGzip(corrupt) })
  assert.equal(out, null)
})

test('decodeMaybeGzip: leere Datei → "" (kein Throw); JSON.parse weist sie als ungültig ab', async () => {
  const out = await decodeMaybeGzip(new Uint8Array(0))
  assert.equal(out, '')
  assert.throws(() => JSON.parse(out!))
})

test('decodeMaybeGzip: Nicht-gzip-Binär (PNG) → kein Throw; JSON.parse weist Mojibake ab', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
  let out: string | null = 'unset'
  await assert.doesNotReject(async () => { out = await decodeMaybeGzip(png) })
  assert.notEqual(out, 'unset') // hat zurückgegeben (nicht geworfen)
  assert.throws(() => JSON.parse(out as unknown as string)) // kein gültiges JSON → ungültig
})

// bytesToBase64Async: nicht-blockierende base64-Kodierung fürs große PZN-Packen. Muss byte-identisch zur
// synchronen Variante sein und Fortschritt melden (sonst wäre die UI-Progress-Bar falsch).
test('bytesToBase64Async == bytesToBase64 (identisches Ergebnis) + Fortschritt', async () => {
  // groß genug, dass der 16-Chunk-Yield (16 * 0x8000 = 512 KB) mehrfach greift und onProgress mit done<total feuert
  const bytes = new Uint8Array(1_500_000)
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff
  const seen: Array<{ done: number; total: number }> = []
  const b64 = await bytesToBase64Async(bytes, (done, total) => seen.push({ done, total }))
  assert.equal(b64, bytesToBase64(bytes), 'async-base64 muss byte-identisch zur sync-Variante sein')
  assert.ok(seen.length >= 2, 'onProgress muss mehrfach feuern')
  assert.ok(
    seen.some((p) => p.done < p.total),
    'mindestens ein Zwischenstand (done<total)',
  )
  const last = seen[seen.length - 1]
  assert.equal(last.done, last.total, 'letzter Fortschritt ist 100 %')
})

test('bytesToBase64Async: leere und kleine Eingabe korrekt', async () => {
  assert.equal(await bytesToBase64Async(new Uint8Array(0)), '')
  const small = new Uint8Array([1, 2, 3, 4, 5])
  assert.equal(await bytesToBase64Async(small), bytesToBase64(small))
})
