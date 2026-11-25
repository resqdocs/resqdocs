import type { Component, InjectionKey, Ref } from 'vue'
import type { Container, FunctionKind } from '@resqdocs/protocol-core/model'

// Optionale Host-Bausteine für den geteilten Baum-Editor. Der Host (App / Online-Editor) kann sie
// bereitstellen; fehlen sie, entfällt die jeweilige Aktion (kein harter Paket→App-Import).

/** Snippet-Auswahl-Komponente (App: SnippetPicker über die Bausteine-Sammlung). Ohne sie zeigt der
 *  Baum-Editor „Snippet einfügen" nicht. Erwartete API: prop `title`, Events `select(text)` + `close`. */
export const snippetPickerKey: InjectionKey<Component | null> = Symbol('rd-snippet-picker')

/** Optional: die aktuell anbietbaren functionKinds. Der Online-Editor gated sie nach der vom Nutzer
 *  gewählten App-Version; fehlt der Provider (Mobile-App = immer die eigene Version), sind ALLE erlaubt. */
export const allowedFunctionKindsKey: InjectionKey<Ref<readonly FunctionKind[]> | null> = Symbol('rd-allowed-function-kinds')

// --- Listen-Funktionen (Medikationsplan, Kontakte/Ärzte): was nur die App kann --------------------------------
// Kamera-Scan, die eigene PZN-Bibliothek und die Medikamenten-Suche gibt es nur in der App. Sie steckt sie hier
// ein; ohne Provider (Online-Editor im Browser) entfallen Scan-Knöpfe und Vorschläge, die Erfassung von Hand
// bleibt vollständig.

/** Ein Vorschlag aus der eigenen Medikamenten-Bibliothek (strukturell wie der PZN-Eintrag der App). */
export interface MedicationSuggestion {
  pzn: string
  wirkstoff: string
  label: string
  staerke: string
}

/** Scan im Medikationsplan. */
export interface MedplanScan {
  /** Kamera für Packungen. Im Kamerabild der App schaltet ein Schalter „Mehrere Packungen“ um: aus = eine Packung,
   *  dann schließt die Kamera; ein = sie bleibt offen, bis „Fertig“. Prop `known?: string[]` (PZN, die schon in der
   *  Liste stehen; die Kamera meldet sie im Mehrfach-Modus als schon vorhanden). Events: `decoded(result)` für eine
   *  Packung, `decodedMany(results)` für alle eines Durchgangs, `cancel`. */
  packageScanner: Component
  /** PZN aus dem gelesenen Packungscode, sonst null (synchron: die Meldung erscheint sofort). */
  pznFromPackage(result: unknown): string | null
  /** Zeile zur PZN: aus der eigenen Bibliothek, sonst ein Platzhalter. */
  rowForPzn(pzn: string): Promise<import('@resqdocs/protocol-core/model').MedikamenteRow>
  /** Medikationsplan (BMP) scannen und prüfen: öffnet die Kamera gleich. Events `apply(rows, doctor?)`, `close`. */
  planSheet: Component
  /** Eintrag der eigenen PZN-Bibliothek zu einer PZN (Name und Stärke), `null` wenn sie dort nicht steht. Ohne Angabe
   *  gibt es in der Liste keinen Knopf zum Übernehmen. */
  libraryEntry?(pzn: string): Promise<import('./packageScanResult.ts').LibraryEntryView | null>
  /** Genau EINE PZN in die eigene PZN-Bibliothek schreiben (bewusste Handlung, nie mehrere): neu aufnehmen oder den
   *  vorhandenen Eintrag auf Name und Stärke der Zeile bringen. */
  saveToLibrary?(pzn: string, name: string, staerke?: string): Promise<'added' | 'updated' | 'unchanged' | 'invalid'>
}

export interface ListCapture {
  /** Vorschläge ab 3 Zeichen im Namensfeld des Medikationsplans. */
  suggestMedication?(query: string, limit: number): Promise<MedicationSuggestion[]>
  medplanScan?: MedplanScan
  /** Arzt (und optional Medikamente) aus dem Medikationsplan scannen. Events `apply(doctor, meds?)`, `close`. */
  aerzteScanSheet?: Component
}

export const listCaptureKey: InjectionKey<ListCapture | null> = Symbol('rd-list-capture')

// --- Textbausteine: Quelle für die gemeinsame Auswahl (SnippetPicker) ------------------------------------------
// App: ihre SQLite-Bibliothek (useBausteine). Online-Editor: useSnippetLibrary (IndexedDB). Ohne Quelle zeigt die
// Auswahl eine leere Liste.
export interface SnippetSource {
  snippets: Ref<readonly { id: string; title: string; text: string }[]>
  loaded: Ref<boolean>
  reload(): Promise<void>
  /** Hinweis, wo man Textbausteine anlegt (Standard: der Bausteine-Tab der App). */
  emptyHint?: string
}
export const snippetSourceKey: InjectionKey<SnippetSource | null> = Symbol('rd-snippet-source')

// --- Großes Textfeld: gewählte Schriftgröße -------------------------------------------------------------------
// Die App merkt sich die Stufe je Gerät und steckt sie hier ein. Ohne Provider gilt die Wahl nur, solange das
// Fenster lebt.
export const longTextSizeKey: InjectionKey<Ref<import('./longTextSize.ts').LongTextSize> | null> = Symbol('rd-long-text-size')

/** Die ganze Vorlage, die gerade ausgefüllt wird. Ein Lückentext braucht sie für Lücken, die ihren Wert
 *  von anderer Stelle der Vorlage übernehmen; ohne Angabe finden solche Lücken ihr Ziel nicht. */
export const templateRootKey: InjectionKey<Ref<Container> | null> = Symbol('rd-template-root')

// --- Bildschirmtastatur: Modell des Hosts ----------------------------------------------------------------------
// Die App verkleinert bei offener Tastatur das Layout (@capacitor/keyboard) und steckt hier ein, ob eine Tastatur
// offen ist. Vollbild-Fenster (großes Textfeld, Lückentext) füllen dann einfach die Layout-Höhe und passen sich
// einmal an, wenn die Tastatur auf- oder zugeht. Ohne Provider (Online-Editor im Browser) folgen sie wie bisher dem
// sichtbaren Bereich (window.visualViewport). Siehe fullscreenKeyboard.ts.
export interface KeyboardLayout {
  open: Readonly<Ref<boolean>>
}
export const keyboardLayoutKey: InjectionKey<KeyboardLayout | null> = Symbol('rd-keyboard-layout')
