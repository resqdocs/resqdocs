import type { Component, InjectionKey, Ref } from 'vue'
import type { FunctionKind } from '@resqdocs/protocol-core/model'

// Optionale Host-Bausteine für den geteilten Baum-Editor. Der Host (App / Online-Editor) kann sie
// bereitstellen; fehlen sie, entfällt die jeweilige Aktion (kein harter Paket→App-Import).

/** Snippet-Auswahl-Komponente (App: SnippetPicker über die Bausteine-Sammlung). Ohne sie zeigt der
 *  Baum-Editor „Snippet einfügen" nicht. Erwartete API: prop `title`, Events `select(text)` + `close`. */
export const snippetPickerKey: InjectionKey<Component | null> = Symbol('rd-snippet-picker')

/** Optional: die aktuell anbietbaren functionKinds. Der Online-Editor gated sie nach der vom Nutzer
 *  gewählten App-Version; fehlt der Provider (Mobile-App = immer die eigene Version), sind ALLE erlaubt. */
export const allowedFunctionKindsKey: InjectionKey<Ref<readonly FunctionKind[]> | null> = Symbol('rd-allowed-function-kinds')
