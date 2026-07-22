// Modell — Rework. Knoten sind eine discriminated union: Container ODER Field.
// Enthaelt nur, was in docs/rework/container.md + der Feld-Definition festgelegt ist.

export type FillMode = 'inclusive' | 'exclusive'

/** Ueberschriften-/Titel-Format: prefix/suffix unabhaengig, Fuellzeichen + Breite (nur Container-
 *  Banner), Bezug inklusive/exklusive. Beim FELD wirken nur prefix/suffix (kein Banner). */
export interface Heading {
  prefix: string
  suffix: string
  fill: string
  width: number
  fillMode: FillMode
}

export interface Container {
  type: 'container'
  id: string
  title?: string
  /** Titel in der AUSGABE zeigen? (Im Editor immer sichtbar.) */
  showTitle?: boolean
  /** Titel inline vor dem Inhalt (kein Fuellzeichen/Breite) statt eigener Zeile. Bei showTitle. */
  titleInline?: boolean
  heading?: Heading
  /** Option: im Einsatz einklappbar. */
  collapsible?: boolean
  /** Option: im Einsatz als „nicht erhoben" (excluded) markierbar -> 2-stufiger Status (✓ / −).
   *  Bei − entfaellt der ganze Container (inkl. Kinder) in der Ausgabe. */
  excludable?: boolean
  /** Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen). */
  inline?: boolean
  /** Kein Feld-Trenner VOR diesem Element (klebt ans vorherige inline-Element). */
  noSeparatorBefore?: boolean
  /** Optische Leerzeile (Absatz) VOR diesem Element - nur wirksam, wenn darueber etwas ausgegeben wird
   *  UND das Element eine eigene Titel-/Banner-Zeile hat (Banner-Knoten; sonst still ohne Wirkung).
   *  Gedacht fuer Banner/Trenner, um Abschnitte sichtbar zu trennen. */
  blankLineBefore?: boolean
  /** Feld-Trenner zwischen inline-Geschwistern: zentral an der Wurzel; vererbt sich nach unten,
   *  ein Container kann ihn fuer seinen Teilbaum ueberschreiben. Fehlt -> DEFAULT_SEPARATOR. */
  separator?: string
  /** Optionaler Ersatztext in der AUSGABE, wenn der Container ANGEZEIGT wird, seine Kinder aber
   *  nichts ausgeben (alle leer/nicht erhoben). Fehlt -> kein Ersatz (leer bleibt leer). */
  emptyText?: string
  children: Node[]
}

