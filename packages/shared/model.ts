// Modell — Rework. Knoten sind eine discriminated union: Container ODER Field.
// Enthaelt nur, was in docs/rework/container.md + der Feld-Definition festgelegt ist.

export type FillMode = 'inclusive' | 'exclusive'

/** Eine Bedingung: im Auswahlfeld `fieldId` ist eine der `options` gewaehlt. */
export interface Condition {
  fieldId: string
  options: string[]
}

/**
 * Abhaengigkeit: das Element wird nur erhoben, wenn die Bedingungen zutreffen (dependencies.ts).
 * Ohne `match` muessen ALLE zutreffen, mit `match: 'any'` genuegt eine. Aeltere App-Versionen
 * ignorieren die Angabe; damit das Element dort nicht ungewollt erscheint, gehoert `defaultExcluded`
 * dazu (bei Abschnitten zusaetzlich `excludable`).
 */
export interface Dependency {
  conditions: Condition[]
  match?: 'any'
}

/** Anderer Standardwert eines Feldes, solange die Bedingung zutrifft (dependencies.ts). */
export interface ConditionalDefault extends Condition {
  value: string
}

/** Ueberschriften-/Titel-Format: prefix/suffix unabhaengig, Fuellzeichen + Breite (nur Container-
 *  Banner), Bezug inklusive/exklusive. Beim FELD wirken nur prefix/suffix (kein Banner). */
export interface Heading {
  prefix: string
  suffix: string
  fill: string
  width: number
  fillMode: FillMode
}

/** Ein Stueck eines Lueckentexts: fester Text ODER eine Luecke. Die Luecke verweist per Kennung auf ein
 *  Feld oder eine Funktion der Vorlage. Liegt das Element direkt im Abschnitt des Lueckentexts, fragt die
 *  Luecke ihren Wert selbst ab; liegt es an anderer Stelle der Vorlage, uebernimmt sie dessen Wert. */
export type ClozePart = string | { gap: string }

/** Lueckentext: ein frei geschriebener Text mit Luecken. Er ist die AUSGABE-Form eines Abschnitts - die
 *  Luecken selbst sind normale Felder/Funktionen (Kinder des Abschnitts oder Elemente an anderer Stelle). */
