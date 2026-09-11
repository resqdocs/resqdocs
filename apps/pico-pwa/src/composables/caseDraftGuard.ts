// Darf der laufende Einsatz-Entwurf beim Start verworfen werden?
//
// ANLASS (Nutzermeldung, Datenverlust): "wenn der Fehler auftritt, ist das Protokoll weg".
//
// Der Entwurf des laufenden Einsatzes wird beim Start entweder FORTGESETZT (wenn seine Vorlage noch
// existiert) oder als verwaist GELOESCHT. Das Loeschen ist gewollt und richtig: gehoert der Entwurf zu
// einer geloeschten Vorlage, liegen dort Patientendaten ohne Zugehoerigkeit herum.
//
// Der Fehler lag in der Voraussetzung. Scheitert die Vorlagen-Bibliothek beim Oeffnen, geht
// protocolPersistence bewusst in einen ehrlichen Fehlerzustand: libraryError wird gesetzt, der
// Auto-Save abgeschaltet - aber libraryLoaded wird TROTZDEM auf true gesetzt und vor dem Laden
// zurueckgekehrt. Die Vorlagenliste enthaelt dann nur die Blanko-Saat. Die Zugehoerigkeitspruefung
// schlaegt also zwangslaeufig fehl, und der Entwurf wurde geloescht - obwohl auf der Platte alles
// unversehrt lag und ein spaeterer gesunder Start ihn haette fortsetzen koennen.
//
// Die Unterscheidung, auf die es ankommt:
//   "die Vorlage GIBT es nicht mehr"        -> loeschen ist richtig
//   "die Vorlagen sind gerade nicht LESBAR" -> loeschen ist Datenverlust
// Beides sah im Code identisch aus, weil beides zu einer leeren Liste fuehrt.
//
// Deshalb liegt die Regel hier als reine Funktion und nicht als Bedingung in der Ansicht: sie ist
// eine Datensicherheits-Invariante und soll beim naechsten Umbau nicht still verschwinden.

export interface EntwurfsLage {
  /** Konnte die Vorlagen-Bibliothek geoeffnet werden? Fehlermeldung, sonst null. */
  libraryError: string | null
  /** Die Vorlagen-IDs, die die App aktuell kennt. Im Fehlerfall nur die Blanko-Saat. */
  vorhandeneProtokollIds: readonly string[]
  /** Die Vorlage, zu der der Entwurf gehoert. null/undefined, wenn der Entwurf keine nennt. */
  entwurfProtokollId: string | null | undefined
}

export type Entscheidung = 'fortsetzen' | 'verwerfen' | 'unangetastet-lassen'

/**
 * Was mit dem Entwurf geschehen soll.
 *
 * 'unangetastet-lassen' ist der neue, entscheidende Fall: bei gestoerter Bibliothek wird weder
 * fortgesetzt noch geloescht. Der Entwurf bleibt liegen, bis die Bibliothek wieder lesbar ist.
 */
export function entscheideUeberEntwurf(lage: EntwurfsLage): Entscheidung {
  // Solange nicht feststeht, WELCHE Vorlagen es gibt, darf nichts verworfen werden.
  if (lage.libraryError !== null) return 'unangetastet-lassen'
  if (!lage.entwurfProtokollId) return 'verwerfen'
  return lage.vorhandeneProtokollIds.includes(lage.entwurfProtokollId) ? 'fortsetzen' : 'verwerfen'
}
