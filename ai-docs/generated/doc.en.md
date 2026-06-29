TOKEN: rd-fmt-v1-353a0a49

# ResQDocs protocol format — reference for AI template creation

This file is the complete, authoritative reference you use to help a user build a ResQDocs protocol **template** as JSON. It is **only about the structure** (sections, fields, layout), **never** about patient data. Format: `resqdocs-protocol` v1. (Field names are German — they are the literal JSON keys.)

## 1. Wrapper
A template is exactly this JSON object:
```json
{ "schema": "resqdocs-protocol", "version": 1, "tree": <Container> }
```
`schema` and `version` are constant; `tree` is the root container.

## 2. JSON schema (machine-readable, generated from model.ts)
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

## 3. Node types & all fields
Three node types: **Container** (section with children), **Field** (input field), **FunctionNode** (special function like medication list / doctors). Here are **all** fields with required/optional and their type:

#### Container — Abschnitt mit Kindern (children)
- `type` (immer "container") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean)
- `titleInline` (boolean)
- `heading` (Heading)
- `collapsible` (boolean)
- `excludable` (boolean)
- `inline` (boolean)
- `noSeparatorBefore` (boolean)
- `blankLineBefore` (boolean)
- `separator` (string)
- `emptyText` (string)
- `children` (Liste) — Pflicht

#### Field — Eingabefeld
- `type` (immer "field") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean)
- `heading` (Heading)
- `titleInline` (boolean)
- `default` (string)
- `inline` (boolean)
- `noSeparatorBefore` (boolean)
- `blankLineBefore` (boolean)
- `options` (Liste von string)
- `allowCustom` (boolean)
- `multiline` (boolean)

#### FunctionNode — Spezial-Funktion (functionKind: "medikamentenplan", "aerzte")
- `type` (immer "function") — Pflicht
- `id` (string) — Pflicht
- `title` (string)
- `showTitle` (boolean)
- `titleInline` (boolean)
- `heading` (Heading)
- `blankLineBefore` (boolean)
- `functionKind` (eines von "medikamentenplan", "aerzte") — Pflicht
- `config` (FunctionConfig)

#### Heading — Titel-/Banner-Format (optional, fuer das Feld "heading")
- `prefix` (string) — Pflicht
- `suffix` (string) — Pflicht
- `fill` (string) — Pflicht
- `width` (number) — Pflicht
- `fillMode` (eines von "inclusive", "exclusive") — Pflicht

#### FunctionConfig — Ausgabe-Format einer Funktion (optional, fuer das Feld "config")
- `rowLayout` (eines von "block", "inline")
- `rowSeparator` (string)
- `rowPrefix` (string)
- `rowSuffix` (string)

## 3b. Options in plain language (how to offer them to the user)
**Important:** The user is a layperson (ambulance service). When you offer an option, **never** name the field name — explain its **effect** as a question + a mini-example. The field names in parentheses are for you only (for the JSON).

### Sections & fields (both)
- **Show the title in the finished report?** (`showTitle`) — In the editor you always see the title; in the output it can be hidden if unnecessary. *Example: "Vital signs" as a line in the report — yes or no?*
- **Title and value on one line?** (`titleInline`) — Otherwise the title sits above the value; this puts them side by side (space-saving). *Example: "Blood pressure: 120/80" instead of "Blood pressure" with "120/80" below.*
- **Own title line (banner)?** (`heading`) — The title as a separate line with fill characters, for clear section dividers. *Example: "===== Findings =====" as a bar.*
- **Make the section collapsible?** (`collapsible`) — The user can collapse and expand it during use to save space. *Example: "Anamnesis" collapsed, opened on tap.*
- **Allow marking as "not collected"?** (`excludable`) — The user can disable the section; it then disappears entirely from the output. *Example: "Lab results" — not done, so not in the report.*
- **Blank line before it?** (`blankLineBefore`) — Visual spacing to separate groups. *Example: a blank line before "Examination findings".*
- **Side by side instead of stacked?** (`inline`) — Appends this node to the previous one on the same line. *Example: "Pulse: 80, BP: 120/80" on one line instead of two.*
- **No separator before it?** (`noSeparatorBefore`) — Drops the comma/space before it when something should attach directly. *Example: number + unit "120/80 mmHg" without a comma between.*

### Fields only
- **Pre-fill with a default value?** (`default`) — Stays in the field until the user enters something else. *Example: "Consciousness" starts with "awake, oriented".*
- **Choice list instead of free text?** (`options`) — The user picks from fixed values. *Example: "Gender" with "male/female/diverse".*
- **Also allow custom input?** (`allowCustom`) — Choice plus the option to write something of their own. *Example: "Pain" with levels, but also free "very severe".*
- **Large, multi-line text field?** (`multiline`) — For longer texts with line breaks. *Example: "Anamnesis" with several sentences.*

### Functions only (medication list / doctors)
- **Entries stacked or on one line?** (`config.rowLayout`) — Stacked (block) or compact on one line (inline). *Example: four medications stacked — or "Aspirin · Paracetamol · Ibuprofen".*
- **Separator between entries?** (`rowSeparator`) — What goes between entries when on one line. *Example: a middle dot " · " instead of a comma.*

## 4. Rendering rules (so you can show a faithful PREVIEW)
The app renders the template to text. For the preview:
- **Order:** nodes appear in document order (the array order of `children`).
- **Show title:** only if `showTitle` is on. **Containers** are on their own line by default (with `titleInline:true` inline before the content). **Field**: by default title + value on **one** line; with `titleInline:false` OR `multiline:true` the title moves to its own (banner) line. **FunctionNode**: title on by default, own line.
- **Banner (`heading`):** only applies when the title is on its own line: `prefix` + title + fill character (`fill`) up to width `width` + `suffix`.
- **Inline layout:** `inline:true` appends the node to the previous sibling (instead of a new line), joined with the `separator` (inherited from the root, overridable per container via `separator`; default `", "`). `noSeparatorBefore:true` drops the separator before it (e.g. value+unit).
- **Excluded (`excludable`):** a container marked "−" disappears entirely (incl. children) from the output.
- **`emptyText`:** replacement text when the container is shown but its children output nothing.
- **Field value:** by default the `default` (or `options[0]`); `options` makes the field a select; `allowCustom` additionally allows free text; `multiline` is multi-line free text.
- **FunctionNode:** medication list / doctors render their rows; `config.rowLayout` = `block` (stacked, optional `rowPrefix`/`rowSuffix` per row) or `inline` (one line, joined with `rowSeparator`).

**Preview form (example):** an indented outline showing sections, fields (with type) and the layout:
```
## Akutprotokoll
  Patientenangaben
    - Alter (field, free text)
    - Geschlecht (field, choice: männlich/weiblich/divers)
  Befund
    - Bewusstsein (field, default "wach, orientiert")
    - Anamnese (field, multiline)
    - Medikamentenplan (function, block layout)
```

## 5. Rules & anti-patterns
- `id` is **unique** within the whole tree and uses only `A–Z a–z 0–9 _ -`.
- `functionKind` is **only** one of the listed values.
- `options` is a **list of strings** (choice values), not free text.
- `rowPrefix`/`rowSuffix` only apply with `config.rowLayout:"block"`; `rowSeparator` only with `"inline"`.
- `heading` only applies when the title is on its own line (not with `titleInline:true`).
- **No patient data** in `title`, `default`, `options`, `emptyText` — only generic placeholders.
- Do **not** invent fields or values outside this reference.

## 6. Examples (minimal to rich/granular)
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