export interface Cloze {
  /** Der Text als Folge aus festen Stuecken und Luecken, in Lesereihenfolge. */
  parts: ClozePart[]
  /** Beim Ausfuellen auch Luecken abfragen, die schon einen Standardwert haben. Fehlt/false -> solche
   *  Luecken werden beim Durchtippen uebersprungen (man kann sie trotzdem antippen und aendern). */
  askDefaults?: boolean
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
  /** UNO Reverse: der Container startet im Einsatz auf „nicht erhoben" statt auf „bestaetigt" und
   *  erscheint erst, wenn der Anwender ihn bewusst einschaltet. Fuer Abschnitte, die man nur in
   *  bestimmten Lagen braucht (z. B. ein neurologischer Befund) - ein Tipp schaltet den ganzen
   *  Teilbaum zu, statt jedes Feld einzeln.
   *  Nur zusammen mit `excludable` sinnvoll: ohne den ✓/−-Schalter liesse sich der Container gar
   *  nicht wieder einschalten. Aendert NUR den Ausgangszustand, nicht die Vorlage selbst - im Editor
   *  bleibt der Abschnitt vollstaendig sichtbar. */
  defaultExcluded?: boolean
  /** Abhaengigkeit von Auswahlfeldern (siehe Dependency). */
  dependsOn?: Dependency
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
  /** Lueckentext: statt der Kinder untereinander gibt der Abschnitt einen frei geschriebenen Text aus,
   *  in dem die Luecken an ihrer Stelle im Satz stehen. In der Ausgabe erscheint je Luecke nur der Wert
   *  (ohne Titel). Kinder, die in keiner Luecke stehen, folgen wie gewohnt unter dem Text. ADDITIV:
   *  aeltere App-Versionen ignorieren die Eigenschaft und zeigen die Kinder als normale Feldliste. */
  cloze?: Cloze
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
  /** Bei allowCustom: die „individuell"-Eingabe ist ein grosses Textfeld statt einer Zeile - fuer
   *  laengere Texte. Nur mit options + allowCustom wirksam. ADDITIV: aeltere App-Versionen ignorieren
   *  die Eigenschaft und zeigen das einzeilige Feld; der Wert bleibt ein String, Ausgabe unveraendert. */
  customMultiline?: boolean
  /** Mehrfachauswahl: mehrere Optionen gleichzeitig waehlbar (Checkboxen bei ≤6, Multi-Dropdown bei >6).
   *  Nur mit options wirksam. Fehlt/false -> Einfachauswahl wie bisher. ADDITIV + rueckwaerts/vorwaerts-
   *  kompatibel: alte App-Versionen ignorieren das Feld und rendern normales Single-Select (kein Bump von
   *  BLOCK_VERSION/PROTOCOL_VERSION -> geteilte „Multi"-Bloecke werden von aelteren Apps akzeptiert). */
  multiple?: boolean
  /** Bei multiple: Optionen (exakte Strings aus options), die bei Auswahl alle ANDEREN verdraengen — ein
   *  „Keine/Normalbefund" ersetzt jede andere Auswahl (und wird von jeder anderen ausgeschlossen; exklusiv). */
  exclusiveOptions?: string[]
  /** Bei multiple: „startet ohne Auswahl" - KEINE Option ist vorausgewaehlt (z. B. Einsatzcodes, wo eine
   *  Vorauswahl einen falschen Code dokumentieren wuerde). Ohne die Eigenschaft gilt wie bisher die
   *  Standard-Option (default, sonst die oberste). Eine leere Auswahl ist dann der Ausgangszustand (✓, nichts
   *  in der Ausgabe; ein Pflichtfeld bleibt „noch offen"), nicht „nicht erhoben". Nur mit multiple wirksam. */
  defaultEmpty?: boolean
  /** Freitext mehrzeilig erfassen: im ✎-Modus ein grosses Textfeld (Sheet) statt einzeiligem <input>
   *  - fuer lange Eingaben (Anamnese, Verlauf). Nur OHNE options wirksam (Select hat keine
   *  Freitext-Haupteingabe). Wert bleibt ein String (mit Zeilenumbruechen); Renderer unveraendert. */
  multiline?: boolean
  /** Pflichtfeld: das Feld „darf nicht still verschwinden". Im Einsatz entfaellt der −-Zustand
   *  (nicht erhoben); es bleiben ✓ (Auswahl/Standard) und ✎ (eigener Wert). „Nicht erhebbar" wird bei
   *  Bedarf sichtbar via ✎ dokumentiert, nicht per −. Rein additiv, kein Submit-Gate; der Renderer
   *  bleibt unveraendert. Ein leeres Pflichtfeld wird nur visuell als „noch offen" markiert. */
  required?: boolean
  /** UNO Reverse: das Feld startet im Einsatz auf „nicht erhoben" (−) statt auf „bestaetigt" (✓) und
   *  erscheint erst in der Ausgabe, wenn der Anwender es bewusst einschaltet. Fuer Felder, die man
   *  nur in bestimmten Lagen braucht.
   *  Schliesst sich mit `required` aus (ein Pflichtfeld darf nicht still entfallen); der Editor
   *  verhindert die Kombination. Aendert NUR den Ausgangszustand - die Vorlage bleibt vollstaendig,
   *  das Weglassen ist reiner Einsatz-Zustand. */
  defaultExcluded?: boolean
  /** Abhaengigkeit von Auswahlfeldern (siehe Dependency). */
  dependsOn?: Dependency
  /** Abhaengiger Standardwert: die ERSTE zutreffende Regel ersetzt `default`, solange das Feld auf
   *  dem Standardwert steht. Bei einem Auswahlfeld muss `value` eine seiner Optionen sein. Aeltere
   *  App-Versionen ignorieren die Angabe und nehmen `default`. */
  defaultWhen?: ConditionalDefault[]
}

