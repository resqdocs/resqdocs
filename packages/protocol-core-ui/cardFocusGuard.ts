// Waechter fuer die Bearbeiten-Karten der Bibliotheken (Bloecke, Snippets).
//
// Die Karten schliessen sich, sobald der Fokus sie verlaesst (@focusout).
//
// PRAEZISIERUNG (am Geraet belegt, 2026-07-28): frueher stand hier, ein Button-Tap loese im WebView
// kein focusout aus. Das gilt NICHT allgemein - stand der Fokus vorher in einem Textfeld der Karte,
// wird sehr wohl geblurrt. Genau darauf hatte sich die Mechanik verlassen.
//
// Gefaehrlich wird es, sobald in der Karte etwas steckt, das den Fokus regulaer nach draussen gibt -
// ein natives <select>, ein Modal, eine Rueckfrage. Dann reisst das Schliessen den gerade benutzten
// Zustand mit weg. Genau so ging das Teilen-Panel verloren: TTL im <select> waehlen -> focusout ->
// closeEdit -> shareOpenId auf null -> Panel samt Link, QR und Fehlermeldung verschwunden, bevor
// ueberhaupt etwas erscheinen konnte. Mit dem Default „1x lesen" faellt es nicht auf, weil man das
// select dann nie anfassen muss.
//
// Als reine Funktion herausgezogen, weil die Komponenten selbst nicht testbar sind (kein DOM-Setup
// im Projekt): so ist die Regel per node:test festgenagelt.

export interface CardFocusState {
  /** Eine Loesch-Rueckfrage steht offen. */
  pendingDelete?: boolean
  /** Das Teilen-Panel (Link/QR mit Gueltigkeits-Auswahl) ist aufgeklappt. */
  shareOpen?: boolean
  /** Ein Gross-Modal (z. B. mehrzeiliger Text) ist offen. */
  expandOpen?: boolean
  /** Gerade wurde INNERHALB der Karte getippt (siehe tapIsPending). */
  tapPending?: boolean
  /** Bleibt der Fokus innerhalb der Karte? (card.contains(relatedTarget)) */
  focusStaysInside: boolean
}

/** Zeitfenster, in dem ein focusout noch dem vorangegangenen Tippen zugerechnet wird. */
export const TAP_WINDOW_MS = 400

/**
 * Gehoert dieses focusout zu einem Tippen INNERHALB der Karte?
 *
 * Der Kern des Fehlers ist eine REIHENFOLGE, keine Logik: der Fokuswechsel ist die Standardaktion von
 * mousedown, der Klick kommt erst danach. Eine Flagge, die ein @click-Handler setzt (Teilen-Panel
 * oeffnen, Gross-Textfeld oeffnen), erreicht den focusout DESSELBEN Taps also nie - sie kommt immer zu
 * spaet. Deshalb merkt sich die Karte den Zeitpunkt des letzten Zeigerkontakts auf sich selbst
 * (pointerdown/mousedown, beide liegen vor dem Fokuswechsel) und behandelt ein focusout in diesem
 * Fenster als "durch dieses Tippen verursacht": nicht schliessen, der Klick-Handler entscheidet.
 *
 * Zeitgestempelt statt als Flagge, damit nichts haengen bleibt, wenn der Klick nie kommt (Scroll,
 * pointercancel) - das Fenster heilt sich selbst.
 */
export function tapIsPending(lastTapAt: number, now: number, windowMs = TAP_WINDOW_MS): boolean {
  if (lastTapAt <= 0) return false
  const dt = now - lastTapAt
  return dt >= 0 && dt < windowMs
}

/**
 * Darf die Bearbeiten-Karte auf dieses focusout hin schliessen?
 *
 * Nein, solange ein Element der Karte den Fokus regulaer nach draussen geben kann oder darf - sonst
 * zerstoert das Schliessen den Zustand, den der Nutzer gerade bedient. Der Nutzer schliesst in diesen
 * Faellen bewusst ueber „Fertig" oder Esc.
 *
 * WICHTIG fuer die Datensicherheit: ein unterdruecktes focusout bedeutet auch ein ausgefallenes
 * Speichern. Der Aufrufer MUSS deshalb im Sperrzweig trotzdem committen - Schliessen und Speichern
 * sind hier zwei Dinge. openEdit/addAndEdit allein reichen NICHT: sie decken nur den Wechsel auf eine
 * andere Karte ab, nicht Hintergrund, Kill oder schlichtes Liegenlassen.
 */
export function shouldCloseCard(s: CardFocusState): boolean {
  if (s.pendingDelete || s.shareOpen || s.expandOpen || s.tapPending) return false
  return !s.focusStaysInside
}