export interface Field {
  type: 'field'
  id: string
  title?: string
  /** Titel in der AUSGABE zeigen? (Default aus.) Bei an: prefix+title+suffix vor dem Wert. */
  showTitle?: boolean
  /** Titel-Format. Bei „Titel auf eigener Zeile" (titleInline===false, oder mehrzeilig per Default)
   *  wirkt der VOLLE Banner (Fuellzeichen/Breite/Bezug) wie beim Container; sonst nur prefix/suffix. */
  heading?: Heading
  /** „Trenner-Funktion": Titel als eigene (Banner-)Zeile, der Wert rutscht in die naechste Zeile.
   *  titleInline===false = Banner an; true = inline (Titel+Wert auf einer Zeile). Fehlt -> inline,
   *  AUSSER das Feld ist mehrzeilig (dann per Default eigene Zeile). */
  titleInline?: boolean
  /** Standardwert. */
  default?: string
  /** Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen). */
  inline?: boolean
  /** Kein Feld-Trenner VOR diesem Feld (klebt ans vorherige inline-Element, z. B. Wert+Einheit). */
  noSeparatorBefore?: boolean
  /** Optische Leerzeile (Absatz) VOR diesem Feld - nur wirksam, wenn darueber etwas ausgegeben wird
   *  UND das Feld eine eigene Titel-/Banner-Zeile hat (multiline oder titleInline=false). */
  blankLineBefore?: boolean
  /** Vordefinierte Auswahl-Optionen. Gesetzt -> das Feld ist ein SELECT (Wert = Ausgabetext).
   *  Tri-State unveraendert: ✓ = default (sonst options[0]), ✎ = Option waehlen/Freitext, − = entfaellt. */
  options?: string[]
  /** Bei einem Select zusaetzlich „individuell" -> Freitext anbieten (Default aus). */
  allowCustom?: boolean
  /** Mehrfachauswahl: mehrere Optionen gleichzeitig waehlbar (Checkboxen bei ≤6, Multi-Dropdown bei >6).
   *  Nur mit options wirksam. Fehlt/false -> Einfachauswahl wie bisher. ADDITIV + rueckwaerts/vorwaerts-
   *  kompatibel: alte App-Versionen ignorieren das Feld und rendern normales Single-Select (kein Bump von
   *  BLOCK_VERSION/PROTOCOL_VERSION -> geteilte „Multi"-Bloecke werden von aelteren Apps akzeptiert). */
  multiple?: boolean
  /** Bei multiple: Optionen (exakte Strings aus options), die bei Auswahl alle ANDEREN verdraengen — ein
   *  „Keine/Normalbefund" ersetzt jede andere Auswahl (und wird von jeder anderen ausgeschlossen; exklusiv). */
  exclusiveOptions?: string[]
  /** Freitext mehrzeilig erfassen: im ✎-Modus ein grosses Textfeld (Sheet) statt einzeiligem <input>
   *  - fuer lange Eingaben (Anamnese, Verlauf). Nur OHNE options wirksam (Select hat keine
   *  Freitext-Haupteingabe). Wert bleibt ein String (mit Zeilenumbruechen); Renderer unveraendert. */
  multiline?: boolean
  /** Pflichtfeld: das Feld „darf nicht still verschwinden". Im Einsatz entfaellt der −-Zustand
   *  (nicht erhoben); es bleiben ✓ (Auswahl/Standard) und ✎ (eigener Wert). „Nicht erhebbar" wird bei
   *  Bedarf sichtbar via ✎ dokumentiert, nicht per −. Rein additiv, kein Submit-Gate; der Renderer
   *  bleibt unveraendert. Ein leeres Pflichtfeld wird nur visuell als „noch offen" markiert. */
  required?: boolean
}

/** Funktions-Knoten: ein BLATT mit eigener Einsatz-UI + eigenem Wert (erste Funktion: Medikamentenplan).
 *  functionKind = innerer Diskriminator (waechst), aufgeloest ueber die Funktions-Registry. Immer Block. */
export type FunctionKind = 'medikamentenplan' | 'aerzte' | 'packYears' | 'news2'

/** Zeilen-Layout-Konfiguration einer Funktion (pro functionKind in der Registry interpretiert). Alle
 *  Felder optional + primitiv -> JSON-Roundtrip trivial; fehlt -> heutiges Verhalten (block, ohne pre/suf). */
export interface FunctionConfig {
  /** untereinander (block, je Zeile eigene Zeile) vs hintereinander (inline, mit Separator). Default 'block'. */
  rowLayout?: 'block' | 'inline'
  /** Trenner zwischen Zeilen bei rowLayout='inline'. Frei waehlbar. Fehlt -> " · " (Mittelpunkt:
   *  hebt die Zeilengrenze vom Komma im Zeilenformat "Name Staerke, Schema" ab, #262). */
  rowSeparator?: string
  /** Praefix je Zeile bei rowLayout='block'. */
  rowPrefix?: string
  /** Suffix je Zeile bei rowLayout='block'. */
  rowSuffix?: string
}

