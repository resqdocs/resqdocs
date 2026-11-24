// bridgeIndicator.ts — wann das Bridge-Symbol der Kopfzeile als Lade-Kreis dreht (reine Regel, ohne Vue testbar).
//
// Ein Lade-Kreis heißt „hier wartet jemand“. Die App prüft die Verbindung aber von selbst alle paar Sekunden;
// drehte der Kreis dabei jedes Mal mit, sähe die Kopfzeile dauernd beschäftigt aus. Er dreht deshalb nur,
//   - solange eine ausdrücklich angeforderte Prüfung läuft (Tipp auf das Symbol, Verbinden, nach einem Sendefehler),
//   - solange die Bridge tippt.
// Der Zustand selbst (verbunden oder nicht, also die Farbe und das Symbol) wird von jeder Prüfung nachgeführt,
// auch von der stillen.

export interface IndicatorState {
  /** Eine ausdrücklich angeforderte Prüfung läuft. */
  requested: boolean
  /** Die Bridge tippt gerade (Fortschrittsanzeige in der Phase „tippt“). */
  typing: boolean
}

/** Dreht der Kreis? */
export function indicatorBusy(s: IndicatorState): boolean {
  return s.requested || s.typing
}

/** Vorlesetext des Symbols. „Wird geprüft“ nur bei einer angeforderten Prüfung, sonst der Zustand. */
export function indicatorLabel(s: { requested: boolean; reachable: boolean | null }): string {
  if (s.requested) return 'Bridge-Verbindung wird geprüft'
  return s.reachable === true ? 'Bridge verbunden — tippen zum Prüfen' : 'keine Bridge — tippen zum Prüfen'
}

/** Kurztext am Desktop (title). */
export function indicatorTitle(s: { requested: boolean; reachable: boolean | null }): string {
  if (s.requested) return 'Prüfung läuft …'
  return s.reachable === true ? 'Bridge verbunden' : 'keine Bridge'
}
