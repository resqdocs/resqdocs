// nodeLabel.ts - Anzeigenamen für Vorlagen und Elemente ohne Titel. Gilt für App und Online-Editor.
//
// Ohne Titel steht da, was es ist, nie die interne Kennung: Die leere Start-Vorlage hat die Kennung „protokoll“ und
// hieß deshalb in der Liste „protokoll“, im Einsatz „Vorlage“. Die Kennung selbst bleibt unverändert (sie steckt in
// gespeicherten Daten und Einsatzentwürfen), nur die Anzeige folgt dieser Datei.
import type { Node } from '@resqdocs/protocol-core/model'

/** Anzeigename einer Vorlage ohne Titel. */
export const UNTITLED_TEMPLATE = 'Unbenannte Vorlage'

/** Name einer Vorlage für Listen, Überschriften und Meldungen. */
export function templateLabel(template: { title?: string } | null | undefined): string {
  return template?.title?.trim() || UNTITLED_TEMPLATE
}

/** Name eines Elements für Beschriftungen, Listen und Meldungen. Ohne Titel steht da, was es ist („Feld ohne Titel“,
 *  „Abschnitt ohne Titel“, „Lückentext ohne Titel“, „Funktion ohne Titel“), nicht die interne Kennung. */
export function nodeLabel(node: Node): string {
  const title = node.title?.trim()
  if (title) return title
  return node.type === 'container' ? (node.cloze ? 'Lückentext ohne Titel' : 'Abschnitt ohne Titel') : node.type === 'function' ? 'Funktion ohne Titel' : 'Feld ohne Titel'
}
