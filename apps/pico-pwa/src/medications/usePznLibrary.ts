// usePznLibrary.ts — Singleton der nutzergepflegten PZN-Bibliothek (#194/#195).
//
// Async, backend-gewählt: nativ → SQLite (skaliert auf ~317k), Web → Preferences-Blob.
// list/page/search/entry/count laufen seitenweise (kein 317k im Speicher/DOM). Die
// fachliche Logik (Sanitizing, feste Kategorien, Konflikt-/Merge-Regeln) bleibt in der
// geteilten reinen pznLibrary.ts — höhere Operationen (addOne/upsert) wenden sie über
// Ein-Eintrag-Mini-Libraries an, damit Verhalten auf beiden Backends identisch ist.
import { Capacitor } from '@capacitor/core'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import {
  addOne as addOnePure,
  emptyLibrary,
  exportLibrary,
  fromEntries,
  listSorted,
  normalizePzn,
  parseImport,
  upsertEntry as upsertEntryPure,
  type ImportMode,
  type PznEntry,
  type PznLibrary,
} from './pznLibrary'
import {
  createPreferencesPznBackend,
  type PznLibraryBackend,
  type PznPageOpts,
} from './pznLibraryBackend'
import { createExportJsonStream } from './pznExport'
import { streamGzipToCacheFileAndShare } from '@/utils/fileTransfer'

