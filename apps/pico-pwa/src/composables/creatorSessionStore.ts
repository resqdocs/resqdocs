// creatorSessionStore.ts - Auto-Persistenz der Editor-Session (#108).
//
// Sichert den gesamten Arbeitsstand des Protokoll-Editors (alle Vorlagen +
// Auswahl) laufend lokal, damit nichts verloren geht - auch ohne explizites
// "In Bibliothek speichern" und über App-Updates hinweg (Preferences liegt im
// App-Container, den iOS bei Updates erhaelt).
//
// NUR neutrale Vorlagen (keine Einsatz-/Patientendaten - der Creator haelt
// ohnehin keinen caseState). Persistenz als EIN JSON-Blob ueber den
// KeyValue-Adapter (gleiche Schicht wie Settings/PZN).
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import type { CreatorSession } from './creatorSession'

export const CREATOR_SESSION_KEY = 'creator.session'

export async function loadPersistedSession(): Promise<CreatorSession | null> {
  const raw = await preferencesAdapter.get(CREATOR_SESSION_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as CreatorSession
    if (!d || !Array.isArray(d.protocols)) return null
    return d
  } catch {
    return null
  }
}

export async function savePersistedSession(session: CreatorSession): Promise<void> {
  await preferencesAdapter.set(CREATOR_SESSION_KEY, JSON.stringify(session))
}

export async function clearPersistedSession(): Promise<void> {
  await preferencesAdapter.remove(CREATOR_SESSION_KEY)
}
