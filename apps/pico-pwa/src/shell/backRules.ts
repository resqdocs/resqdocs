// Regeln für „Zurück“ ohne Abhängigkeit von Capacitor oder der Seite (in Node prüfbar). Verwendet von back.ts.
//
// Reihenfolge, wie auf Android gewohnt: erst das oberste Fenster, dann die geöffnete Unterseite des sichtbaren
// Tabs, dann vom Nebentab zurück zum Einsatz, und erst dort übernimmt das System (die App geht in den Hintergrund).

export type BackTab = 'einsatz' | 'protokolle' | 'bausteine' | 'einstellungen'

/** Der Tab, an dem „Zurück“ endet. */
export const HOME_TAB: BackTab = 'einsatz'

export interface BackState {
  /** Oberstes Fenster: 'open' = lässt sich schließen, 'locked' = hat keinen Schließen-Weg (Hinweis beim Start). */
  window: 'open' | 'locked' | null
  /** Der sichtbare Tab zeigt eine Unterseite (z. B. Einstellungen → Bridge). */
  subpage: boolean
  tab: BackTab
}

export type BackStep = 'window' | 'subpage' | 'tab' | 'system'

/** Was ein „Zurück“ in diesem Zustand tut. */
export function nextBackStep(s: BackState): BackStep {
  if (s.window === 'open') return 'window'
  // Ein Fenster, das bestätigt werden muss, schließt „Zurück“ nicht. Darunter wird nichts verstellt: Die App geht
  // in den Hintergrund, das Fenster steht beim Zurückkehren unverändert da.
  if (s.window === 'locked') return 'system'
  if (s.subpage) return 'subpage'
  if (s.tab !== HOME_TAB) return 'tab'
  return 'system'
}

/** Eine Unterseite, die „Zurück“ schließen kann. Gemeldet von der Stelle, die sie zeigt (registerSubpage). */
export interface Subpage {
  tab: BackTab
  isOpen: () => boolean
  close: () => void
}

/** Die zuletzt gemeldete offene Unterseite des sichtbaren Tabs (Unterseiten anderer Tabs sieht man nicht). */
export function openSubpage(subpages: readonly Subpage[], tab: BackTab): Subpage | null {
  for (let i = subpages.length - 1; i >= 0; i--) {
    const s = subpages[i]
    if (s.tab === tab && s.isOpen()) return s
  }
  return null
}
