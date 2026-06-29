# Test-Strategie

> Wie ein Rework-Schritt objektiv als fertig nachgewiesen wird. Kernpfeiler: **Golden-Master**
> (Vorlage + Eingaben → erwartete Ausgabe via `render()`). Die frühere zweite Säule
> „Affordanz-Parity" (App-Deskriptor == Vorschau-Deskriptor) ist **gegenstandslos**: es gibt
> nur **einen** Renderer, App und Vorschau können nicht auseinanderlaufen (siehe
> `adr-unified-fill.md`).

## Rahmenbedingungen

- **`packages/shared` (`@resqdocs/protocol-core`)** testet mit `node --test` — reine TS/MJS-
  Module, keine UI-/Build-Abhängigkeit. Vorhandene Suiten: `render.test.ts`, `fill.test.ts`,
  `creator.test.ts`, `library.test.ts`, `deviations.test.ts`, `templateIO.test.ts`,
  `functions/registry.test.ts`, `ids.test.ts`.
- Für `apps/pico-pwa` gilt: native Gegenprüfung nur über die freigegebenen Wege
  (`npm run ios|android`), nie Ad-hoc-Builds.

## Golden-Master (Ausgabe-Wahrheit)

Für jeden Knotentyp ein Satz Fixtures: **Vorlage + `FieldFill`-Werte → erwarteter Klartext**
via `render()`. Skizze (`packages/shared/render.test.ts`):

```ts
import { render } from './render.ts'
const out = render(root, values)
assert.equal(out, EXPECTED)   // exakte Ausgabe
```

Deckt ab: `default`/`custom`-Auflösung (`confirmed → default`, nie materialisiert),
`excluded`-Weglassen, **Select** (`options`: confirmed-Fallback `default ∈ options` sonst
oberste Option), `multiline`-Werte, **FunctionNode** (Medikamentenplan-Zeilen), Container-
Anordnung/Banner, Feld-Trenner (`separator`/`noSeparatorBefore`) und Leertext (`emptyText`).
Diese Tests sind die Regressionssicherung gegen „Rework bricht die Ausgabe".

## Konsistenz Editor ↔ Einsatz (strukturell, nicht per Test)

Editor-Vorschau (`ContainerPreview.vue`) und Einsatz (`EinsatzView.vue`) rufen **denselben**
`render()`. Es gibt keine zweite Ausfüll-/Anzeige-Implementierung mehr, also auch keinen
Parity-Test, der sie vergleichen müsste — die Einheit folgt aus der Architektur.

## Manuell, end-to-end (pro Änderung einmal)

Nach grünen Unit-Tests ein kurzer Durchlauf: Im In-App-Editor Option setzen → Live-Vorschau
zeigt sie → Wechsel in den Einsatz → Ausgabe stimmt. Bei nativer Relevanz im App-Build
gegenprüfen (`npm run ios|android`).

## Was „grün" bedeutet

- Golden-Master für den betroffenen Typ deckt die Optionen ab und ist grün.
- `node --test` der betroffenen Pakete insgesamt grün; nichts Bestehendes rot.
- Manueller End-to-End-Durchlauf einmal bestätigt.
