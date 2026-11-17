// useImportChoice.ts — empfangene Vorlagen warten auf die Entscheidung des Nutzers.
//
// JEDER Vorlagen-Import der App (Vorlagen-Tab: Link, QR, Datei, Einfügen, geteilte Datei; Bausteine-Tab) legt die
// Vorlage(n) hier ab, statt sie sofort zu übernehmen. ImportChoiceDialog (App.vue, über allen Tabs) fragt je
// Vorlage: übernehmen?, unter welchem Namen?, bei Namensgleichheit überschreiben oder als neue Vorlage?
import { ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'

export interface PendingImport {
  trees: Container[]
  /** Nach dem Übernehmen (z. B. Import-Feld leeren, erste Vorlage im Editor öffnen). */
  onDone?: (added: Container[]) => void
}

export const pendingImport = ref<PendingImport | null>(null)

export function offerImport(trees: Container[], onDone?: (added: Container[]) => void): void {
  pendingImport.value = { trees, onDone }
}
export function clearImport(): void {
  pendingImport.value = null
}
