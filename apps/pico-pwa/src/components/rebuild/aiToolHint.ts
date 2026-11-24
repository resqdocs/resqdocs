// aiToolHint.ts — wann die App das KI-Tool für die erste Vorlage empfiehlt.
//
// Nur solange es keine Vorlage mit Inhalt gibt. Die App legt beim ersten Start selbst eine leere Vorlage an; sie
// zählt nicht als eigene Vorlage. Sobald eine Vorlage etwas enthält (importiert oder von Hand gebaut), entfällt die
// Empfehlung; werden alle Vorlagen wieder leer oder gelöscht, erscheint sie wieder.
export function ohneEigeneVorlage(protocols: readonly { children: readonly unknown[] }[]): boolean {
  return protocols.every((p) => !p.children.length)
}
