// medicationStore.ts - lokaler Cache des PZN→Name-Wörterbuchs (#11).
//
// NUR neutrale Referenzdaten (CC0-Community-Wörterbuch) - keine Patientendaten.
// MVP-Persistenz: EIN JSON-Blob über den KeyValue-Adapter (Preferences).
// Seam: Bei Wachstum (>~20k Eintraege) auf eine SQLite-Tabelle umziehen -
// die Schnittstelle (load/save/clear) bleibt identisch.
import type { KeyValueAdapter } from '../storage/types.ts'

export const MEDICATIONS_KEY = 'medications.dictionary'

export interface MedicationDictionary {
  /** Versionsnummer des Release-Artefakts (medications.vN.json). */
  version: number
  count: number
  /** Stand der Daten (Commit-Datum der Quelle, aus dem Artefakt). */
  updated: string
  /** Wann lokal geladen (gesetzt beim Sync). */
  fetchedAt: string
  /** pzn -> Handelsname. */
  entries: Record<string, string>
}

export async function loadDictionary(kv: KeyValueAdapter): Promise<MedicationDictionary | null> {
  const raw = await kv.get(MEDICATIONS_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as MedicationDictionary
    if (!d || typeof d.version !== 'number' || typeof d.entries !== 'object') return null
    return d
  } catch {
    return null
  }
}

export async function saveDictionary(kv: KeyValueAdapter, d: MedicationDictionary): Promise<void> {
  await kv.set(MEDICATIONS_KEY, JSON.stringify(d))
}

export async function clearDictionary(kv: KeyValueAdapter): Promise<void> {
  await kv.remove(MEDICATIONS_KEY)
}
