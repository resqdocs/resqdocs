# Feld-Implementierung — quellenbasierte Empfehlung

> Workflow `field-impl-research` (5 Agenten, verifiziert gegen MDN / WAI-ARIA + Form-System-Docs).
> **Verdikt: unser Entwurf ist gut und idiomatisch — kein Umbau, vier kleine Korrekturen.**

## Behalten (idiomatisch)

- **Field als Leaf** in disc. union `Node = Container | Field`, unterschieden per `type`; nur Leafs
  binden an einen Wert, Container ordnen nur an. (JSONForms Control vs Layout; FormKit input vs
  group; SurveyJS Question vs Panel)
- **Werte getrennt von der Definition**, `Record<id, FieldFill>` keyed by id. (JSONForms `data`/
  `scope`; SurveyJS `survey.data` keyed by `name`)
- **`default` lebt in der DEFINITION**, wird zur Render-Zeit aufgeloest, **nie** in den Werte-Store
  materialisiert (fehlender Key == `confirmed`). (SurveyJS `defaultValue`; JSON-Schema `default`)
- **`FieldFill` als disc. union** statt nullable value — vermeidet den controlled/uncontrolled- +
  „missing key"-Bug, den RHF/Formik/FormKit dokumentieren.

## Korrekturen (umgesetzt)

1. **Tree-Ops + Renderer feldtauglich** (der eigentliche Slice): `removeNode`/`moveChild` matchen
   per `id` ueber ALLE Knotentypen; `renderNode` hat einen Feld-Zweig; Signatur `render(root, values)`.
2. **Reine Fill-Helfer** (`fill.ts`): `DEFAULT_FILL`, `cycleFill`, `fillValue` — node-getestet,
   statt Logik in der Vue-Komponente.
3. **`custom`-Wert-Politik bewusst:** Verlassen von `custom` verwirft den Tipptext (`cycleFill`),
   Re-Edit innerhalb `custom` behaelt ihn (`setCustom`). Getestet.
4. **`id`-Umbenennen migriert den Fill** (alter Key → neuer Key; `useCaseValues.rename`), sonst
   verwaist der Einsatz-Wert. (SurveyJS: `name` ist der Daten-Key)

## Tri-State: EIN Control — bewusste, begruendete Abweichung

Generisch raet NN/g von 3-Zustands-Schaltern ab (Zustand + Aktion mehrdeutig; zwei Zustaende
versteckt). Wir bleiben bei **EINEM** zyklischen Control wegen: Paritaet/Muskelgedaechtnis (NIDA),
small-screen-first + lange Feldlisten, „confirmed" als dominanter Pfad. **Nicht** als ARIA-Tri-State:

- `<button>`, **kein** `role=checkbox`, **kein** `aria-checked="mixed"` (das bedeutet „Summe einer
  Kindgruppe" und faellt sonst still auf `false`). (MDN aria-checked; WAI-ARIA APG mixed checkbox)
- **Zustand im accessible name:** `aria-label = "<Label>: bestaetigt (Standardwert)" / "eigener
  Wert" / "nicht erhoben"`, plus Hinweis auf die naechste Aktion (`title`). (NN/g state-switch-buttons)
- `custom` enthuellt erst das Eingabefeld → Default-Pfad bleibt schmal.

## Defaults vorbelegt + editierbar

Vorbelegen spart der Mehrheit Arbeit, muss aber **editierbar** sein (Override-Pfad Pflicht; ohne →
100 % Abbruch, Baymard). Risiko **Default-Bias** (Nutzer vertrauen Defaults blind) → `default` =
ehrlich haeufigster/korrekter Wert, nicht der fuer den Output bequemste. **Placeholder ≠ Default**
(NN/g). Revert ist eingebaut (Zyklus → ✓).

## Quellen

- JSONForms Controls (`type:"Control"` + `scope`): https://jsonforms.io/docs/uischema/controls
- SurveyJS `survey.data` keyed by `name`: https://surveyjs.io/form-library/documentation/access-and-modify-survey-results
- SurveyJS `defaultValue` (Definition): https://surveyjs.io/form-library/documentation/design-survey/pre-populate-form-fields
- FormKit Node-Typen (input = Leaf): https://formkit.com/essentials/architecture
- JSON-Schema `default`: https://json-schema.org/understanding-json-schema/reference/annotations
- MDN `aria-checked` (`mixed` nur checkbox; sonst Fallback `false`): https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-checked
- WAI-ARIA APG mixed checkbox: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/examples/checkbox-mixed/
- NN/g State-Switch-Buttons: https://www.nngroup.com/articles/state-switch-buttons/
- NN/g Toggle-Switch-Guidelines: https://www.nngroup.com/articles/toggle-switch-guidelines/
- NN/g Power of Defaults: https://www.nngroup.com/articles/the-power-of-defaults/
- Baymard Override-Pfad Pflicht: https://baymard.com/blog/zip-code-auto-detection
- NN/g Placeholder ≠ Default: https://www.nngroup.com/articles/form-design-placeholders/
- Carbon revert-to-suggested: https://carbondesignsystem.com/patterns/common-actions/
