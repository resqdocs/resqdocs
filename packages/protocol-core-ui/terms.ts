// terms.ts - alle ⓘ-Erklaerungen an einer Stelle. Gilt fuer App und Online-Editor.
//
// {einsatz}, {vorlagen}, {bausteine}, {einstellungen} im Text werden zu einem Tab-Verweis mit Icon (TabRef): So ist
// klar, dass der Tab gemeint ist und nicht der Einsatz selbst.
// Einheitliche Begriffe in der Oberflaeche (nomenclature.test.ts prueft die Altbegriffe). Datenformat und Code behalten
// ihre Namen, nur die Anzeige folgt dieser Liste:
//   Vorlage (nicht Protokoll-Vorlage) · Protokolltext (nicht Ausgabe, Ausgabetext) · Abschnitt (type 'container')
//   gespeicherter Abschnitt (Block) · Textbaustein (Snippet, Mustertext) · Feld (nicht Befund) · Funktion (nicht Rechner)
//   Option (Eintrag einer Auswahlliste) · Standardwert (nicht Standardtext, Normalbefund) · Kennung (nicht Identifier)
//   Zustaende: bestaetigt, eigener Wert, nicht erhoben · Medikationsplan (nicht Medikamentenplan, BMP)
//   Bridge (nicht Geraet, Pico) · Bridge-ID · Zielgeraet (nicht NIDA, Ziel-OS) · An Zielgeraet senden
//   Sicherung (nicht Backup) · Exportieren (nicht als Datei sichern) · Loeschen (was weg ist) · Einfuehrung (nicht Tour)
//   KI-Assistent = dein eigenes LLM, KI-Tool = unsere Seite (nicht LLM, KI-Hilfe)

export type TabName = 'einsatz' | 'vorlagen' | 'bausteine' | 'einstellungen'
export const TAB_LABEL: Record<TabName, string> = {
  einsatz: 'Einsatz',
  vorlagen: 'Vorlagen',
  bausteine: 'Bausteine',
  einstellungen: 'Einstellungen',
}

export interface InfoText {
  title: string
  text?: string
  items?: { term: string; text: string }[]
  /** So sieht es im Protokolltext aus. terms.examples.test.ts prueft jede Ausgabe gegen den echten Renderer. */
  examples?: { label: string; output: string }[]
}

const SECTION = 'Fasst zusammengehörige Felder unter einer Überschrift zusammen, z. B. „Anamnese“. Abschnitte lassen sich ineinander verschachteln.'
const FIELD = 'Eine einzelne Angabe in der Vorlage, z. B. „Atmung“: frei eingeben oder aus einer Liste wählen.'
const FUNCTION = 'Fertige Eingabehilfe für Aufwendigeres: Medikationsplan, Kontakte/Ärzte, Pack-Years, NEWS2, LAMS und FAST4D.'
const SNIPPET = 'Fertiger Text, den du einmal anlegst und immer wieder nutzt. In der Vorlage wird daraus ein Feld mit diesem Text, im {einsatz} landet er direkt im Feld.'
const SAVED_SECTION = 'Ein Abschnitt samt Inhalt, den du für andere Vorlagen gespeichert hast. Eingefügt wird immer eine Kopie: Spätere Änderungen wirken nicht auf bereits eingefügte Kopien.'

