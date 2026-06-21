// pznExport.ts — gestreamter PZN-Bibliothek-Export (#197). Seitenweise lesen →
// kompakt inkrementell in einen CompressionStream('gzip') schreiben, statt
// allSorted()+Pretty-JSON+Riesen-Base64 (das hing am Gerät schon bei ~65k).
//
// Erzeugt EXAKT das Format von exportLibrary: {"version":2,"entries":{ "<pzn>": <value>, … }}
// (value = exportValue) → parseImport liest die Ausgabe unverändert (Round-trip).
// Die TEXT-Zusammensetzung (Header/Seiten-Chunk/Footer) ist rein und in node:test
// prüfbar; die CompressionStream-Verdrahtung ist dünn darüber.
import { exportValue, type PznEntry } from './pznLibrary.ts'

export function exportHeader(): string {
  return '{"version":2,"entries":{'
}
export function exportFooter(): string {
  return '}}'
}

/**
 * Serialisiert eine Seite als JSON-Key/Value-Fragment (ohne umschließende Klammern).
 * `isFirst` steuert das führende Komma ÜBER Seitengrenzen hinweg (globales Flag →
 * gültiges JSON, keine Trailing-Commas). Gibt den neuen isFirst-Zustand zurück.
 */
export function exportPageChunk(rows: PznEntry[], isFirst: boolean): { text: string; isFirst: boolean } {
  let text = ''
  let first = isFirst
  for (const e of rows) {
    text += (first ? '' : ',') + JSON.stringify(e.pzn) + ':' + JSON.stringify(exportValue(e))
    first = false
  }
  return { text, isFirst: first }
}

export interface ExportPageSource {
  count(): Promise<number>
  page(opts: { offset: number; limit: number; dir: 'asc' | 'desc' }): Promise<PznEntry[]>
}

const EXPORT_PAGE = 5000

/**
 * Liefert die gesamte Bibliothek als pull-basierten ReadableStream von JSON-Bytes
 * (kompakt, `{"version":2,"entries":{…}}`). PULL-basiert → der Stream liest nur die
 * nächste Seite, wenn der Verbraucher mehr will (echte Backpressure); per
 * `pipeThrough(new CompressionStream('gzip'))` konsumiert, propagieren Fehler/Abbruch
 * automatisch in beide Richtungen (kein dual-task Promise.all, kein Hänger).
 * Hält nie das volle Resultset/den vollen String im Speicher. onProgress meldet
 * verarbeitete Einträge gegen die Gesamtzahl.
 */
export function createExportJsonStream(
  src: ExportPageSource,
  onProgress?: (done: number, total: number) => void,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let total = 0
  let offset = 0
  let isFirst = true
  let done = 0
  let phase: 'header' | 'pages' | 'footer' | 'closed' = 'header'
  return new ReadableStream<Uint8Array>({
    async start() {
      total = await src.count()
    },
    async pull(controller) {
      if (phase === 'header') {
        controller.enqueue(enc.encode(exportHeader()))
        phase = 'pages'
        return
      }
      if (phase === 'pages') {
        const rows = await src.page({ offset, limit: EXPORT_PAGE, dir: 'asc' })
        offset += EXPORT_PAGE
        if (rows.length > 0) {
          const chunk = exportPageChunk(rows, isFirst)
          isFirst = chunk.isFirst
          controller.enqueue(enc.encode(chunk.text))
          done += rows.length
          onProgress?.(Math.min(done, total), total)
          if (rows.length < EXPORT_PAGE) phase = 'footer'
          return
        }
        phase = 'footer' // leere letzte Seite → direkt zum Footer
      }
      // phase === 'footer'
      controller.enqueue(enc.encode(exportFooter()))
      phase = 'closed'
      controller.close()
    },
  })
}