export interface FunctionNode {
  type: 'function'
  id: string
  title?: string
  /** Titel in der AUSGABE zeigen? Fehlt/false -> kein Titel (wie bei allen Knoten). Der Editor setzt
   *  es beim Anlegen einer Funktion standardmaessig auf true (createFunction). */
  showTitle?: boolean
  /** Titel inline vor dem Inhalt (kein Banner) statt eigener Zeile - analog Container. */
  titleInline?: boolean
  /** Titel-Format (prefix/suffix + Banner Fuellzeichen/Breite wie beim Container). */
  heading?: Heading
  /** Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen).
   *  Wirkt wie beim Feld (Maintainer 2026-07-03): auch mehrzeilige Listen-Funktionen (Medikamentenplan/
   *  Aerzte) koennen inline an die laufende Zeile - nur ein Titel-Banner (Titel auf eigener Zeile) bleibt Block. */
  inline?: boolean
  /** Kein Feld-Trenner VOR dieser Funktion (klebt ans vorherige inline-Element). */
  noSeparatorBefore?: boolean
  /** Optische Leerzeile (Absatz) VOR der Funktion - nur bei Titel-Banner der Funktion und wenn darueber
   *  etwas ausgegeben wird (Basis-Regel oben; ohne Banner still ohne Wirkung, wie beim Feld). */
  blankLineBefore?: boolean
  functionKind: FunctionKind
  /** Ausgabe-Formatierung der Funktions-Zeilen (Layout/Trenner/Praefix/Suffix). */
  config?: FunctionConfig
  /** Standardtext: Fallback-Body, wenn die Funktion im Einsatz nichts ausgibt (analog Field.default /
   *  Container.emptyText) - Listen-Funktionen ohne Eintraege ODER Rechner ohne Ergebnis. Erfasste
   *  Werte/Zeilen haben Vorrang. Gilt fuer ALLE functionKinds. */
  default?: string
  /** Pflicht (analog Field.required): der −-Zustand (nicht erhoben) entfaellt im Einsatz; ✓/✎ bleiben.
   *  „Erfuellt" = die Funktion liefert nicht-leeren Ausgabetext (Zeilen ODER Freitext ODER Standardtext).
   *  Rein additiv, kein Submit-Gate; nur visuelle „noch offen"-Markierung. */
  required?: boolean
}

export type Node = Container | Field | FunctionNode

/** Eine Medikamenten-Zeile (Funktion Medikamentenplan). Bewusst NUR patientenrelevante Felder. */
export interface MedikamenteRow {
  name: string
  /** Wirkstaerke des Praeparats (z. B. "400 mg") - eigenes Feld statt im Namen (#262).
   *  Quelle der Wahrheit: eigene Pflege (PZN-Bibliothek/manuell), NICHT der BMP-Scan. */
  staerke?: string
  dosierung?: string
  kommentar?: string
  /** Pharmazentralnummer (optional, aus Scan/Lookup) - fuer den Bibliotheks-Transfer. */
  pzn?: string
}

/** Eine Zeile der Funktion „Ärzte & Kontaktpersonen". name pflicht (wie MedikamenteRow), Rest optional
 *  -> ein gescannter Arzt kommt immer in die Liste, auch ohne Rolle. arztnummer = ein freies Feld
 *  (LANR/IK/IDF gemischt). Angehörige/Betreuer = Kontaktperson-Feldsatz (Name/Telefon + zwei Flags,
 *  KEIN Arztnummer/Ort); der BMP-Cross-Scan liefert immer nur Hausarzt/Facharzt (nie eine Kontakt-Rolle). */
export interface ArztRow {
  name: string
  /** Hausarzt/Facharzt = Arzt-Feldsatz; Angehöriger/Betreuer = Kontaktperson-Feldsatz. Leer = nicht
   *  dokumentiert. Der BMP liefert nur Hausarzt/Facharzt. */
  rolle?: 'Hausarzt' | 'Facharzt' | 'Angehöriger' | 'Betreuer'
  ort?: string
  telefon?: string
  arztnummer?: string
  /** nur Kontakt-Rollen: Patientenverfügung (Dokument, § 1827 BGB — WAS zu tun ist) liegt vor. */
  patientenverfuegung?: boolean
  /** nur Kontakt-Rollen: Vorsorgevollmacht (§ 1820 BGB) bzw. rechtliche Betreuung (§ 1814 BGB) —
   *  WER jetzt entscheiden darf — liegt vor. */
  vollmacht?: boolean
}

/** Eingabe der Funktion „Pack-Years" (#55-Rework): genau EINE Zeile pro Score-Knoten, reine Zahlen.
 *  Das ERGEBNIS (Packungsjahre) wird abgeleitet (Registry ruft scores.packYears), nie gespeichert -
 *  wie ein berechnetes/read-only Feld (vgl. FHIR calculatedExpression, SurveyJS calculatedValue). */