/** Funktions-Knoten: ein BLATT mit eigener Einsatz-UI + eigenem Wert (erste Funktion: Medikamentenplan).
 *  functionKind = innerer Diskriminator (waechst), aufgeloest ueber die Funktions-Registry. Immer Block. */
export type FunctionKind = 'medikamentenplan' | 'aerzte' | 'packYears' | 'news2' | 'lams' | 'fast4d' | 'zops' | 'sgarbossa' | 'egsys' | 'bmi'

/** Zeilen-Layout-Konfiguration einer Funktion (pro functionKind in der Registry interpretiert). Alle
 *  Felder optional + primitiv -> JSON-Roundtrip trivial; fehlt -> heutiges Verhalten (block, ohne pre/suf). */
export interface FunctionConfig {
  /** untereinander (block, je Zeile eigene Zeile) vs hintereinander (inline, mit Separator). Default 'block'. */
  rowLayout?: 'block' | 'inline'
  /** Trenner zwischen Zeilen bei rowLayout='inline'. Frei waehlbar. Fehlt -> " · " (Mittelpunkt:
   *  hebt die Zeilengrenze vom Komma im Zeilenformat "Name Staerke, Schema" ab). */
  rowSeparator?: string
  /** Praefix je Zeile bei rowLayout='block'. */
  rowPrefix?: string
  /** Suffix je Zeile bei rowLayout='block'. */
  rowSuffix?: string
  /** Text, den ein Score ab seiner Schwelle anhaengt (z. B. EGSYS ab 3 Punkten). Nur fuer Funktionen,
   *  die in der Registry `thresholdText` anbieten. Fehlt oder leer -> Standardtext der Funktion. */
  thresholdText?: string
  /** Zeichen am Ende der Ergebniszeile (alle einzeiligen Funktionen, Registry `lineEnd`).
   *  Fehlt -> Standard der Funktion (je nach Funktion '.' oder nichts); leer ('') -> nichts am Ende. */
  lineEnd?: string
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
   *  Wirkt wie beim Feld: auch mehrzeilige Listen-Funktionen (Medikamentenplan/
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
  /** UNO Reverse (analog Field.defaultExcluded): die Funktion startet im Einsatz auf „nicht erhoben"
   *  (−) und erscheint erst in der Ausgabe, wenn der Anwender sie einschaltet oder Daten erfasst.
   *  Schliesst sich mit `required` aus; der Editor verhindert die Kombination. Aendert NUR den
   *  Ausgangszustand (fehlender Eintrag im Werte-Store), siehe functionStatus in fill.ts. */
  defaultExcluded?: boolean
  /** Abhaengigkeit von Auswahlfeldern (siehe Dependency). */
  dependsOn?: Dependency
}

export type Node = Container | Field | FunctionNode

/** Eine Medikamenten-Zeile (Funktion Medikamentenplan). Bewusst NUR patientenrelevante Felder. */
export interface MedikamenteRow {
  name: string
  /** Wirkstaerke des Praeparats (z. B. "400 mg") - eigenes Feld statt im Namen.
   *  Quelle der Wahrheit: eigene Pflege (PZN-Bibliothek/manuell), NICHT der BMP-Scan. */
  staerke?: string
  dosierung?: string
  kommentar?: string
  /** Pharmazentralnummer (optional, aus Scan/Lookup) - fuer den Bibliotheks-Transfer. */
  pzn?: string
}

/** Eine Zeile der Funktion „Kontakte/Ärzte". name pflicht (wie MedikamenteRow), Rest optional
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

/** Eingabe der Funktion „Pack-Years": genau EINE Zeile pro Score-Knoten, reine Zahlen.
 *  Das ERGEBNIS (Packungsjahre) wird abgeleitet (Registry ruft scores.packYears), nie gespeichert -
 *  wie ein berechnetes/read-only Feld (vgl. FHIR calculatedExpression, SurveyJS calculatedValue). */
export interface PackYearsRow {
  cigarettesPerDay?: number
  years?: number
}

/** Eingabe der Funktion „NEWS2": genau EINE Zeile pro Score-Knoten. Die RCP-Parameter
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

/** Eingabe der Funktion „LAMS" (Los Angeles Motor Scale): genau EINE Zeile pro Score-Knoten. Drei
 *  Befunde als Punktwerte: Gesicht 0-1, Armhalteversuch 0-2, Haendedruck 0-2. Summe + LVO-Hinweis ab 4
 *  werden abgeleitet (Registry ruft scores.lams), nie gespeichert. Feldnamen mit Praefix, weil der
 *  Entwurf den functionKind je Zeile nicht kennt (caseDraft.sanitizeRows = Union aller Felder). */
export interface LAMSRow {
  lamsFace?: 0 | 1
  lamsArm?: 0 | 1 | 2
  lamsGrip?: 0 | 1 | 2
}

/** Befund eines FAST4D-Zeichens: unauffaellig / auffaellig / nicht pruefbar. */
export type Fast4dBefund = 'neg' | 'pos' | 'na'

/** Eingabe der Funktion „FAST4D" (Schlaganfall-Screening): genau EINE Zeile pro Knoten. Sieben Befunde
 *  (Face, Arm, Speech + Doppelbilder, Gesichtsfelddefekt, Dreh-/Schwankschwindel, Dysmetrie/Ataxie),
 *  optional die Seite fuer Face/Arm und die Zeitangabe (Symptombeginn / zuletzt gesund gesehen /
 *  unklar + Uhrzeit HH:MM). Die Zeit wird erfasst, zaehlt aber nicht zum Ergebnis. Positiv/negativ
 *  wird abgeleitet (Registry ruft scores.fast4d), nie gespeichert. Feldnamen mit Praefix wie LAMSRow. */
export interface FAST4DRow {
  fastFace?: Fast4dBefund
  fastArm?: Fast4dBefund
  fastSpeech?: Fast4dBefund
  fastDiplopia?: Fast4dBefund
  fastField?: Fast4dBefund
  fastVertigo?: Fast4dBefund
  fastAtaxia?: Fast4dBefund
  fastFaceSide?: 're' | 'li'
  fastArmSide?: 're' | 'li'
  fastTimeMode?: 'onset' | 'lsw' | 'unknown'
  fastTime?: string
}

/** Befund eines ZOPS-Punkts: orientiert / nicht orientiert / nicht pruefbar. */
export type ZopsBefund = 'ok' | 'no' | 'na'

/** Eingabe der Funktion „ZOPS" (Orientierung zu Zeit, Ort, Person, Situation): genau EINE Zeile pro
 *  Knoten, vier Befunde. KEIN Punktwert und keine Schwelle: die Ausgabe nennt nur, wozu der Patient
 *  nicht orientiert ist oder was sich nicht pruefen liess (Registry ruft scores.zops). Feldnamen mit
 *  Praefix wie LAMSRow/FAST4DRow, damit sie im Entwurf nicht mit anderen Funktionen kollidieren. */
export interface ZOPSRow {
  zopsTime?: ZopsBefund
  zopsPlace?: ZopsBefund
  zopsPerson?: ZopsBefund
  zopsSituation?: ZopsBefund
}

/** Befund eines Sgarbossa-Kriteriums: erfuellt / nicht erfuellt / nicht beurteilbar. */
export type SgarbossaBefund = 'pos' | 'neg' | 'na'

/** Eingabe der Funktion „Sgarbossa (mod. nach Smith)": genau EINE Zeile pro Knoten, drei gleichwertige
 *  EKG-Kriterien (konkordante ST-Hebung, konkordante ST-Senkung in V1-V3, diskordante ST-Hebung ab
 *  25 % der S-Zacke). Positiv ab EINEM erfuellten Kriterium, kein Punktwert (Registry ruft
 *  scores.sgarbossa). Feldnamen mit Praefix wie bei den anderen Befund-Funktionen. */
export interface SgarbossaRow {
  sgbConcordantElevation?: SgarbossaBefund
  sgbConcordantDepression?: SgarbossaBefund
  sgbDiscordantElevation?: SgarbossaBefund
}

/** Antwort auf einen EGSYS-Punkt. Als Text statt Boolean, weil der Entwurf Zeilen nur aus Booleans
 *  als leer verwirft (caseDraft.sanitizeRows). */
export type EgsysAntwort = 'yes' | 'no'

/** Eingabe der Funktion „EGSYS" (Synkope: Hinweise auf kardiale Ursache): genau EINE Zeile pro Knoten,
 *  sechs Anamnese-Punkte mit Ja/Nein. Die Summe (-2 bis +12) wird abgeleitet (Registry ruft
 *  scores.egsys), nie gespeichert. Feldnamen mit Praefix wie bei den anderen Befund-Funktionen. */
export interface EGSYSRow {
  egsysPalpitations?: EgsysAntwort
  egsysHeartDisease?: EgsysAntwort
  egsysEffort?: EgsysAntwort
  egsysSupine?: EgsysAntwort
  egsysTriggers?: EgsysAntwort
  egsysProdromes?: EgsysAntwort
}

/** Eingabe der Funktion „BMI": genau EINE Zeile pro Knoten, Gewicht in kg und Groesse in cm. Wert und
 *  WHO-Klasse werden abgeleitet (Registry ruft scores.bmi), nie gespeichert. Feldnamen mit Praefix. */
export interface BMIRow {
  bmiWeight?: number
  bmiHeight?: number
}

/** Zeilen-Typ einer Funktion - je functionKind verschieden, als Union (rueckwaerts-kompatibel:
 *  MedikamenteRow bleibt der erste Fall). Registry/Komponente kastellieren je Kind zur Laufzeit.
 *  Score-Funktionen (packYears) halten genau EINE Zeile mit ihren Eingaben (kein Namen-Feld). */
export type FunctionRow = MedikamenteRow | ArztRow | PackYearsRow | NEWS2Row | LAMSRow | FAST4DRow | ZOPSRow | SgarbossaRow | EGSYSRow | BMIRow

/** Ausfuell-Zustand eines BLATTS im Einsatz. Feld = Tri-State; Funktion = eigene Daten (rows).
 *  Fehlt -> 'confirmed' (Standardwert). */
export type FieldFill =
  | { state: 'confirmed'; prevValue?: string; auto?: true } // Standardwert wird verwendet; prevValue = ruhend gemerkter, zuletzt getippter Freitext
  | { state: 'custom'; value: string; values?: string[] } // bearbeiteter Wert; values gesetzt = Mehrfachauswahl (value = gerenderter Fliesstext, damit auch alte Apps beim Lesen den korrekten Text bekommen)
  | { state: 'excluded'; prevValue?: string; prevValues?: string[]; auto?: true } // nicht erhoben -> entfaellt in der Ausgabe; prevValue = ruhend gemerkter Freitext, prevValues = ruhend gemerkte Multi-Auswahl
  | { state: 'function'; rows: FunctionRow[]; status?: 'confirmed' | 'custom' | 'excluded'; text?: string; prevText?: string; auto?: true } // Funktions-Zeilen + Tri-State-Status + Freitext (custom) NEBEN den Zeilen; status fehlt -> confirmed (rueckwaerts-kompatibel); prevText = ruhend gemerkter Freitext
// auto = von einer Abhaengigkeit gesetzt, nicht vom Anwender (dependencies.ts). Jede Eingabe des Anwenders
// schreibt einen Zustand OHNE auto; daran erkennt die Regel, dass sie das Element nicht mehr anfassen darf.
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
