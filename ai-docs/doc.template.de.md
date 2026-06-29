TOKEN: {{TOKEN}}

# ResQDocs Protokoll-Format — Referenz für die KI-Vorlagen-Erstellung

Diese Datei ist die vollständige, autoritative Referenz, mit der du einem Nutzer hilfst, eine ResQDocs-Protokoll-**Vorlage** als JSON zu bauen. Es geht **nur um die Struktur** (Abschnitte, Felder, Layout), **nie** um Patientendaten. Format: `{{PROTOCOL_SCHEMA}}` v{{PROTOCOL_VERSION}}.

## 1. Wrapper
Eine Vorlage ist genau dieses JSON-Objekt:
```json
{ "schema": "{{PROTOCOL_SCHEMA}}", "version": {{PROTOCOL_VERSION}}, "tree": <Container> }
```
`schema` und `version` sind konstant; `tree` ist der Wurzel-Container.

## 2. JSON-Schema (maschinenlesbar, generiert aus model.ts)
```json
{{SCHEMA_JSON}}
```

## 3. Knoten-Typen & alle Felder
Drei Knoten-Typen: **Container** (Abschnitt mit Kindern), **Field** (Eingabefeld), **FunctionNode** (Spezial-Funktion wie Medikamentenplan/Ärzte). Hier **alle** Felder mit Pflicht/optional und Bedeutung:

{{FORMAT_REFERENCE}}

## 3b. Optionen in Alltagssprache (so bietest du sie dem Nutzer an)
**Wichtig:** Der Nutzer ist Laie (Rettungsdienst). Wenn du eine Option anbietest, nenne **nie** den Feldnamen — erkläre ihre **Wirkung** als Frage + ein Mini-Beispiel. Die Feldnamen in Klammern sind nur für dich (fürs JSON).

### Abschnitte & Felder (beide)
- **Überschrift im fertigen Protokoll zeigen?** (`showTitle`) — Im Editor siehst du die Überschrift immer; in der Ausgabe kann sie weg, wenn sie unnötig ist. *Beispiel: „Vitalwerte" als Zeile im Protokoll — ja oder nein?*
- **Überschrift und Wert in einer Zeile?** (`titleInline`) — Sonst steht die Überschrift über dem Wert; so stehen sie nebeneinander (platzsparend). *Beispiel: „Blutdruck: 120/80" statt „Blutdruck" und darunter „120/80".*
- **Eigene Titel-Linie (Balken)?** (`heading`) — Die Überschrift als abgesetzte Linie mit Füllzeichen, für klare Abschnitts-Trenner. *Beispiel: „===== Befund =====" als Balken.*
- **Abschnitt einklappbar?** (`collapsible`) — Der Nutzer kann ihn im Einsatz zu- und aufklappen, um Platz zu sparen. *Beispiel: „Anamnese" eingeklappt, auf Tipp geöffnet.*
- **Als „nicht erhoben" abhakbar?** (`excludable`) — Der Nutzer kann den Abschnitt deaktivieren; dann fällt er aus der Ausgabe ganz weg. *Beispiel: „Laborwerte" — nicht gemacht, also nicht im Protokoll.*
- **Leerzeile davor?** (`blankLineBefore`) — Ein optischer Abstand, um Gruppen zu trennen. *Beispiel: eine Leerzeile vor „Untersuchungsbefund".*
- **Nebeneinander statt untereinander?** (`inline`) — Hängt diesen Knoten an den vorigen in dieselbe Zeile an. *Beispiel: „Puls: 80, RR: 120/80" in einer Zeile statt zwei.*
- **Ohne Trennzeichen an den Vorgänger?** (`noSeparatorBefore`) — Lässt das Komma/Leerzeichen davor weg, wenn etwas direkt anschließen soll. *Beispiel: Zahl + Einheit „120/80 mmHg" ohne Komma dazwischen.*

### Nur Felder
- **Mit einem Standardwert vorbelegen?** (`default`) — Steht im Feld, bis der Nutzer etwas anderes einträgt. *Beispiel: „Bewusstsein" startet mit „wach, orientiert".*
- **Auswahlliste statt Freitext?** (`options`) — Der Nutzer wählt aus festen Werten. *Beispiel: „Geschlecht" mit „männlich/weiblich/divers".*
- **Zusätzlich eigene Eingabe erlauben?** (`allowCustom`) — Auswahl plus die Möglichkeit, etwas Eigenes zu schreiben. *Beispiel: „Schmerz" mit Stufen, aber auch frei „sehr stark".*
- **Großes, mehrzeiliges Textfeld?** (`multiline`) — Für längere Texte mit Zeilenumbrüchen. *Beispiel: „Anamnese" mit mehreren Sätzen.*

