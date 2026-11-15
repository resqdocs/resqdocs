// buttonTextEntry.ts — Einstieg zum Text fuer den Knopf an der Bridge (ein Dialog, mehrere Einstiege).
//
// Kopfleiste und Bridge-Seite oeffnen das leere Textfeld; der Einsatz gibt seinen Protokolltext mit.
// Der mitgegebene Text liegt nur bis zum Oeffnen hier (takeButtonTextRequest raeumt ab) - er wird
// nirgends gespeichert oder geloggt.
import { shallowRef } from 'vue'

export interface ButtonTextRequest {
  /** Text aus dem Einsatz, der ins Textfeld uebernommen wird; fehlt = Textfeld wie gewohnt */
  prefill?: string
}

export const buttonTextRequest = shallowRef<ButtonTextRequest | null>(null)

export function requestButtonText(request: ButtonTextRequest = {}): void {
  buttonTextRequest.value = request
}

/** Wunsch abholen und sofort leeren (der Text soll nicht hier liegen bleiben). */
export function takeButtonTextRequest(): ButtonTextRequest | null {
  const r = buttonTextRequest.value
  buttonTextRequest.value = null
  return r
}
