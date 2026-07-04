# Rework: Protokoll-Kern + App (Stand: umgesetzt, live auf `dev`)

> Interne Working-Docs, **nicht für Public-Sync**.
> Der Rework ist **kein Experiment mehr** — er ist auf `dev` gemergt und der Stand, der
> in TestFlight läuft. Der eingefrorene Vor-Rework-Stand liegt am Git-Tag **`alterstand`**
> (2026-06-22); alle Docs, die noch das alte Modell beschreiben, gehören dorthin.

## Was der Rework ist (und was nicht)

Der Rework umfasst **bisher nur zwei Ebenen**:

- **Package** `@resqdocs/protocol-core` (= `packages/shared/`): das neue Modell, der Renderer,
  die Fill-Logik und die Baum-/Creator-Operationen — pur, `node --test`-getestet.
- **App** `apps/pico-pwa` (`src/rebuild/` + `src/components/rebuild/`): Editor, Einsatz-Maske
  und Ausgabe, alle auf demselben Package-Kern.

**NICHT reworked (Altlast, koexistiert bewusst):**

- die **Daten-/Format-Ebene**: `protocols/standardprotokoll.json` ist noch
  `schemaVersion 0.2.0` (altes Modell mit `findingGroup`/`finding`/`list`/`text`/`variables`);
- der **alte Renderer** `packages/shared/renderer/` (`render.mjs`/`runtime.mjs`) für dieses
  0.2.0-Format;
- der **separate Web-Editor** `apps/protocol-editor` (editor.resqdocs.app, im Wartungsmodus).

Eine Migration dieser Ebenen ist **noch nicht** Teil des Rework. Diese Docs beschreiben den
App+Package-Rework als Wahrheit und markieren die Altlast ehrlich als solche.

## Das Modell (Wahrheit: `packages/shared/model.ts`)

Ein Protokoll ist ein Baum aus **drei Knotentypen** (`Node = Container | Field | FunctionNode`):

- **Container** — ordnet an (Abschnitte/Gruppen), trägt Titel/Banner + Fill-Modus, hat `children`.
- **Field** — das Blatt mit Wert. Einfaches Feld **oder** Select (`options` gesetzt) **oder**
  mehrzeilig (`multiline`); Tri-State-Ausfüllen (✓ Standard / ✎ eigener Wert / − nicht erhoben).
- **FunctionNode** — Blatt mit eigener Einsatz-UI + eigenem Wert (`functionKind`, erste/aktuelle:
  Medikamentenplan, Ärzte).

Der **Renderer** (`render.ts`) ist die einzige Ausgabe-Quelle. Editor-Vorschau
(`ContainerPreview.vue`) **und** Einsatz (`EinsatzView.vue`) rufen **denselben** `render()` →
„im Editor eingestellt == in der App == im Text" ist damit **strukturell garantiert**, nicht
mehr nachgebaut. Genau das war die ursprüngliche Wurzel von „eingestellt, aber am Ende nicht da".

## Dokumente

| Datei | Inhalt | Stand |
|---|---|---|
| `field.md` / `field-impl.md` | Feld-Vertrag (inkl. Select über `options`/`allowCustom`/`multiline`) + Implementierungs-Empfehlung | aktuell |
| `container.md` / `container-impl.md` | Container-Vertrag + Implementierung | aktuell |
| `select-field.md` | Select als reicheres Eingabe-Control im Field | aktuell |
| `separator.md` / `separator-disclosure.md` | Feld-Trenner + „Erweitert: Ausgabe"-Disclosure (Trenner + Leertext) | aktuell |
| `output-display.md` | Ausgabe-/Renderer-Verhalten | aktuell |
| `einsatz-display.md` / `einsatz-hierarchy.md` / `einsatz-nesting.md` | Einsatz-Maske: Anzeige, Hierarchie, Verschachtelung | aktuell |
| `einstellungen-struktur.md` | Struktur der App-Einstellungen | aktuell |
| `bestandsschutz.md` | Must-Preserve (PZN-Bibliothek in den Einstellungen) | aktuell |
| `roadmap.md` | Was umgesetzt ist vs. was offen ist (Format-Migration, Web-Editor) | aktuell |
| `test-strategie.md` | Golden-Master gegen `render()` | aktuell |
| `adr-unified-fill.md` | ADR: ein Renderer/eine Quelle — **umgesetzt** | aktuell |
| `feld-vertrag.md` / `gap-register.md` | nur noch Verweis-/Status-Stubs (Inhalt ging in die Typ-Docs über bzw. ist durch Vereinheitlichung erledigt) | abgelöst |

## Status

App+Package-Rework **umgesetzt, getestet, gemergt, ausgeliefert** (TestFlight). Offene
Folge-Themen siehe `roadmap.md`.
