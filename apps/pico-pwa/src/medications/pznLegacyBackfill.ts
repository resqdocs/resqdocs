// pznLegacyBackfill.ts — einmaliges Übernehmen der alten PZN-Bibliothek (Preferences-Blob aus Versionen vor
// der SQLite-Tabelle) in die Tabelle. Rein, ohne Capacitor: im Node-Test prüfbar.
//
// Der frühere Wächter war „Tabelle leer“. Bricht die Übernahme MITTEN ab (App beendet, Akku leer),
// ist die Tabelle teilweise gefüllt; beim nächsten Start galt sie als fertig und der Rest kam nie nach.
// Jetzt markiert ein Status die Übernahme: 'running' vor dem Schreiben, 'done' danach. Steht beim Start noch
// 'running', wird mit 'skip' fortgesetzt - schon übernommene oder seither geänderte Einträge bleiben, wie
// sie sind, es kommen nur die fehlenden dazu.
//
// Bestand ohne Status (Installationen, deren Übernahme mit der alten Logik lief): Tabelle leer -> übernehmen;
// Tabelle gefüllt -> als erledigt markieren. Ein erneutes Übernehmen würde dort seither GELÖSCHTE Einträge
// aus dem alten Blob zurückholen.
import type { KeyValueAdapter } from '@resqdocs/protocol-core/adapters'
import { PZN_LIBRARY_KEY } from './pznLibraryRepository.ts'
import { listSorted, parseImport, type ImportMode, type PznEntry } from './pznLibrary.ts'

/** Status der Übernahme in den Preferences: 'running' | 'done'. */
export const PZN_BACKFILL_STATE_KEY = 'pzn.legacyBackfill'

export interface BackfillTarget {
  count(): Promise<number>
  bulkPut(entries: PznEntry[], mode: ImportMode): Promise<void>
}

/** Übernimmt den alten Blob, falls nötig. Wirft bei Schreibfehlern (Status bleibt dann 'running'). */
export async function runLegacyBackfill(repo: BackfillTarget, adapter: KeyValueAdapter): Promise<void> {
  const state = await adapter.get(PZN_BACKFILL_STATE_KEY)
  if (state === 'done') return

  const resume = state === 'running'
  if (!resume && (await repo.count()) > 0) {
    await adapter.set(PZN_BACKFILL_STATE_KEY, 'done')
    return
  }

  const raw = await adapter.get(PZN_LIBRARY_KEY)
  let incoming = null
  if (raw) {
    try {
      incoming = parseImport(JSON.parse(raw))
    } catch {
      incoming = null
    }
  }
  if (incoming) {
    await adapter.set(PZN_BACKFILL_STATE_KEY, 'running')
    await repo.bulkPut(listSorted(incoming), resume ? 'skip' : 'overwrite')
  }
  await adapter.set(PZN_BACKFILL_STATE_KEY, 'done')
}
