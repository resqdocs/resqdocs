import { ref } from 'vue'

/** Kennung des Feldes, dessen Fenster „Optionen bearbeiten“ sich öffnen soll (z. B. vom Knopf auf der Arbeitsfläche
 *  des Online-Editors). Die Einstellungen des Feldes nehmen den Wunsch entgegen und setzen ihn zurück. So gibt es
 *  nur EINEN Weg, Optionen zu bearbeiten: das Fenster mit der Tabelle bzw. der Liste. */
export const optionsEditRequest = ref<string | null>(null)
