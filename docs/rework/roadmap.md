# Rework-Status & offene Themen

> Was umgesetzt ist und was noch aussteht. Ersetzt die ursprüngliche Slice-Reihenfolge
> (die ging vom alten 6-Typen-Modell aus — `field`/`finding`/`findingGroup`/`list`/`text`/
> `medikamente`; dieses Modell liegt am Tag `alterstand`). Der Rework hat stattdessen auf
> **drei Knotentypen** konsolidiert: `Container | Field | FunctionNode`.

## Umgesetzt (live auf `dev`, in TestFlight)

**Package `@resqdocs/protocol-core` (`packages/shared/`):**
- Modell `model.ts` (`Container | Field | FunctionNode`, `FieldFill`-Tri-State + Funktions-Wert).
- Renderer `render.ts` — einzige Ausgabe-Quelle; Fill-Helfer `fill.ts` (`DEFAULT_FILL`, `cycleFill`).
- Baum-/Vorlagen-Operationen `creator.ts`, `treeEditor`-Anbindung, `templateIO.ts`, `library.ts`,
  `caseDraft.ts`, `functions/registry.ts`. Alle mit `node --test` abgedeckt.

**App `apps/pico-pwa` (`rebuild/` + `components/rebuild/`):**
- **Editor** (`EditorView`, `ContainerProperties`, Baum-Navigation: Verschieben/Sitemap-Picker,
  lineares Hoch/Runter mit Ein-/Ausrücken, Löschen mit Bestätigung) **mit Live-Vorschau**
  (`ContainerPreview`, gerendert über denselben `render()` wie der Einsatz).
- **Einsatz** (`EinsatzView`/`EinsatzField`/`EinsatzSection`): Tri-State, Select (`options`/
  `allowCustom`), mehrzeilig (`multiline`).
- **Funktionen** als `FunctionNode`: **Medikamentenplan** (Packungs-/BMP-Scan) und **Ärzte**
  (bidirektionaler Cross-Scan).
- **Persistenz**: `protocolRepository`/`protocolPersistence` (SQLite), Einsatz-Entwürfe mit TTL.

**Die ursprüngliche „Divergenz" ist strukturell gelöst:** Editor-Vorschau und App teilen sich
genau einen Renderer — keine zweite Ausfüll-Implementierung mehr (siehe `adr-unified-fill.md`).

## Offen (noch NICHT reworked)

| Thema | Stand | Anmerkung |
|---|---|---|
| **Protokoll-Format-Migration** | offen | `protocols/standardprotokoll.json` ist noch `0.2.0` (altes Modell: `findingGroup`/`finding`/`list`/`text`/`variables`/xABCDE). Das App+Package-Modell ist `Container/Field/FunctionNode`. Eine Überführung der Seed-/Vorlagendaten ist noch nicht erfolgt. |
| **Alter Renderer** `renderer/render.mjs` | offen | Lebt parallel für das 0.2.0-Format. Entfällt erst, wenn die Daten migriert sind. |
| **Web-Editor** `apps/protocol-editor` | offen | Separate App (editor.resqdocs.app), im Wartungsmodus, noch auf altem Stand. |

## Prinzip für jeden weiteren Schritt (Definition-of-Done)

1. Neuer/erweiterter Code im Package ist `node --test`-grün (`render.test.ts`/`fill.test.ts` …).
2. Editor-Vorschau, Einsatz und Ausgabe bleiben durch **denselben `render()`** konsistent.
3. Kein bestehender Test/Build rot; nichts gelöscht.
4. Bei nativer Relevanz: Gegenprüfung im App-Build (nur `npm run ios|android`).

## Leitplanken

- **Reihenfolge/Scope gibt der Maintainer vor.** Keine eigenmächtige Scope-Entscheidung.
- **Bestandsschutz** (`bestandsschutz.md`): die PZN-Bibliothek in den Einstellungen bleibt
  vollständig erhalten.
- Altlast (0.2.0-Format, alter Renderer, Web-Editor) bleibt lauffähig, bis sie bewusst
  (mit Test) migriert wird.