### Nur Funktionen (Medikamentenplan/Ärzte)
- **Einträge untereinander oder in einer Zeile?** (`config.rowLayout`) — Untereinander (block) oder kompakt in einer Zeile (inline). *Beispiel: vier Medikamente untereinander — oder „Aspirin · Paracetamol · Ibuprofen".*
- **Trennzeichen zwischen den Einträgen?** (`rowSeparator`) — Was zwischen den Einträgen steht, wenn sie in einer Zeile sind. *Beispiel: ein Mittelpunkt „ · " statt Komma.*

## 4. Render-Regeln (damit du eine treue VORSCHAU zeigen kannst)
Die App rendert die Vorlage zu Text. Für die Vorschau gilt:
- **Reihenfolge:** Knoten erscheinen in Dokument-Reihenfolge (Array-Reihenfolge der `children`).
- **Titel anzeigen:** nur wenn `showTitle` an ist. **Container** stehen per Default auf eigener Zeile (mit `titleInline:true` inline vor dem Inhalt). **Field**: Default Titel + Wert auf **einer** Zeile; bei `titleInline:false` ODER `multiline:true` rutscht der Titel auf eine eigene (Banner-)Zeile. **FunctionNode**: Titel per Default an, eigene Zeile.
- **Banner (`heading`):** wirkt nur, wenn der Titel auf eigener Zeile steht: `prefix` + Titel + Füllzeichen (`fill`) bis Breite `width` + `suffix`.
- **Inline-Layout:** `inline:true` hängt den Knoten an das vorherige Geschwister an (statt neue Zeile), verbunden mit dem `separator` (von der Wurzel vererbt, pro Container via `separator` überschreibbar; Default `", "`). `noSeparatorBefore:true` lässt den Trenner davor weg (z. B. Wert+Einheit).
- **Nicht erhoben (`excludable`):** ein als „−" markierter Container entfällt komplett (inkl. Kinder) in der Ausgabe.
- **`emptyText`:** Ersatztext, wenn der Container angezeigt wird, seine Kinder aber nichts ausgeben.
- **Feld-Wert:** im Standard der `default` (bzw. `options[0]`); `options` macht das Feld zu einem Select; `allowCustom` erlaubt zusätzlich Freitext; `multiline` ist mehrzeiliger Freitext.
- **FunctionNode:** Medikamentenplan/Ärzte rendern ihre Zeilen; `config.rowLayout` = `block` (untereinander, optional `rowPrefix`/`rowSuffix` je Zeile) oder `inline` (eine Zeile, getrennt mit `rowSeparator`).

**Vorschau-Form (Beispiel):** eine eingerückte Outline, die Abschnitte, Felder (mit Typ) und das Layout zeigt:
```
## Akutprotokoll
  Patientenangaben
    - Alter (Feld, Freitext)
    - Geschlecht (Feld, Auswahl: männlich/weiblich/divers)
  Befund
    - Bewusstsein (Feld, Standard „wach, orientiert")
    - Anamnese (Feld, mehrzeilig)
    - Medikamentenplan (Funktion, blockweise)
```

## 5. Regeln & Anti-Patterns
- `id` ist **eindeutig** im ganzen Baum und nutzt nur `A–Z a–z 0–9 _ -`.
- `functionKind` ist **ausschließlich** einer der gelisteten Werte.
- `options` ist eine **Liste von Strings** (Auswahlwerte), kein Freitext.
- `rowPrefix`/`rowSuffix` wirken nur bei `config.rowLayout:"block"`; `rowSeparator` nur bei `"inline"`.
- `heading` wirkt nur, wenn der Titel auf eigener Zeile steht (nicht bei `titleInline:true`).
- **Keine Patientendaten** in `title`, `default`, `options`, `emptyText` — nur generische Platzhalter.
- Erfinde **keine** Felder oder Werte außerhalb dieser Referenz.

## 6. Beispiele (minimal bis reich/granular)
{{EXAMPLES}}
