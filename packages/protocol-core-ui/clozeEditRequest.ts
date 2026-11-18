import { ref } from 'vue'

/** Kennung des Lückentext-Abschnitts, dessen Einrichten-Fenster sich öffnen soll (gerade neu angelegt).
 *  Die Einstellungen des Abschnitts nehmen den Wunsch entgegen und setzen ihn zurück. */
export const clozeEditRequest = ref<string | null>(null)
