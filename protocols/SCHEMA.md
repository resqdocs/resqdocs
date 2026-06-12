# Protokoll-Datenmodell — Spezifikation (Entwurf, in Entwicklung)

> **Fundament-Spezifikation (S1).** Datenmodell eines **nutzerdefinierten** Protokolls: **Blöcke → Punkte**,
> mit **Variablen**, **Platzhaltern**, **Bedingungen (`visibleIf`)** und **optionalen Blöcken**. Grundlage für
> den Protokoll-Kreator (#13), den erweiterten Renderer (#12), den Composer und das spätere Teilen via JSON.
> Format ist **JSON**. Validierung: [`protocol.schema.json`](protocol.schema.json).
> Renderer: [`../packages/shared/renderer/render.mjs`](../packages/shared/renderer/render.mjs).

## Begriffe (Domäne ↔ Daten)

| Domäne | JSON-Key | Bedeutung |
|---|---|---|
| **Protokoll** | Wurzelobjekt | ein vollständiges, vom Nutzer erstelltes Protokoll |
| **Block** | `blocks[]` | Abschnitt mit Überschrift + Punkten |
| **Punkt** | `points[]` | einzelner Eintrag (Feld/Befund/Liste/Text …) |
| **Variable** | `variables[]` | benannter Wert (z. B. `geschlecht`), steuert Inhalt/Sichtbarkeit |
| **Vorlage vs. Einsatz** | — | Protokoll = **statische Vorlage**; ein **Einsatz (Case)** liefert Variablenwerte, Punkt-Übersteuerungen und aktivierte optionale Blöcke; der Renderer erzeugt Klartext. Die Vorlage wird **nie** mutiert. |

## Wurzelobjekt

```json
{
  "schemaVersion": "0.1.0",
  "id": "string (stabil, z. B. uuid/slug)",
  "title": "string",
  "lang": "de",
  "variables": [ Variable, ... ],
  "blocks":    [ Block, ... ]
}
```

## Variablen (alle vier Typen)

```json
Variable = {
  "id": "geschlecht",
  "label": "Geschlecht",
  "type": "select" | "boolean" | "text" | "number",
  "options": [ { "value": "w", "label": "weiblich" }, ... ],   // bei type "select"
  "default": "w",
  "grammar": "de-gender"                                        // optional: Grammatik-Tokens
}
```

| Typ | Eingabe | Nutzung |
|---|---|---|
| `select` | Auswahl aus `options` | z. B. Geschlecht; Wert in `visibleIf`/`{{var:…}}` |
| `boolean` | An/Aus | z. B. „Raucher"; mit `{ "var": …, "truthy": true }` |
| `text` | Freitext | wiederkehrender Begriff via `{{var:…}}` |
| `number` | Zahl | z. B. Alter; Vergleiche via `eq`/`in` |

`grammar: "de-gender"` (für eine `select`-Variable mit Werten `w`/`m`/`d`) stellt **abgeleitete Platzhalter** bereit.

## Platzhalter (in Texten/Standardinhalten)

Syntax `{{ name }}` (Leerzeichen optional). Erlaubt in `default`, `value`, `normal`, `content`, `entries`.

- **Variablenwert:** `{{var:geschlecht}}` → aktueller Wert bzw. `label` der gewählten Option.
- **Grammatik-Tokens** (`de-gender`): `{{patient}}`, `{{der_die}}`, `{{er_sie}}`, `{{sein_ihr}}`, `{{eine_einen}}`.
- **Unbekannter Platzhalter:** bleibt unverändert; der Editor warnt.

### Grammatik-Pack `de-gender`

| Token | w | m | d (neutral, überschreibbar) |
|---|---|---|---|
| `{{patient}}` | Patientin | Patient | Patient*in |
| `{{der_die}}` | die | der | der*die |
| `{{er_sie}}` | sie | er | er*sie |
| `{{sein_ihr}}` | ihr | sein | sein*ihr |
| `{{eine_einen}}` | eine | einen | eine*n |

## Bedingungen (`visibleIf`)

Deklarative, **sichere** Prädikate — **kein** JavaScript. Erlaubt an **Block** und **Punkt**. Fehlt `visibleIf`,
ist das Element immer sichtbar. Bedingungen wirken über **Variablen UND andere Punkt-Werte**.

```json
visibleIf = Predicate
Predicate =
  | { "var": "geschlecht", "eq": "w" }
  | { "var": "geschlecht", "in": ["w","d"] }
  | { "var": "raucher", "truthy": true }
  | { "point": "reanimation", "state": "abnormal" }   // Befund auffällig
  | { "point": "name",        "filled": true }        // Punkt hat einen Wert
  | { "point": "transport",   "eq": "verweigert" }    // Punkt-Wert gleich
  | { "all": [ Predicate, ... ] } | { "any": [ Predicate, ... ] } | { "not": Predicate }
```

Auswertung gegen den **aufgelösten Einsatz-Zustand** (Variablenwerte + Punkt-Werte/-Zustände).

## Block

```json
Block = { "id", "title", "optional"?, "visibleIf"?, "snippetSlot"?, "points": [ Punkt, ... ] }
```
- `title` ist zugleich der **Name** (Bibliotheks-/Picker-Label) — **kein** separates `name`-Feld.
- `optional: true` ⇒ Block ist **nicht** im Standardablauf, sondern wird **on-demand** eingesetzt
  (z. B. „Mitfahrtverweigerung"). Er rendert **nur**, wenn seine `id` im flüchtigen
  `caseState.activeBlocks` steht (zusätzlich greift `visibleIf`). Default `false`.

Rendert als Kopfzeile `# <title> ` + `=`-Auffüllung auf Breite 60, dann je sichtbarem Punkt eine Zeile.

## Punkt-Typen (`points`)

| `type` | Felder | Render | Zweck |
|--------|--------|--------|-------|
| `field` | `id, label?, default?, value?, options?, tool?, visibleIf?` | `- Label: Wert` | pro Einsatz gefüllter Wert; mit `options` = Auswahl |
| `finding` | `id, label?, normal, variants?, value?, state?, required?, visibleIf?` | `- [Label: ]Text` | Default-Normalbefund, schaltbar |
| `findingGroup` | `key, label?, collapsible?, findings:[finding], visibleIf?` | `Key: f1. f2. …` | xABCDE-Buchstabe, granular |
| `list` | `id, entries:[…], visibleIf?` | je Eintrag `- Eintrag` | Aufzählung |
| `text` | `id, content, visibleIf?` | `- Inhalt` | fixer Block (z. B. Aufklärung) |
| `medikamente` | `id, label?, visibleIf?` | `- Label:` + je Med. `Name: Dosierung - Kommentar` (ohne `-` voran) | Medikationsliste (#146): Zeilen `{name, dosierung, kommentar}` entstehen NUR im Einsatz (Vorlagen enthalten keine Patientendaten); BMP-Scan füllt vor; keine Zeile = weglassen |

- `finding.state` ∈ `{"normal","abnormal"}`.
- **Nicht erhoben (#71):** Einsatz-Override `{ "excluded": true }` an Feldern und Befunden nimmt den
  Punkt komplett aus der Ausgabe (Befund: auch aus dem Gruppensatz; ganze Gruppe leer ⇒ Key-Zeile
  entfällt). `filled`/`state`-Prädikate matchen dann nicht. Vorlage bleibt vollständig.
- `required` (alle Punkt-Typen, Default false): Pflichtpunkt - der Einsatz bietet „nicht erhoben"
  nicht an.
- **Alle Textfelder** (`default`, `value`, `normal`, `content`, `entries`) dürfen **Platzhalter** enthalten.
- `field.title` (#70): Anzeige-Titel für Editor/Einsatz - **wird nicht getippt**; das (ggf. leere) `label` ist der getippte Teil.
- `field.multiline` (#91): langer Freitext - im Einsatz Tap öffnet einen Modal-Editor. Optional.
- `field.options` (#74): Auswahlwerte; im Einsatz als **Combobox** (antippen oder frei tippen). Optional, abwärtskompatibel.
- `field.tool` (#54): id eines **Feld-Tools** aus der App-Registry (z. B. `medplanScan`; geplant:
  `packYears`, `bmi`, `lams`, `news2`). Die Einsatzansicht rendert das Tool unter dem Feld; das
  Ergebnis wird an den Feldinhalt angehängt. **Reines UI-Feature** - Renderer und Ausgabe sind
  unberührt; unbekannte ids werden ignoriert (abwärtskompatibel).

## Block-Bibliothek (nutzer-global, App-Ebene)

Wiederverwendbare Blöcke (z. B. „Mitfahrtverweigerung") liegen als **nutzer-globale Bibliothek** im persistenten
`library`-Store (neutrale Daten → erlaubt). Beim Einsetzen in ein Protokoll wird ein Bibliotheksblock **kopiert**
(neue, eindeutige Block-`id`) — **nicht** referenziert. So bleibt ein geteiltes Protokoll **selbst-enthalten und
portabel**. Updates an der Bibliothek propagieren **nicht** in bereits eingefügte Kopien (bewusst). Die Bibliothek
ist eine App-Speicher-Konvention, **kein** Teil des Protokoll-Schemas; Bibliotheksblöcke müssen **frei von
Patientendaten** bleiben.

## Einsatz / Case (Verwendung)

Beim Verwenden liefert der Nutzer (alles **flüchtig**, nicht Teil der Vorlage):
- `variableValues`: `{ "geschlecht": "w", ... }` — Defaults aus den Variablen, überschreibbar.
- `values`: Punkt-Übersteuerungen — `"Freitext"` (bei `finding` ⇒ `state:"abnormal"`) · `{ value, state }` · `["a","b"]` (ersetzt `list.entries`) · `[{name, dosierung?, kommentar?}]` (Zeilen eines `medikamente`-Punkts, #146).
- `activeBlocks`: `string[]` — Ids der **aktivierten optionalen Blöcke**.

## Render-Pipeline (Vertrag für #12)

```js
render(protocol, { variableValues, values, activeBlocks }) -> string
```
1. **Variablen + Punkt-Zustände auflösen** (Defaults + Case-Overrides) → Grammatik-Tokens ableiten.
2. **Optionale Blöcke filtern:** `optional`-Block nur, wenn `block.id ∈ activeBlocks`.
3. Pro Block/Punkt **`visibleIf` auswerten** (über Variablen & Punkte) → ausblenden, wenn `false`.
4. **Punkt-Text** bestimmen (Default/Override) → **Platzhalter ersetzen**.
5. **Ausgabe:** Kopfzeile je sichtbarem Block + Zeile je sichtbarem Punkt. Deterministisch; Vorlage unverändert.

## Versionierung

- `schemaVersion` (SemVer). **Noch ist nichts finalisiert** → **`0.x` (in Entwicklung)**. Aktuell: `0.1.0`.
- **`1.0.0` markiert den MVP / die erste stabile Version. Diesen Zeitpunkt legt der Maintainer (User) fest.**
- **Import/Teilen** prüft `schemaVersion`; Format-Migrationen werden dokumentiert.

## Validierung

[`protocol.schema.json`](protocol.schema.json) (JSON Schema draft 2020-12). Wird im Editor (#13) **und** im CI geprüft.

## Beispiel (Variablen + Punkt-Bedingung + optionaler Block)

```json
{
  "schemaVersion": "0.1.0", "id": "demo", "title": "Demo", "lang": "de",
  "variables": [
    { "id": "geschlecht", "label": "Geschlecht", "type": "select", "grammar": "de-gender", "default": "w",
      "options": [ {"value":"w","label":"weiblich"}, {"value":"m","label":"männlich"}, {"value":"d","label":"divers"} ] }
  ],
  "blocks": [
    { "id": "az", "title": "Allgemeinzustand", "points": [
      { "type": "finding", "id": "bewusstsein", "label": "Bewusstsein", "normal": "{{patient}} ist wach und voll orientiert" },
      { "type": "field", "id": "schwangerschaft", "label": "Schwangerschaft", "visibleIf": { "var": "geschlecht", "eq": "w" } }
    ]},
    { "id": "verweigerung", "title": "Mitfahrtverweigerung", "optional": true, "points": [
      { "type": "text", "id": "aufklaerung", "content": "{{patient}} wurde über die Risiken aufgeklärt …" }
    ]}
  ]
}
```
- `geschlecht=w` → „Patientin …" + Feld „Schwangerschaft" sichtbar.
- Block „Mitfahrtverweigerung" erscheint nur, wenn er aktiviert (`activeBlocks` enthält `verweigerung`) ist.

## Tests

```
node --test packages/shared/renderer/render.test.mjs
```
Deckt (geplant für #12): Variablen (alle Typen), Platzhalter + `de-gender`, `visibleIf` über Variablen & Punkte,
optionale Blöcke via `activeBlocks`, Nicht-Mutation.
