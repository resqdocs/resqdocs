// pznLibrarySave.ts — einen Eintrag aus dem Medikationsplan in die eigene PZN-Bibliothek schreiben: neu aufnehmen
// oder, wenn die PZN schon dort steht, Name und Stärke auf den eingetragenen Stand bringen. Immer genau EINE PZN je
// bewusster Handlung (siehe pznLibrary.ts: kein Sammel-Transfer).
import type { PznEntry } from './pznLibrary.ts'

export interface PznLibraryWriter {
  entry(pzn: string): Promise<PznEntry | null>
  addOne(raw: string, label?: string, staerke?: string): Promise<'invalid' | 'added' | 'exists'>
  setWirkstoff(pzn: string, wirkstoff: string): Promise<void>
  setLabel(pzn: string, label: string): Promise<void>
  setStaerke(pzn: string, staerke: string): Promise<void>
}

/** Name, den die App zu einem Eintrag zeigt: Wirkstoff vor Bezeichnung (wie beim Auflösen nach dem Scan). */
export const shownName = (e: Pick<PznEntry, 'wirkstoff' | 'label'>): string => e.wirkstoff || e.label

export type PznSaveResult = 'added' | 'updated' | 'unchanged' | 'invalid'

/**
 * Bekannte PZN: Der Name ersetzt das Feld, aus dem er heute angezeigt wird (Wirkstoff, sonst Bezeichnung); eine
 * eingetragene Stärke ersetzt die gespeicherte, eine leere löscht nichts. Unbekannte PZN: neuer Eintrag.
 */
export async function savePznEntry(lib: PznLibraryWriter, pzn: string, name: string, staerke?: string): Promise<PznSaveResult> {
  const n = name.trim()
  const s = (staerke ?? '').trim()
  const e = await lib.entry(pzn)
  if (!e) {
    const r = await lib.addOne(pzn, n, s || undefined)
    return r === 'exists' ? 'unchanged' : r
  }
  let changed = false
  if (n && n !== shownName(e)) {
    if (e.wirkstoff) await lib.setWirkstoff(e.pzn, n)
    else await lib.setLabel(e.pzn, n)
    changed = true
  }
  if (s && s !== e.staerke) {
    await lib.setStaerke(e.pzn, s)
    changed = true
  }
  return changed ? 'updated' : 'unchanged'
}