function create() {
  let readyPromise: Promise<PznLibraryBackend> | null = null

  function ready(): Promise<PznLibraryBackend> {
    if (!readyPromise) {
      readyPromise = (async () => {
        const backend = Capacitor.isNativePlatform()
          ? (await import('./pznLibraryNativeBackend')).createNativePznBackend(preferencesAdapter)
          : createPreferencesPznBackend(preferencesAdapter)
        await backend.ensureReady()
        return backend
      })()
    }
    return readyPromise
  }

  /** Mini-Bibliothek mit genau diesem Eintrag (oder leer) — Träger für die reine Logik. */
  function miniLib(pzn: string, cur: PznEntry | null): PznLibrary {
    return cur
      ? { version: 2, entries: { [pzn]: { wirkstoff: cur.wirkstoff, staerke: cur.staerke, label: cur.label, category: cur.category, note: cur.note } } }
      : emptyLibrary()
  }

  async function ensureReady(): Promise<void> {
    await ready()
  }

  async function count(): Promise<number> {
    return (await ready()).count()
  }
  async function countMissingStaerke(): Promise<number> {
    return (await ready()).countMissingStaerke()
  }
  async function page(opts: PznPageOpts): Promise<PznEntry[]> {
    return (await ready()).page(opts)
  }
  async function search(query: string, opts: { offset: number; limit: number; missingStaerke?: boolean }): Promise<PznEntry[]> {
    return (await ready()).search(query, opts)
  }
  async function entry(pzn: string): Promise<PznEntry | null> {
    return (await ready()).getEntry(pzn)
  }
  /**
   * Einzel-Transfer aus dem Protokoll (genau EINE PZN): Konfliktregel „vorhandenes
   * nicht-leeres Label gewinnt" über die reine addOne-Logik. 'invalid'/'added'/'exists'.
   */
  async function addOne(raw: string, label?: string, staerke?: string): Promise<'invalid' | 'added' | 'exists'> {
    const norm = normalizePzn(raw)
    if (!norm) return 'invalid'
    const b = await ready()
    const cur = await b.getEntry(norm)
    const next = addOnePure(miniLib(norm, cur), norm, label, staerke)
    await b.setEntry(norm, next.entries[norm])
    return cur ? 'exists' : 'added'
  }

  /**
   * Erfassen/Aktualisieren aus der Verwaltung (bewusste Eingabe überschreibt die
   * angegebenen Felder, lässt unangegebene unverändert). 'invalid'/'added'/'updated'.
   */
  async function upsert(
    raw: string,
    fields: { wirkstoff?: string; staerke?: string; label?: string; category?: string; note?: string },
  ): Promise<'invalid' | 'added' | 'updated'> {
    const norm = normalizePzn(raw)
    if (!norm) return 'invalid'
    const b = await ready()
    const cur = await b.getEntry(norm)
    const next = upsertEntryPure(miniLib(norm, cur), norm, fields)
    await b.setEntry(norm, next.entries[norm])
    return cur ? 'updated' : 'added'
  }

  async function setWirkstoff(pzn: string, wirkstoff: string): Promise<void> {
    await (await ready()).setWirkstoff(pzn, wirkstoff)
  }
  async function setStaerke(pzn: string, staerke: string): Promise<void> {
    await (await ready()).setStaerke(pzn, staerke)
  }
  async function setLabel(pzn: string, label: string): Promise<void> {
    await (await ready()).setLabel(pzn, label)
  }
  async function setCategory(pzn: string, category: string): Promise<void> {
    await (await ready()).setCategory(pzn, category)
  }
  async function setNote(pzn: string, note: string): Promise<void> {
    await (await ready()).setNote(pzn, note)
  }
  async function remove(pzn: string): Promise<void> {
    await (await ready()).remove(pzn)
  }
  async function clear(): Promise<void> {
    await (await ready()).clear()
  }

  /** Backup-Export als JSON-String (kompakte v2-Form, sortiert). NUR Klein-Daten/Tests -
   *  materialisiert die GANZE Bibliothek im Speicher (bei 200k ~33 MB): nie in der UI verdrahten,
   *  der Geraete-Export laeuft gestreamt ueber exportToFile. */
  async function exportJson(): Promise<string> {
    const entries = await (await ready()).allSorted()
    return JSON.stringify(exportLibrary(fromEntries(entries)))
  }

  /**
   * Gestreamter Backup-Export (#197): seitenweise lesen → kompakt inkrementell in
   * einen gzip-Stream → chunkweise in eine Cache-Datei + Share. Hält nie die ganze
   * Bibliothek im Speicher (behebt den Hänger bei großen Datensätzen). onProgress
   * meldet Einträge gegen die Gesamtzahl. Liest nur (page/count) — keine Schreiblogik.
   */
  async function exportToFile(
    filename = 'pzn-bibliothek.json.gz',
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    // pull-basiert → CompressionStream: Backpressure + Fehler-/Abbruch-Propagation
    // übernimmt der Stream selbst (kein dual-task Promise.all, kein Hänger bei I/O-Fehler).
    // Cast umgeht nur die TS-DOM-Reibung der Uint8Array<ArrayBuffer>-Generics (Laufzeit identisch).
    const gz = createExportJsonStream({ count, page: (o) => page(o) }, onProgress)
      .pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    await streamGzipToCacheFileAndShare(filename, gz)
  }
  /**
   * Backup-Import als MERGE (nie Ersetzen der ganzen Bibliothek). `mode` (Nutzerwahl):
   * 'overwrite' = Duplikate überschreiben, 'skip' = nur fehlende ergänzen. false bei ungültig.
   */
  async function importJson(
    text: string,
    mode: ImportMode = 'overwrite',
    onProgress?: (done: number, total: number) => void,
  ): Promise<boolean> {
    let incoming: PznLibrary | null = null
    try {
      incoming = parseImport(JSON.parse(text))
    } catch {
      incoming = null
    }
    if (!incoming) return false
    await (await ready()).bulkPut(listSorted(incoming), mode, undefined, onProgress)
    return true
  }

  return {
    ensureReady,
    count,
    countMissingStaerke,
    page,
    search,
    entry,
    addOne,
    upsert,
    setWirkstoff,
    setStaerke,
    setLabel,
    setCategory,
    setNote,
    remove,
    clear,
    exportJson,
    exportToFile,
    importJson,
  }
}

let shared: ReturnType<typeof create> | null = null
export function usePznLibrary() {
  if (!shared) shared = create()
  return shared
}
