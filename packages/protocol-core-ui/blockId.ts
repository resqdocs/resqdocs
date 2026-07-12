// Kollisionsfreie id fuer einen Bibliotheks-Baustein. BEWUSST zufaellig (nicht b<n> aus dem fluechtigen
// In-Memory-Stand): der Zaehler kollidierte, wenn blocks.value beim Speichern noch nicht geladen war
// (Boot-Race / verschluckte reload-Rejection) -> das INSERT OR REPLACE ueberschrieb einen bestehenden
// Baustein (stiller, permanenter Datenverlust; Verify bug-312). Die Baustein-id zaehlt ohnehin nur
// INNERHALB der Bibliothek; beim Einfuegen in eine Vorlage wird der Teilbaum frisch re-IDt -> eine
// Zufalls-id ist voll zulaessig und eliminiert die Kollisionsklasse unabhaengig vom Ladezustand.
export function newBlockId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return `blk-${c.randomUUID()}`
  // Fallback (kein secure context / alte Engine): Zeitstempel + Zufall, praktisch kollisionsfrei.
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
