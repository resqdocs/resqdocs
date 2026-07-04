# Element: Feld (Leaf)

> Erstes Blatt im Node-Baum, vom Maintainer **vom Ausfuellen her** definiert.
> Modell: `apps/pico-pwa/src/rebuild/model.ts` (Field, FieldFill) + `fill.ts`.
> Renderer: `render.ts`. Einsatz-Control: `components/rebuild/EinsatzField.vue`.
> Quellen-Empfehlung: `field-impl.md`.

## Modell

```
Field {
  type: "field"
  id: string          // Pflicht; zugleich Key im Einsatz-Werte-Store
  title?: string      // Label; im Editor IMMER sichtbar
  showTitle?: boolean // Titel in der AUSGABE? (Default AUS) -> prefix+title+suffix vor dem Wert
  heading?: Heading   // nur prefix/suffix wirken (KEIN Banner/Fuellzeichen)
  default?: string    // Standardwert
  inline?: boolean    // block (Default, neue Zeile) vs inline (an vorheriges Element anhaengen)
}

// Einsatz-WERT (getrennt von der Definition, per id; fehlt -> confirmed)
FieldFill =
  | { state: "confirmed" }        // Standardwert
  | { state: "custom", value }    // bearbeiteter Wert
  | { state: "excluded" }         // nicht erhoben -> entfaellt
```

## Eigenschaften

1. **`id` (Pflicht)** — Identifier UND Key der Einsatz-Werte. Umbenennen migriert den Wert mit.
2. **Titel + Standardwert getrennt** — der Titel muss nicht dem Standardwert entsprechen.
3. **`showTitle` (Default aus)** — aus = nur der Wert (xABCDE); an = `prefix+title+suffix+Wert`
   (kein Banner — Fuellzeichen/Breite sind Abschnitts-Ueberschriften, kein Feld-Label).
4. **inline/block** — relativ zum vorhergehenden Geschwister: **block** = neue Zeile (Default),
   **inline** = an die laufende Zeile anhaengen.

## Ausfuellen (Einsatz) — Tri-State

EIN zyklischer Button (kein `role=checkbox`, kein `aria-checked="mixed"`); der Zustand steht im
`aria-label`:

- **✓ bestaetigt** — Standardwert (read-only angezeigt).
- **✎ eigener Wert** — Standardwert **vorbelegt + editierbar**.
- **− nicht erhoben** — entfaellt im Protokoll.

Start **✓**. Zyklus **✓ → ✎ → − → ✓**. Verlassen von ✎ verwirft den Tipptext (verlustbehaftet
by design); Re-Edit innerhalb ✎ behaelt ihn.

**Umsetzung:** wiederverwendet die bestehende, saubere `components/TriStateToggle.vue` (schlichter
`size-7 rounded-md` Button mit Glyphe, success/primary/base-200) statt einer eigenen Variante - der
Maintainer kannte sie als sauber aus `dev`. Der Container nutzt dieselbe Optik 2-stufig
(`ContainerFillToggle.vue`).

## Ausgabe (Renderer)

- Der Default wird **zur Render-Zeit** aufgeloest (`confirmed → field.default`), **nie** in den
  Werte-Store geschrieben.
- `excluded` ODER leerer Wert (ohne showTitle) → Zeile entfaellt.
- inline/block steuert den Umbruch zum vorherigen Element.

## Trenner & Offenes

- **Feld-Trenner** zwischen inline-Elementen ist jetzt definiert (2026-06-24) -> siehe
  `separator.md`. Opt-out pro Feld: `noSeparatorBefore`.
- **Banner am Feld:** bewusst NICHT (nur prefix/suffix).
