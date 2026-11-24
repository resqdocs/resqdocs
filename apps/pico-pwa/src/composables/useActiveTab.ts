// useActiveTab.ts — der gerade sichtbare Tab der App, geteilt (Muster useImportChoice).
//
// App.vue schaltet ihn um. Andere Stellen lesen ihn, wenn ihre Meldung davon abhängt, wo man gerade ist,
// z. B. der Hinweis nach dem Übernehmen eines Imports: Im Tab Vorlagen braucht es kein „Du findest sie in Vorlagen“.
import { ref } from 'vue'

/** Kennungen der Tabs in App.vue. Der Tab Vorlagen heißt intern weiter 'protokolle'. */
export type AppTab = 'einsatz' | 'protokolle' | 'bausteine' | 'einstellungen'

export const activeTab = ref<AppTab>('einsatz')