export interface PackYearsRow {
  cigarettesPerDay?: number
  years?: number
}

/** Eingabe der Funktion „NEWS2" (#55-Rework): genau EINE Zeile pro Score-Knoten. Die RCP-Parameter
 *  Atemfrequenz (rr), SpO2, RR systolisch, Herzfrequenz (pulse), Temperatur, Bewusstsein (ACVPU) + O2-Gabe
 *  (onOxygen). scale2 schaltet die SpO2-Skala 2 (aerztlich dokumentierte Ziel-Saettigung 88-92 %, z. B.
 *  COPD). Score/Risiko werden abgeleitet (Registry ruft scores.news2), nie gespeichert - read-only-Feld. */
export interface NEWS2Row {
  rr?: number
  spo2?: number
  systolic?: number
  pulse?: number
  temp?: number
  consciousness?: 'A' | 'C' | 'V' | 'P' | 'U'
  onOxygen?: boolean
  scale2?: boolean
}

/** Zeilen-Typ einer Funktion - je functionKind verschieden, als Union (rueckwaerts-kompatibel:
 *  MedikamenteRow bleibt der erste Fall). Registry/Komponente kastellieren je Kind zur Laufzeit.
 *  Score-Funktionen (packYears) halten genau EINE Zeile mit ihren Eingaben (kein Namen-Feld). */
export type FunctionRow = MedikamenteRow | ArztRow | PackYearsRow | NEWS2Row

/** Ausfuell-Zustand eines BLATTS im Einsatz. Feld = Tri-State; Funktion = eigene Daten (rows).
 *  Fehlt -> 'confirmed' (Standardwert). */
export type FieldFill =
  | { state: 'confirmed'; prevValue?: string } // Standardwert wird verwendet; prevValue = ruhend gemerkter, zuletzt getippter Freitext
  | { state: 'custom'; value: string; values?: string[] } // bearbeiteter Wert; values gesetzt = Mehrfachauswahl (value = gerenderter Fliesstext, damit auch alte Apps beim Lesen den korrekten Text bekommen)
  | { state: 'excluded'; prevValue?: string; prevValues?: string[] } // nicht erhoben -> entfaellt in der Ausgabe; prevValue = ruhend gemerkter Freitext, prevValues = ruhend gemerkte Multi-Auswahl
  | { state: 'function'; rows: FunctionRow[]; status?: 'confirmed' | 'custom' | 'excluded'; text?: string; prevText?: string } // Funktions-Zeilen + Tri-State-Status + Freitext (custom) NEBEN den Zeilen; status fehlt -> confirmed (rueckwaerts-kompatibel); prevText = ruhend gemerkter Freitext
// prevValue/prevText sind RUHENDE Wiederherstellungs-Puffer: sie bewahren den zuletzt via ✎ getippten
// Freitext beim versehentlichen Verlassen von 'custom', damit er beim Zurueckschalten auf ✎ verbatim
// zurueckkommt. Sie erscheinen NIE in der Ausgabe (Renderer/fillValue ignorieren sie) - excluded bleibt
// excluded, confirmed nutzt den Standardwert. Reine Recovery-Semantik, keine Modell-/Ausgabe-Aenderung.

/** Default-Heading (Vorschlag Markdown), eingefroren (geteilter Fallback). */
export const DEFAULT_HEADING: Heading = Object.freeze({
  prefix: '## ',
  suffix: '',
  fill: '',
  width: 40,
  fillMode: 'inclusive' as const,
})

/** Default-Trenner zwischen inline-Geschwistern, wenn die Wurzel keinen eigenen setzt. */
export const DEFAULT_SEPARATOR = ', '

export function isContainer(node: Node): node is Container {
  return node.type === 'container'
}
export function isField(node: Node): node is Field {
  return node.type === 'field'
}
export function isFunction(node: Node): node is FunctionNode {
  return node.type === 'function'
}
