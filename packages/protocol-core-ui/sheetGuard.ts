// Schutz der Eingabe-Fenster der Funktionen: Ein Tipp neben das Fenster schließt es nur, solange nichts
// geändert wurde. Sonst gingen gerade eingetragene Werte durch einen Fehltipp verloren. „Abbrechen“ im
// Fenster schließt weiterhin immer.

/** Merkt den Stand beim Öffnen; die Rückgabe sagt später, ob er noch derselbe ist. */
export function unchangedSince(read: () => unknown): () => boolean {
  // JSON: ein geleertes Zahlenfeld (NaN) zählt wie das leere Feld beim Öffnen (null).
  const start = JSON.stringify(read())
  return () => JSON.stringify(read()) === start
}
