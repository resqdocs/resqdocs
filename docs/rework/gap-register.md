# Gap-Register — erledigt (historisch)

> **Dieses Register ist abgelöst.** Es listete die Bruchstellen zwischen der App-Ausfüllmaske
> und der **abgespeckten Editor-Vorschau** des alten Stands (`PointInput.vue` vs.
> `previewFill.ts`/`PreviewControls.vue`). Diese Dateien und das zugrunde liegende Modell
> existieren nicht mehr im Rework — sie liegen am Git-Tag **`alterstand`** (2026-06-22).

## Warum die Gaps weg sind

Der Rework hat die Wurzel **strukturell** beseitigt: Es gibt **eine** Ausgabe-/Anzeige-Quelle,
den Renderer `render()` in `@resqdocs/protocol-core`. Editor-Vorschau (`ContainerPreview.vue`)
und Einsatz (`EinsatzView.vue`) rufen denselben `render()` auf — eine zweite, abweichende
Ausfüll-/Vorschau-Implementierung gibt es nicht mehr. Damit kann „im Editor eingestellt, aber
am Ende nicht da" nicht mehr entstehen.

Die früheren Einzel-Gaps sind damit gegenstandslos:

- **G1 options / G2 multiline / G5 Tri-State** → im `Field` umgesetzt (`options`/`allowCustom`/
  `multiline` + Tri-State), in `field.md` / `select-field.md` dokumentiert.
- **G3 tool** → als eigener Knotentyp `FunctionNode` (Medikamentenplan/Ärzte) gelöst, nicht mehr
  als Feld-Option.
- **G4 required** → war ein Konzept des alten Modells; im Rework nicht übernommen (jedes Feld ist
  abwählbar). Bewusste Vereinfachung, kein offener Gap.
- **G6/G7 finding-Varianten/Freitext, G8 collapsible, G9 medikamente** → das alte `finding`/
  `findingGroup`-Modell wurde einkonsolidiert (Befunde = `Field` mit `options`); Medikamente sind
  ein `FunctionNode`.

Aktuelle Verträge: `field.md`, `container.md`, `select-field.md`, `output-display.md`.
