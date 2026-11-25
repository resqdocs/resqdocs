// useImportChoice.ts — empfangene Vorlagen (und in einer Sammlung auch gespeicherte Abschnitte und Textbausteine)
// warten auf die Entscheidung des Nutzers.
//
// JEDER Vorlagen-Import der App (Vorlagen-Tab: Link, QR, Datei, Einfügen, geteilte Datei; Bausteine-Tab) und jede
// Sammlung legt den Inhalt hier ab, statt ihn sofort zu übernehmen. ImportChoiceDialog (App.vue, über allen Tabs)
// fragt je Eintrag: übernehmen?, unter welchem Namen?, bei Namensgleichheit überschreiben oder neu?
import { ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import type { SnippetPayload } from '@resqdocs/protocol-core/snippetIO'
import type { Needs } from '@resqdocs/protocol-core/templateNeeds'

export interface PendingImport {
  trees: Container[]
  blocks: Container[]
  snippets: SnippetPayload[]
  /** Nach dem Übernehmen (z. B. Import-Feld leeren, erste Vorlage im Editor öffnen). */
  onDone?: (added: Container[]) => void
  /** Abgebrochen (z. B. „1× lesen“-Link wieder freigeben). */
  onCancel?: () => void
  /** Kurzer Hinweis über der Auswahl (z. B. Link wurde vorher schon geöffnet). */
  hint?: string
  /** Vermerk der Datei: welche Funktionen die Vorlagen ab welcher App-Version brauchen (Hinweis im Dialog). */
  needs?: Needs
}

/** Zusätze eines Angebots: Abbrechen-Rückruf, Hinweis und Vermerk der Datei. */
export type OfferExtras = Pick<PendingImport, 'onCancel' | 'hint' | 'needs'>

export const pendingImport = ref<PendingImport | null>(null)

/** Ein wartender Import, der durch einen neuen ersetzt wird, gilt als abgebrochen (gibt z. B. einen reservierten
 *  „1× lesen“-Link wieder frei). */
function replacePending(next: PendingImport): void {
  const prev = pendingImport.value
  pendingImport.value = next
  prev?.onCancel?.()
}
export function offerImport(trees: Container[], onDone?: (added: Container[]) => void, extras: OfferExtras = {}): void {
  replacePending({ trees, blocks: [], snippets: [], onDone, ...extras })
}
/** Sammlung: Vorlagen, gespeicherte Abschnitte und Textbausteine gemeinsam zur Auswahl anbieten. */
export function offerCollection(
  c: { trees: Container[]; blocks: Container[]; snippets: SnippetPayload[] },
  onDone?: (added: Container[]) => void,
  extras: OfferExtras = {},
): void {
  replacePending({ trees: c.trees, blocks: c.blocks, snippets: c.snippets, onDone, ...extras })
}
export function clearImport(): void {
  pendingImport.value = null
}
