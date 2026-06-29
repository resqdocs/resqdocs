TOKEN: rd-fmt-v1-353a0a49

# ResQDocs Protokoll-Format — Referenz für die KI-Vorlagen-Erstellung

Diese Datei ist die vollständige, autoritative Referenz, mit der du einem Nutzer hilfst, eine ResQDocs-Protokoll-**Vorlage** als JSON zu bauen. Es geht **nur um die Struktur** (Abschnitte, Felder, Layout), **nie** um Patientendaten. Format: `resqdocs-protocol` v1.

## 1. Wrapper
Eine Vorlage ist genau dieses JSON-Objekt:
```json
{ "schema": "resqdocs-protocol", "version": 1, "tree": <Container> }
```
`schema` und `version` sind konstant; `tree` ist der Wurzel-Container.

## 2. JSON-Schema (maschinenlesbar, generiert aus model.ts)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ai.resqdocs.app/schema.json",
  "title": "ResQDocs Protokoll (Format v1)",
  "description": "Format fuer KI-erzeugte Protokoll-Vorlagen. GENERIERT aus packages/shared/model.ts - nicht von Hand editieren.",
  "type": "object",
  "required": [
    "schema",
    "version",
    "tree"
  ],
  "additionalProperties": false,
  "properties": {
    "schema": {
      "const": "resqdocs-protocol"
    },
    "version": {
      "const": 1
    },
    "tree": {
      "$ref": "#/definitions/Container"
    }
  },
  "definitions": {
    "Container": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "container"
        },
        "id": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "showTitle": {
          "type": "boolean",
          "description": "Titel in der AUSGABE zeigen? (Im Editor immer sichtbar.)"
        },
        "titleInline": {
          "type": "boolean",
          "description": "Titel inline vor dem Inhalt (kein Fuellzeichen/Breite) statt eigener Zeile. Bei showTitle."
        },
        "heading": {
          "$ref": "#/definitions/Heading"
        },
        "collapsible": {
          "type": "boolean",
          "description": "Option: im Einsatz einklappbar."
        },
        "excludable": {
          "type": "boolean",
          "description": "Option: im Einsatz als „nicht erhoben\" (excluded) markierbar -> 2-stufiger Status (✓ / −). Bei − entfaellt der ganze Container (inkl. Kinder) in der Ausgabe."
        },
        "inline": {
          "type": "boolean",
          "description": "Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen)."
        },
        "noSeparatorBefore": {
          "type": "boolean",
          "description": "Kein Feld-Trenner VOR diesem Element (klebt ans vorherige inline-Element)."
        },
        "blankLineBefore": {
          "type": "boolean",
          "description": "Optische Leerzeile (Absatz) VOR diesem Element - nur wirksam, wenn darueber etwas ausgegeben wird. Gedacht fuer Banner/Trenner, um Abschnitte sichtbar zu trennen."
        },
        "separator": {
          "type": "string",
          "description": "Feld-Trenner zwischen inline-Geschwistern: zentral an der Wurzel; vererbt sich nach unten, ein Container kann ihn fuer seinen Teilbaum ueberschreiben. Fehlt -> DEFAULT_SEPARATOR."
        },
        "emptyText": {
          "type": "string",
          "description": "Optionaler Ersatztext in der AUSGABE, wenn der Container ANGEZEIGT wird, seine Kinder aber nichts ausgeben (alle leer/nicht erhoben). Fehlt -> kein Ersatz (leer bleibt leer)."
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/Node"
          }
        }
      },
      "required": [
        "type",
        "id",
        "children"
      ],
      "additionalProperties": false
    },
    "Heading": {
      "type": "object",
      "properties": {
        "prefix": {
          "type": "string"
        },
        "suffix": {
          "type": "string"
        },
        "fill": {
          "type": "string"
        },
        "width": {
          "type": "number"
        },
        "fillMode": {
          "$ref": "#/definitions/FillMode"
        }
      },
      "required": [
        "prefix",
        "suffix",
        "fill",
        "width",
        "fillMode"
      ],
      "additionalProperties": false,
      "description": "Ueberschriften-/Titel-Format: prefix/suffix unabhaengig, Fuellzeichen + Breite (nur Container- Banner), Bezug inklusive/exklusive. Beim FELD wirken nur prefix/suffix (kein Banner)."
    },
    "FillMode": {
      "type": "string",
      "enum": [
        "inclusive",
        "exclusive"
      ]
    },
    "Node": {
      "anyOf": [
        {
          "$ref": "#/definitions/Container"
        },
        {
          "$ref": "#/definitions/Field"
        },
        {
          "$ref": "#/definitions/FunctionNode"
        }
      ]
    },
    "Field": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "field"
        },
        "id": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "showTitle": {
          "type": "boolean",
          "description": "Titel in der AUSGABE zeigen? (Default aus.) Bei an: prefix+title+suffix vor dem Wert."
        },
        "heading": {
          "$ref": "#/definitions/Heading",
          "description": "Titel-Format. Bei „Titel auf eigener Zeile\" (titleInline===false, oder mehrzeilig per Default) wirkt der VOLLE Banner (Fuellzeichen/Breite/Bezug) wie beim Container; sonst nur prefix/suffix."
        },
        "titleInline": {
          "type": "boolean",
          "description": "„Trenner-Funktion\": Titel als eigene (Banner-)Zeile, der Wert rutscht in die naechste Zeile. titleInline===false = Banner an; true = inline (Titel+Wert auf einer Zeile). Fehlt -> inline, AUSSER das Feld ist mehrzeilig (dann per Default eigene Zeile)."
        },
        "default": {
          "type": "string",
          "description": "Standardwert."
        },
        "inline": {
          "type": "boolean",
          "description": "Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen)."
        },
        "noSeparatorBefore": {
          "type": "boolean",
          "description": "Kein Feld-Trenner VOR diesem Feld (klebt ans vorherige inline-Element, z. B. Wert+Einheit)."
        },
        "blankLineBefore": {
          "type": "boolean",
          "description": "Optische Leerzeile (Absatz) VOR diesem Feld - nur wirksam, wenn darueber etwas ausgegeben wird."
        },
        "options": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Vordefinierte Auswahl-Optionen. Gesetzt -> das Feld ist ein SELECT (Wert = Ausgabetext). Tri-State unveraendert: ✓ = default (sonst options[0]), ✎ = Option waehlen/Freitext, − = entfaellt."
        },
        "allowCustom": {
          "type": "boolean",
          "description": "Bei einem Select zusaetzlich „individuell\" -> Freitext anbieten (Default aus)."
        },
        "multiline": {
          "type": "boolean",
          "description": "Freitext mehrzeilig erfassen: im ✎-Modus ein grosses Textfeld (Sheet) statt einzeiligem <input>\n- fuer lange Eingaben (Anamnese, Verlauf). Nur OHNE options wirksam (Select hat keine Freitext-Haupteingabe). Wert bleibt ein String (mit Zeilenumbruechen); Renderer unveraendert."
        }
      },
      "required": [
        "type",
        "id"
      ],
      "additionalProperties": false
    },
    "FunctionNode": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "const": "function"
        },
        "id": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "showTitle": {
          "type": "boolean",
          "description": "Titel in der AUSGABE zeigen? (Default an.)"
        },
        "titleInline": {
          "type": "boolean",
          "description": "Titel inline vor dem Inhalt (kein Banner) statt eigener Zeile - analog Container."
        },
        "heading": {
          "$ref": "#/definitions/Heading",
          "description": "Titel-Format (prefix/suffix + Banner Fuellzeichen/Breite wie beim Container)."
        },
        "blankLineBefore": {
          "type": "boolean",
          "description": "Optische Leerzeile (Absatz) VOR der Funktion - nur wenn darueber etwas ausgegeben wird."
        },
        "functionKind": {
          "$ref": "#/definitions/FunctionKind"
        },
        "config": {
          "$ref": "#/definitions/FunctionConfig",
          "description": "Ausgabe-Formatierung der Funktions-Zeilen (Layout/Trenner/Praefix/Suffix)."
        }
      },
      "required": [
        "type",
        "id",
        "functionKind"
      ],
      "additionalProperties": false
    },
    "FunctionKind": {
      "type": "string",
      "enum": [
        "medikamentenplan",
        "aerzte"
      ],
      "description": "Funktions-Knoten: ein BLATT mit eigener Einsatz-UI + eigenem Wert (erste Funktion: Medikamentenplan). functionKind = innerer Diskriminator (waechst), aufgeloest ueber die Funktions-Registry. Immer Block."
    },
    "FunctionConfig": {
      "type": "object",
      "properties": {
        "rowLayout": {
          "type": "string",
          "enum": [
            "block",
            "inline"
          ],
          "description": "untereinander (block, je Zeile eigene Zeile) vs hintereinander (inline, mit Separator). Default 'block'."
        },
        "rowSeparator": {
          "type": "string",
          "description": "Trenner zwischen Zeilen bei rowLayout='inline'. Frei waehlbar. Fehlt -> DEFAULT_SEPARATOR."
        },
        "rowPrefix": {
          "type": "string",
          "description": "Praefix je Zeile bei rowLayout='block'."
        },
        "rowSuffix": {
          "type": "string",
          "description": "Suffix je Zeile bei rowLayout='block'."
        }
      },
      "additionalProperties": false,
      "description": "Zeilen-Layout-Konfiguration einer Funktion (pro functionKind in der Registry interpretiert). Alle Felder optional + primitiv -> JSON-Roundtrip trivial; fehlt -> heutiges Verhalten (block, ohne pre/suf)."
    }
  }
}
```

## 3. Knoten-Typen & alle Felder
Drei Knoten-Typen: **Container** (Abschnitt mit Kindern), **Field** (Eingabefeld), **FunctionNode** (Spezial-Funktion wie Medikamentenplan/Ärzte). Hier **alle** Felder mit Pflicht/optional und Bedeutung:

#### Container — Abschnitt mit Kindern (children)
- `type` (immer "container") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean): Titel in der AUSGABE zeigen? (Im Editor immer sichtbar.)
- `titleInline` (boolean): Titel inline vor dem Inhalt (kein Fuellzeichen/Breite) statt eigener Zeile. Bei showTitle.
- `heading` (Heading)
- `collapsible` (boolean): Option: im Einsatz einklappbar.
- `excludable` (boolean): Option: im Einsatz als „nicht erhoben" (excluded) markierbar -> 2-stufiger Status (✓ / −). Bei − entfaellt der ganze Container (inkl. Kinder) in der Ausgabe.
- `inline` (boolean): Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen).
- `noSeparatorBefore` (boolean): Kein Feld-Trenner VOR diesem Element (klebt ans vorherige inline-Element).
- `blankLineBefore` (boolean): Optische Leerzeile (Absatz) VOR diesem Element - nur wirksam, wenn darueber etwas ausgegeben wird. Gedacht fuer Banner/Trenner, um Abschnitte sichtbar zu trennen.
- `separator` (string): Feld-Trenner zwischen inline-Geschwistern: zentral an der Wurzel; vererbt sich nach unten, ein Container kann ihn fuer seinen Teilbaum ueberschreiben. Fehlt -> DEFAULT_SEPARATOR.
- `emptyText` (string): Optionaler Ersatztext in der AUSGABE, wenn der Container ANGEZEIGT wird, seine Kinder aber nichts ausgeben (alle leer/nicht erhoben). Fehlt -> kein Ersatz (leer bleibt leer).
- `children` (Liste) — Pflicht

#### Field — Eingabefeld
- `type` (immer "field") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean): Titel in der AUSGABE zeigen? (Default aus.) Bei an: prefix+title+suffix vor dem Wert.
- `heading` (Heading): Titel-Format. Bei „Titel auf eigener Zeile" (titleInline===false, oder mehrzeilig per Default) wirkt der VOLLE Banner (Fuellzeichen/Breite/Bezug) wie beim Container; sonst nur prefix/suffix.
- `titleInline` (boolean): „Trenner-Funktion": Titel als eigene (Banner-)Zeile, der Wert rutscht in die naechste Zeile. titleInline===false = Banner an; true = inline (Titel+Wert auf einer Zeile). Fehlt -> inline, AUSSER das Feld ist mehrzeilig (dann per Default eigene Zeile).
- `default` (string): Standardwert.
- `inline` (boolean): Layout relativ zum vorhergehenden Geschwister: block (Default, neue Zeile) vs inline (anhaengen).
- `noSeparatorBefore` (boolean): Kein Feld-Trenner VOR diesem Feld (klebt ans vorherige inline-Element, z. B. Wert+Einheit).
- `blankLineBefore` (boolean): Optische Leerzeile (Absatz) VOR diesem Feld - nur wirksam, wenn darueber etwas ausgegeben wird.
- `options` (Liste von string): Vordefinierte Auswahl-Optionen. Gesetzt -> das Feld ist ein SELECT (Wert = Ausgabetext). Tri-State unveraendert: ✓ = default (sonst options[0]), ✎ = Option waehlen/Freitext, − = entfaellt.
- `allowCustom` (boolean): Bei einem Select zusaetzlich „individuell" -> Freitext anbieten (Default aus).
- `multiline` (boolean): Freitext mehrzeilig erfassen: im ✎-Modus ein grosses Textfeld (Sheet) statt einzeiligem <input> - fuer lange Eingaben (Anamnese, Verlauf). Nur OHNE options wirksam (Select hat keine Freitext-Haupteingabe). Wert bleibt ein String (mit Zeilenumbruechen); Renderer unveraendert.

#### FunctionNode — Spezial-Funktion (functionKind: "medikamentenplan", "aerzte")
- `type` (immer "function") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean): Titel in der AUSGABE zeigen? (Default an.)
- `titleInline` (boolean): Titel inline vor dem Inhalt (kein Banner) statt eigener Zeile - analog Container.
- `heading` (Heading): Titel-Format (prefix/suffix + Banner Fuellzeichen/Breite wie beim Container).
- `blankLineBefore` (boolean): Optische Leerzeile (Absatz) VOR der Funktion - nur wenn darueber etwas ausgegeben wird.
- `functionKind` (eines von "medikamentenplan", "aerzte") — Pflicht
- `config` (FunctionConfig): Ausgabe-Formatierung der Funktions-Zeilen (Layout/Trenner/Praefix/Suffix).

#### Heading — Titel-/Banner-Format (optional, fuer das Feld "heading")
- `prefix` (string) — Pflicht
- `suffix` (string) — Pflicht
- `fill` (string) — Pflicht
- `width` (number) — Pflicht
- `fillMode` (eines von "inclusive", "exclusive") — Pflicht

#### FunctionConfig — Ausgabe-Format einer Funktion (optional, fuer das Feld "config")
- `rowLayout` (eines von "block", "inline"): untereinander (block, je Zeile eigene Zeile) vs hintereinander (inline, mit Separator). Default 'block'.
- `rowSeparator` (string): Trenner zwischen Zeilen bei rowLayout='inline'. Frei waehlbar. Fehlt -> DEFAULT_SEPARATOR.
- `rowPrefix` (string): Praefix je Zeile bei rowLayout='block'.
- `rowSuffix` (string): Suffix je Zeile bei rowLayout='block'.

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
### granular
```json
{
  "schema": "resqdocs-protocol",
  "version": 1,
  "tree": {
    "type": "container",
    "id": "einsatzprotokoll",
    "title": "Einsatzprotokoll",
    "showTitle": true,
    "children": [
      {
        "type": "container",
        "id": "vitalwerte",
        "title": "Vitalwerte",
        "showTitle": true,
        "collapsible": true,
        "children": [
          { "type": "field", "id": "rr", "title": "RR", "showTitle": true },
          { "type": "field", "id": "puls", "title": "Puls", "showTitle": true, "inline": true },
          { "type": "field", "id": "spo2", "title": "SpO2", "showTitle": true, "inline": true }
        ]
      },
      {
        "type": "container",
        "id": "anamnese",
        "title": "Anamnese",
        "showTitle": true,
        "excludable": true,
        "children": [
          { "type": "field", "id": "schmerz", "title": "Schmerz", "showTitle": true, "options": ["kein", "leicht", "mittel", "stark"], "allowCustom": true },
          { "type": "field", "id": "vorerkrankungen", "title": "Vorerkrankungen", "showTitle": true, "multiline": true }
        ]
      },
      {
        "type": "function",
        "id": "medikamente",
        "title": "Medikamentenplan",
        "showTitle": true,
        "functionKind": "medikamentenplan",
        "config": { "rowLayout": "inline", "rowSeparator": " · " }
      }
    ]
  }
}
```

### mit-funktionen
```json
{
  "schema": "resqdocs-protocol",
  "version": 1,
  "tree": {
    "type": "container",
    "id": "transportprotokoll",
    "title": "Transportprotokoll",
    "children": [
      {
        "type": "container",
        "id": "stammdaten",
        "title": "Stammdaten",
        "showTitle": true,
        "children": [
          { "type": "field", "id": "einsatznummer", "title": "Einsatznummer", "showTitle": true }
        ]
      },
      {
        "type": "container",
        "id": "medikation",
        "title": "Medikation & Ärzte",
        "showTitle": true,
        "children": [
          { "type": "function", "id": "medplan", "title": "Medikamentenplan", "showTitle": true, "functionKind": "medikamentenplan" },
          { "type": "function", "id": "aerzteliste", "title": "Behandelnde Ärzte", "showTitle": true, "functionKind": "aerzte", "config": { "rowLayout": "block" } }
        ]
      }
    ]
  }
}
```

### simple
```json
{
  "schema": "resqdocs-protocol",
  "version": 1,
  "tree": {
    "type": "container",
    "id": "akutprotokoll",
    "title": "Akutprotokoll",
    "children": [
      {
        "type": "container",
        "id": "patient",
        "title": "Patientenangaben",
        "showTitle": true,
        "children": [
          { "type": "field", "id": "alter", "title": "Alter", "showTitle": true },
          { "type": "field", "id": "geschlecht", "title": "Geschlecht", "showTitle": true, "options": ["männlich", "weiblich", "divers"] }
        ]
      },
      {
        "type": "container",
        "id": "befund",
        "title": "Befund",
        "showTitle": true,
        "children": [
          { "type": "field", "id": "bewusstsein", "title": "Bewusstsein", "showTitle": true, "default": "wach, orientiert" },
          { "type": "field", "id": "anamnese", "title": "Anamnese", "showTitle": true, "multiline": true }
        ]
      }
    ]
  }
}
```