export const INFO = {
  addMenu: {
    title: 'Was kann ich hinzufügen?',
    items: [
      { term: 'Abschnitt', text: SECTION },
      { term: 'Feld', text: FIELD },
      { term: 'Funktion', text: FUNCTION },
      { term: 'Textbaustein', text: SNIPPET },
      { term: 'Gespeicherter Abschnitt', text: SAVED_SECTION },
    ],
  },
  section: { title: 'Abschnitt', text: SECTION },
  field: { title: 'Feld', text: FIELD },
  function: { title: 'Funktion', text: FUNCTION },
  snippets: { title: 'Textbausteine', text: SNIPPET },
  savedSections: { title: 'Gespeicherte Abschnitte', text: `${SAVED_SECTION} Anlegen: in {vorlagen} unter den Eigenschaften eines Abschnitts „Für andere Vorlagen speichern“ wählen.` },
  savedSectionsEditor: { title: 'Gespeicherte Abschnitte', text: `${SAVED_SECTION} Anlegen: unter den Eigenschaften eines Abschnitts „Für andere Vorlagen speichern“ wählen.` },
  saveForOtherTemplates: {
    title: 'Für andere Vorlagen speichern',
    text: 'Legt eine Kopie dieses Abschnitts mit allem, was darin liegt, unter {bausteine} ab. Über das ＋ fügst du ihn dann in jede Vorlage ein.',
  },
  saveForOtherTemplatesEditor: {
    title: 'Für andere Vorlagen speichern',
    text: 'Legt eine Kopie dieses Abschnitts mit allem, was darin liegt, unter „Gespeicherte Abschnitte“ ab. Über das ＋ fügst du ihn dann in jede Vorlage ein.',
  },
  defaultValue: {
    title: 'Standardwert',
    text: 'Dieser Text steht im {einsatz} schon im Feld und kommt so in den Protokolltext, wenn du nichts änderst.',
  },
  options: {
    title: 'Auswahl-Optionen',
    text: 'Mit Optionen wird das Feld im {einsatz} zur Auswahlliste, die markierte Option ist vorausgewählt. Ohne Optionen bleibt es ein normales Textfeld. Bei Mehrfachauswahl gibt es je Option das Häkchen „allein“: Eine solche Option steht nie zusammen mit anderen. Wählst du sie, werden die anderen abgewählt; wählst du eine andere, verschwindet sie. Typisch für „keine“ oder „unauffällig“.',
  },
  allowCustom: {
    title: '„individuell“ erlauben',
    text: 'Hängt an die Liste den Eintrag ✎ individuell an. Ein Tipp darauf macht im {einsatz} aus der Liste ein Textfeld, gefüllt mit dem, was gerade ausgewählt ist, und du schreibst frei weiter. Der Schalter vor dem Titel (✓ → ✎) führt an dieselbe Stelle.',
  },
  customMultiline: {
    title: 'Großes Textfeld bei „individuell“',
    text: 'Wählst du im {einsatz} „individuell“, schreibst du in einem großen Textfeld statt in einer Zeile. Sinnvoll für längere Texte. Im Protokolltext steht in beiden Fällen dasselbe.',
  },
  multiple: {
    title: 'Mehrfachauswahl',
    text: 'Im {einsatz} lassen sich mehrere Optionen ankreuzen. Mit „allein“ markierst du Optionen wie „keine“, die nie zusammen mit anderen stehen.',
  },
  defaultYield: {
    title: 'Standardwert weicht',
    text: 'Wählst du im {einsatz} eine weitere Option, verschwindet der Standardwert aus der Auswahl. Sinnvoll, wenn er eine pauschale Aussage ist, die jede genauere Angabe ersetzt, z. B. der Normalbefund beim EKG. Wählst du den Standardwert wieder, werden die anderen abgewählt.',
  },
  defaultEmpty: {
    title: 'Startet ohne Auswahl',
    text: 'Im {einsatz} ist nichts vorausgewählt. Sinnvoll, wenn eine Vorauswahl etwas Falsches dokumentieren würde, z. B. bei Einsatzcodes. Ohne Auswahl gibt das Feld nichts aus.',
  },
  required: {
    title: 'Pflichtfeld',
    text: 'Lässt sich im {einsatz} nicht auf „nicht erhoben“ stellen. Du bestätigst den Wert (✓) oder trägst einen eigenen ein (✎). Ist es noch leer, wird es als offen markiert; gesperrt wird nichts.',
  },
  general: {
    title: 'Allgemein',
    text: 'Das, was du fast immer einstellst: Titel, Standardwert, ob das Element Pflicht ist und ob es im {einsatz} von Anfang an erhoben wird.',
  },
  listOptions: {
    title: 'Listenoptionen',
    text: 'Alles rund um die Auswahlliste eines Feldes: die Optionen selbst, welche vorausgewählt ist, ob mehrere wählbar sind und ob man mit „individuell“ frei schreiben darf. Ohne Optionen bleibt das Feld ein normales Textfeld.',
  },
  dependency: {
    title: 'Abhängigkeit',
    text: 'Macht dieses Element von der Auswahl in einem anderen Feld abhängig. Es gibt zwei Arten: Das Element erscheint im {einsatz} nur unter einer Bedingung, oder ein Feld bekommt je nach Auswahl einen anderen Standardwert. Bedingung ist immer: In einem Feld mit Auswahl-Optionen ist eine bestimmte Option gewählt.',
  },
  dependencyVisible: {
    title: 'Nur anzeigen, wenn eine Bedingung zutrifft',
    text: 'Das Element ist im {einsatz} ausgeblendet und steht nicht im Protokolltext, bis die Bedingung zutrifft. Beispiel: Der Abschnitt „Reanimation“ erscheint nur, wenn im Feld „Reanimation durchgeführt“ die Option „ja“ gewählt ist. Änderst du das Element im {einsatz} selbst, bleibt es für diesen Einsatz so. Ältere App-Versionen kennen die Bedingung nicht: Dort startet das Element auf „nicht erhoben“ und lässt sich von Hand einschalten.',
  },
  dependencyAny: {
    title: 'Eine Bedingung genügt',
    text: 'Aus: Das Element erscheint erst, wenn alle Bedingungen zutreffen. An: Es erscheint, sobald eine davon zutrifft.',
  },
  defaultWhen: {
    title: 'Anderer Standardwert',
    text: 'Solange die Bedingung zutrifft, steht im {einsatz} ein anderer Standardwert im Feld. Beispiel: Bei „Transport: Verbleib“ lautet der Standardwert der Übergabe „Patient verbleibt vor Ort“. Hast du im {einsatz} selbst etwas eingetragen, bleibt dein Text. Bei einem Feld mit Auswahl-Optionen wählst du die Option, die dann vorausgewählt ist. Ältere App-Versionen nehmen immer den normalen Standardwert.',
  },
  fieldStartsExcluded: {
    title: 'Startet auf „nicht erhoben“',
    text: 'Das Feld ist im {einsatz} zunächst aus und steht nicht im Protokolltext. Erst wenn du es einschaltest, kommt es dazu. Für Angaben, die man nur in bestimmten Lagen braucht.',
  },
  functionStartsExcluded: {
    title: 'Startet auf „nicht erhoben“',
    text: 'Die Funktion ist im {einsatz} zunächst aus und steht nicht im Protokolltext. Erst wenn du sie einschaltest, kommt sie dazu. Für Angaben, die man nur in bestimmten Lagen braucht.',
  },
  fast4dColors: {
    title: 'Farben bei FAST4D',
    text: 'Die Farbe siehst nur du in der App. Im Protokolltext steht sie nicht.',
    items: [
      { term: 'Grün', text: 'Alle sieben Zeichen sind unauffällig.' },
      { term: 'Gelb', text: 'Mindestens ein Zeichen ist auffällig.' },
      { term: 'Ohne Farbe', text: 'Nichts ist auffällig, aber nicht alles war prüfbar.' },
    ],
  },
  lamsColors: {
    title: 'Farben bei LAMS',
    text: 'Die Farbe siehst nur du in der App. Im Protokolltext steht sie nicht.',
    items: [
      { term: 'Grün', text: '0 Punkte.' },
      { term: 'Gelb', text: '1 bis 3 Punkte.' },
      { term: 'Rot', text: 'Ab 4 Punkten. Im Text steht dann der Hinweis auf einen proximalen Verschluss (LVO).' },
    ],
  },
  sectionStartsExcluded: {
    title: 'Startet auf „nicht erhoben“',
    text: 'Der ganze Abschnitt ist im {einsatz} zunächst aus und steht nicht im Protokolltext. Ein Tipp schaltet ihn zu, statt jedes Feld einzeln. Für Abschnitte, die man nur in bestimmten Lagen braucht.',
  },
  excludable: {
    title: 'Als „nicht erhoben“ markierbar',
    text: 'Der Abschnitt bekommt im {einsatz} einen Schalter (✓ / −). Bei − fällt er mit allem, was darin liegt, aus dem Protokolltext.',
  },
  collapsible: {
    title: 'Einklappbar',
    text: 'Der Abschnitt lässt sich im {einsatz} zuklappen, damit die Ansicht übersichtlich bleibt. Am Protokolltext ändert das nichts.',
  },
  showTitle: {
    title: 'Titel im Protokolltext',
    text: 'Zeigt den Titel auch im Protokolltext. Ohne den Schalter steht dort nur der Wert; beim Ausfüllen bleibt der Titel sichtbar.',
    examples: [{ label: 'Mit Titel', output: 'Puls: 80' }, { label: 'Ohne Titel', output: '80' }],
  },
  multiline: {
    title: 'Mehrzeilig',
    text: 'Im {einsatz} gibt es dafür ein großes Textfeld mit Zeilenumbrüchen. Im Protokolltext steht der Titel dann in einer eigenen Zeile, der Text darunter.',
    examples: [{ label: 'Im Protokolltext', output: 'Verlauf\nErste Zeile\nZweite Zeile' }],
  },
  advanced: {
    title: 'Erweitert',
    text: 'Hier legst du fest, wie der Protokolltext aussieht: Überschriften, Trennzeichen und was in einer Zeile steht. Die Vorlage funktioniert auch, wenn du hier nichts änderst. Unter Vorschau siehst du jede Änderung sofort.',
  },
  id: {
    title: 'Kennung (id)',
    text: 'Die interne Kennung dieses Elements. Im Protokolltext taucht sie nie auf, aber die App merkt sich daran, was im {einsatz} eingetragen wurde. Änderst du sie während eines laufenden Einsatzes, ist der eingetragene Wert dort weg. Normalerweise musst du hier nichts ändern.',
  },
  titleFormat: {
    title: 'Titel-Format',
    text: 'Bestimmt, wie der Titel im Protokolltext aussieht. Beim Ausfüllen ändert sich dadurch nichts.',
  },
  prefix: {
    title: 'Präfix',
    text: 'Steht im Protokolltext direkt vor dem Titel, z. B. als Aufzählungszeichen. Leerzeichen zählen mit.',
    examples: [{ label: 'Präfix „- “', output: '- Alter: 56' }],
  },
  suffix: {
    title: 'Suffix',
    text: 'Steht direkt hinter dem Titel und trennt ihn vom Wert. Ohne Suffix klebt der Wert am Titel.',
    examples: [{ label: 'Suffix „: “', output: 'Puls: 80' }, { label: 'Ohne Suffix', output: 'Puls80' }],
  },
  titleOwnLine: {
    title: 'Titel als eigene Zeile',
    text: 'Der Titel steht allein in seiner Zeile, der Inhalt beginnt darunter. Das gliedert lange Protokolltexte. Ohne den Schalter steht alles in einer Zeile, das spart Platz.',
    examples: [{ label: 'Eigene Zeile', output: 'Atmung\nunauffällig' }, { label: 'Gleiche Zeile', output: 'Atmung: unauffällig' }],
  },
  fill: {
    title: 'Füllzeichen',
    text: 'Füllt die Titelzeile mit diesem Zeichen auf, sodass sie als Trennlinie wirkt. Das hilft beim Überfliegen des Protokolltexts. Leer bedeutet: keine Linie.',
    examples: [{ label: 'Füllzeichen „=“', output: '# Anamnese =========' }],
  },
  width: {
    title: 'Breite',
    text: 'Wie lang die Linie wird, gemessen in Zeichen. Ist das Textfeld im Zielgerät schmaler, bricht die Linie um und wirkt zerrissen. Dann wähle einen kleineren Wert.',
  },
  fillMode: {
    title: 'Füllzeichen-Bezug',
    text: 'Legt fest, worauf sich die Breite bezieht.',
    examples: [
      { label: 'Inklusive: ganze Zeile, alle Linien enden gleich', output: '# Anamnese =========\n# Verlauf ==========' },
      { label: 'Exklusive: nur die Füllzeichen, längere Titel ragen weiter', output: '# Anamnese =====\n# Verlauf =====' },
    ],
  },
  blankLineBefore: {
    title: 'Absatz davor',
    text: 'Setzt eine Leerzeile über diese Überschrift, wenn darüber schon etwas steht. So trennst du Bereiche optisch, der Protokolltext wird aber länger.',
    examples: [{ label: 'Mit Absatz', output: 'Puls: 80\n\n# Verlauf' }, { label: 'Ohne Absatz', output: 'Puls: 80\n# Verlauf' }],
  },
  inline: {
    title: 'Inline',
    text: 'Hängt dieses Element an das vorherige an, statt eine neue Zeile zu beginnen. Das spart Platz, die Angaben stehen aber dicht hintereinander. Dazwischen steht der Feld-Trenner des Abschnitts.',
    examples: [{ label: 'Inline', output: 'Puls: 80, RR: 120/80' }, { label: 'Nicht inline', output: 'Puls: 80\nRR: 120/80' }],
  },
  noSeparatorBefore: {
    title: 'Kein Trenner davor',
    text: 'Lässt den Feld-Trenner vor diesem Element weg, es klebt direkt am vorherigen. Für Angaben, die zusammengehören, z. B. Wert und Einheit.',
    examples: [{ label: 'Ohne Trenner', output: 'Puls: 80/min' }, { label: 'Mit Trenner', output: 'Puls: 80, /min' }],
  },
  separator: {
    title: 'Feld-Trenner',
    text: 'Steht zwischen Elementen, die inline hintereinander stehen. Er gilt für diesen Abschnitt und alles darin, solange dort kein eigener gesetzt ist. Eine Änderung wirkt also auf alle diese Zeilen.',
    examples: [{ label: 'Trenner „, “', output: 'Kein Stridor, Keine Dyspnoe' }, { label: 'Trenner „. “', output: 'Kein Stridor. Keine Dyspnoe' }],
  },
  emptyText: {
    title: 'Text wenn leer',
    text: 'Steht im Protokolltext, wenn der Abschnitt angezeigt wird, seine Felder aber nichts ausgeben. Sonst bliebe nur die Überschrift stehen.',
    examples: [{ label: 'Mit Text', output: 'Verlauf\nunauffällig' }, { label: 'Ohne Text', output: 'Verlauf' }],
  },
  rowLayout: {
    title: 'Hintereinander',
    text: 'Schreibt alle Einträge in eine Zeile. Das spart bei vielen Einträgen Platz, ist aber schwerer zu lesen.',
    examples: [{ label: 'Hintereinander', output: 'Medikament A · Medikament B' }, { label: 'Untereinander', output: 'Medikament A\nMedikament B' }],
  },
  rowSeparator: {
    title: 'Trenner zwischen Einträgen',
    text: 'Steht zwischen den Einträgen, wenn sie in einer Zeile stehen. Standard ist der Mittelpunkt, weil innerhalb eines Eintrags schon Kommas vorkommen können.',
    examples: [{ label: 'Trenner „; “', output: 'Medikament A; Medikament B' }],
  },
  rowPrefix: {
    title: 'Präfix je Zeile',
    text: 'Steht vor jedem Eintrag, z. B. als Aufzählungszeichen.',
    examples: [{ label: 'Präfix „- “', output: '- Medikament A\n- Medikament B' }],
  },
  rowSuffix: {
    title: 'Suffix je Zeile',
    text: 'Steht hinter jedem Eintrag, z. B. als Satzzeichen.',
    examples: [{ label: 'Suffix „;“', output: 'Medikament A;\nMedikament B;' }],
  },
} satisfies Record<string, InfoText>

export type InfoSegment = { text: string } | { tab: TabName }

/** Zerlegt einen ⓘ-Text in Fliesstext und Tab-Verweise. */
export function infoSegments(text: string): InfoSegment[] {
  const out: InfoSegment[] = []
  let last = 0
  for (const m of text.matchAll(/\{(einsatz|vorlagen|bausteine|einstellungen)\}/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ tab: m[1] as TabName })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
