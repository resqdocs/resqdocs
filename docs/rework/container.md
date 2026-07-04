# Container (Wrapper) — Vertrag

> Erstes Element des Rework (Branch experiment/protocol-rework). Hier steht NUR, was der
> Maintainer definiert hat. Meine Vorschlaege sind als „Vorschlag" markiert. Stand 2026-06-23.

## Zweck

Strukturelement, das **gruppiert**. DER rekursive Baum-Knoten des neuen Modells: ein Container
enthaelt Felder UND andere Container. Loest die alte starre Ebene (block -> point) und
Spezialtypen (findingGroup, medikamente-Liste) langfristig in EIN Primitiv auf.

## Modell

```
Container {
  type: "container"
  id: string                 // Pflicht; Identifier, Hook fuer spaetere Sichtbarkeit u. Ae.
  title?: string             // optional; im Editor IMMER sichtbar (Orientierung)
  showTitle?: boolean        // erscheint der Titel in der AUSGABE? (Schalter)
  titleInline?: boolean      // Titel inline vor dem Inhalt (prefix+title+suffix, OHNE Fuellzeichen),
                             //   statt eigener Ueberschriftenzeile; greift bei showTitle
  heading?: Heading          // Ueberschriften-Format (greift, wenn showTitle)
  collapsible?: boolean      // Option: im Einsatz/App einklappbar
  children: Node[]           // Felder UND Container, geordnet, rekursiv
}

Heading {
  prefix: string             // vor dem Titel (z. B. "## " fuer Markdown)
  suffix: string             // nach dem Titel (unabhaengig vom Praefix)
  fill: string               // Fuellzeichen ("" = keins)
  width: number              // Bedeutung je fillMode
  fillMode: "inclusive" | "exclusive"
}

Node = Container             // Feld-Typen kommen als spaetere Elemente
```

## Eigenschaften (wie vom Maintainer definiert)

1. **Rekursiv** — enthaelt Felder und Container; gruppiert.
2. **`id` (Pflicht)** — Identifier; dient spaeter Sichtbarkeit u. Ae. (Sichtbarkeit selbst ist
   NICHT definiert).
3. **Titel (optional, keine Pflicht)**
   - Im Editor **immer sichtbar** (Orientierung — „was ist das?").
   - **`showTitle`** — Schalter, ob der Titel in der **Ausgabe** erscheint.
   - **Ueberschriften-Format pro Container** (greift bei `showTitle`):
     - **Praefix** und **Suffix** unabhaengig voneinander.
     - **Fuellzeichen** + **Breite**.
     - **Fuellzeichen-Bezug:**
       - `inclusive`: `width` = Gesamtbreite **inkl. Titel** -> Zeile immer gleich lang.
       - `exclusive`: `width` = feste **Anzahl Fuellzeichen** nach dem Titel -> Gesamtbreite variiert.
   - **`titleInline`** (bei `showTitle`) - Titel **inline** vor dem Inhalt
     (`{prefix}{title}{suffix}{Inhalt}` auf einer Zeile, OHNE Fuellzeichen/Breite) statt eigener
     Ueberschriftenzeile. Fuer kompakte „Label: Wert"-Zeilen (xABCDE). [erweitert 2026-06-23]
4. **Einklappbar** — Option pro Container (Einsatz/App). Reines UI, **keine** Wirkung auf die Ausgabe.

## Ausgabe (Renderer)

- `showTitle` an: Ueberschrift (`prefix` + Titel + `suffix` + Fuellzeichen je Bezug) ueber den
  gerenderten Kindern; aus: nur die Kinder (transparenter Wrapper).
- **Verschachtelung** ueber das `prefix` pro Container (z. B. `# ` / `## `), KEINE Auto-Einrueckung.
- `collapsible`: keine Wirkung auf die Ausgabe (nur App-Darstellung).

### Heading-Beispiele

```
Markdown:      prefix "## ", suffix "",  fill ""            ->  ## Anamnese
ASCII-Banner:  prefix "",    suffix " ", fill "=", width 40 ->  Anamnese ===============   (inclusive: Zeile = 40)
Kombiniert:    prefix "# ",  suffix " ", fill "=", width 40 ->  # Anamnese =============   (inclusive: Zeile = 40)
Exklusive:     prefix "# ",  suffix " ", fill "=", width 8  ->  # Anamnese ========        (immer 8 "=", Zeile variiert)
```

## Offene Kleinigkeiten (Vorschlag — Maintainer entscheidet)

- **Default-Heading:** Vorschlag Markdown (`prefix "## "`, kein Fuellzeichen), frei ueberschreibbar.
- **Abstand zwischen Kindern in der Ausgabe:** aktuell ein Zeilenumbruch; ggf. spaeter konfigurierbar.
- **Leerer Container:** aktuell wird der Titel (bei `showTitle`) trotzdem ausgegeben; eine
  „weglassen wenn leer"-Regel ist nicht definiert.
- **Inline-Titel mit MEHREREN Werten:** das Verbindungs-/Trennzeichen ist bewusst noch NICHT
  definiert (Maintainer 2026-06-23, folgt mit den Feldtypen). Aktuell werden inline vorhandene
  Kind-Ausgaben unveraendert angehaengt.

## Definition-of-Done (Slice 1)

- Modell + Renderer + **reine Tests** (Golden-Master: inclusive/exclusive, prefix/suffix/fill,
  Titel an/aus, Verschachtelung).
- **Responsiver Editor** (anlegen, verschachteln, umsortieren, Eigenschaften setzen) +
  **Live-Vorschau** (Ausgabe-Text + einklappbares App-Rendering).
- **Getestet auf iPhone, iPad und Desktop.**
