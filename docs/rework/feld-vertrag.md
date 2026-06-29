# Feld-Vertrag — abgelöst durch die Typ-Docs

> Die ursprüngliche „abschließende Definition" ging vom alten 6-Typen-Modell aus
> (`field`/`finding`/`findingGroup`/`list`/`text`/`medikamente`) und verwies auf
> `protocols/protocol.schema.json` + den alten Renderer. Dieses Modell liegt am Git-Tag
> **`alterstand`**. Der Rework hat auf **drei Knotentypen** konsolidiert; die verbindlichen
> Verträge stehen jetzt **pro Typ** in eigenen Docs.

## Wo der Vertrag jetzt steht

| Knotentyp (`packages/shared/model.ts`) | Vertrag |
|---|---|
| **Field** (einfaches Feld, Select via `options`, mehrzeilig via `multiline`) | [`field.md`](field.md) · Umsetzung [`field-impl.md`](field-impl.md) · Select [`select-field.md`](select-field.md) |
| **Container** (Abschnitt/Gruppe, Titel/Banner, Fill-Modus) | [`container.md`](container.md) · Umsetzung [`container-impl.md`](container-impl.md) |
| **FunctionNode** (Medikamentenplan, Ärzte) | Modell + `functions/registry.ts`; Ausgabe siehe [`output-display.md`](output-display.md) |

Quer dazu: Feld-Trenner [`separator.md`](separator.md) / [`separator-disclosure.md`](separator-disclosure.md),
Ausgabe-Verhalten [`output-display.md`](output-display.md), Einsatz-Maske
[`einsatz-display.md`](einsatz-display.md) / [`einsatz-hierarchy.md`](einsatz-hierarchy.md) /
[`einsatz-nesting.md`](einsatz-nesting.md).

Jeder dieser Verträge beschreibt pro Typ: **Zweck · Erstellungs-Optionen · Editor-Konfig ·
Einsatz-Ausfüllen · Text-Ausgabe** — und gilt für **dieselbe** Quelle, die App und
Editor-Vorschau über `render()` aus `@resqdocs/protocol-core` gemeinsam nutzen.
