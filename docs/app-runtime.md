# Einsatz-Composer — Laufzeit-/Einsatzansicht

> ⚠️ **Beschreibt den Pre-Rework-Stand** (altes Modell + alter Renderer `render.mjs`/`runtime.mjs`).
> App + Package sind seit 2026-06-22 reworked (Git-Tag `alterstand`); aktuelle Wahrheit für
> App+Package: [`docs/rework/`](rework/README.md).
>
> Status: Entwurf (0.x). Bezug: SCHEMA.md (S1), docs/app-ia.md (S4), docs/data-flow.md (S3).
> Renderer: `packages/shared/renderer/render.mjs` (#12).

## Was das ist — und was nicht

Diese Ansicht ist die **Laufzeit-/Einsatzansicht**: ein nutzerdefiniertes Protokoll wird
**verwendet**, nicht erstellt. Flow:

> Protokoll laden → Variablen setzen → Punkte ausfüllen/aktivieren → optionale Blöcke aktivieren
> → Renderer-Vorschau erzeugen → (optional) an die Bridge senden.

**Dies ist nicht der Protokoll-Kreator (#13).** Kein Schema-Editor, kein Drag-and-drop, keine
Block-Bibliothek, keine Cloud. Hier wird die Vorlage nur **gelesen**; es werden keine Blöcke/Punkte
verändert. Ziel dieses Schritts: beweisen, dass das neue S1-Modell im echten App-Runtime-Flow trägt.

## Datenschutz / Flüchtigkeit

- Der Einsatz-Zustand `caseState = { variableValues, values, activeBlocks }` lebt **nur im
  Arbeitsspeicher** (`reactive`) und wird **nie** persistiert — kein LocalStorage, IndexedDB, Cache
  oder `@capacitor/preferences`. Siehe `docs/data-flow.md`.
- **„Sitzung zurücksetzen"** verwirft `caseState` vollständig (Variablen zurück auf Defaults).
- Die Renderer-Ausgabe kann Patientendaten enthalten → wird nur angezeigt und (bewusst) an die Bridge
  gesendet; nicht gespeichert/gecacht.
- **Abgrenzung zur Bibliothek (#13-F2/F3):** Die persistente `library` (Protokoll-**Vorlagen** sowie
  neutrale **Bausteine/Snippets** in SQLite, nativ; Web-Dev In-Memory) speichert **nur neutrale**
  Strukturen und ist strikt vom flüchtigen
  `caseState` getrennt. **`caseState` wird nie in die Bibliothek/Storage geschrieben**, Speichern in die
  Bibliothek ist eine **bewusste** Nutzeraktion im Protokolle-Tab (kein Auto-Save). Das **Einfügen** aus
  der Bibliothek ins Protokoll (#13-F4) ist **Copy-on-insert** (kein Live-Link). Native Persistenz
  wird manuell per `docs/native-smoke.md` geprüft (Web-Dev = In-Memory, beweist keine Persistenz).

## Architektur

| Datei | Rolle |
|---|---|
| `src/composables/caseState.ts` | **reine**, Vue-freie Logik (init/Defaults/toggle/reset). Mit `node --test` geprüft. |
| `src/composables/useCaseState.ts` | Vue-Composable: `reactive` caseState + dünne Mutatoren um die reine Logik. |
| `src/composables/useProtocolRuntime.ts` | bindet Vorlage + caseState an `render(...)` → `preview` und an die **gemeinsame Sichtbarkeits-API** (`buildContext`/`isBlockVisible`/`getVisiblePoints`). |
| `src/components/ProtocolRuntimeView.vue` | orchestriert Variablen/Punkte/optionale Blöcke/Vorschau/Reset; rendert **nur sichtbare** Blöcke/Punkte; gibt die Ausgabe über `v-model:output` nach außen. |
| `src/components/VariableInput.vue` | Eingabe je Variablentyp (select/boolean/text/number). |
| `src/components/PointInput.vue` | Eingabe je Punkt-Typ (field/finding/findingGroup/list/text). |
| `src/components/OptionalBlockToggle.vue` | aktiviert einen optionalen Block (flüchtig). |
| `src/components/RenderPreview.vue` | zeigt den Renderer-Klartext. |
| `src/data/protocols.ts` | Anbindung des **kanonischen** Seeds (kein Kopieren). |

**Kapselung:** Pico-Logik (`usePicoApi`), Render-Logik (Renderer in `packages/shared`) und Zustands-
Logik (`caseState`) sind getrennt. Die UI ruft Renderer/Runtime nur auf — **keine** Render-/`visibleIf`-
Logik in Komponenten dupliziert. Der Bridge-Send liegt bewusst im App-Shell (`App.vue`), nicht im
Composer.

## Sichtbarkeit UND Textauflösung liegen zentral in der Runtime

`visibleIf` **und** die Platzhalter-Auflösung sind **genau einmal** implementiert — in der gemeinsamen
Runtime-Schicht `packages/shared/renderer/runtime.mjs`. Renderer (`render.mjs`) **und** Eingabemaske
(App) nutzen dieselben Funktionen; der Renderer enthält **keine** eigene `visibleIf`- oder
Platzhalter-Logik mehr.

| Funktion | Zweck |
|---|---|
| `buildContext(protocol, caseState)` | löst Variablen, Grammatik-Tokens und **alle Punkt-Zustände** auf (render-reihenfolge-unabhängig). Eine Quelle für Renderer und UI. |
| `evalPredicate(pred, ctx)` | deklarative Auswertung: `var`/`point` + `eq`/`in`/`truthy`/`filled`/`state` + `all`/`any`/`not`. Kein `eval`. |
| `isBlockVisible(block, ctx)` | `(nicht optional ODER in `activeBlocks`) UND `visibleIf`` erfüllt. |
| `isPointVisible(point, ctx)` | `visibleIf` des Punkts erfüllt. |
| `getVisibleBlocks(protocol, ctx)` / `getVisiblePoints(block, ctx)` | gefilterte Listen für die Maske. |
| `resolveText(input, ctx)` | Platzhalter auflösen: `{{var:id}}` (bei `select` → Options-**Label**), de-gender (`{{patient}}` …) für w/m/d; **Unbekanntes bleibt unverändert**. |
| `resolveMaybeText(input, ctx)` | wie `resolveText`, lässt Nicht-Strings (undefined/Zahlen/…) unverändert. |

**Folgen:**
- **Eingabemaske und Vorschau bleiben konsistent:** beide leiten Sichtbarkeit **und** Texte aus
  demselben `ctx` ab. Labels/Titel/Texte in der Maske zeigen dieselben aufgelösten Werte wie die
  Vorschau (z. B. `{{patient}}` → „Patientin"). Tests in `runtime.test.mjs` prüfen Renderer↔Runtime-
  Konsistenz für Sichtbarkeit und Textauflösung explizit.
- Die App löst UI-Texte über das von `useProtocolRuntime` bereitgestellte, kontextgebundene
  `resolveText` auf (Protokoll-/Blocktitel, Punkt-Label, finding-`normal`, `text`-Inhalt, Default-
  Placeholder). **Keine** Platzhalterlogik in Vue-Komponenten — sie erhalten nur die Funktion als Prop.
- **Punkt-Zustände werden zentral vorab aufgelöst** (`ctx.points`) → Bedingungen auf andere Punkte
  funktionieren unabhängig von der Render-Reihenfolge, und es gibt **keine zweite Auswertung** in
  Vue-Komponenten.
- Die Maske zeigt **nur sichtbare** Blöcke/Punkte. Optionale Blöcke bleiben im Bereich „Optionale
  Blöcke" aktivierbar; ihre Punkte erscheinen erst nach Aktivierung (und nur, wenn ihr `visibleIf`
  erfüllt ist).
- **Hinweis:** Editierbare `list`-Einträge bleiben in der Textarea **roh** (der Nutzer bearbeitet die
  Quelle); der Renderer löst Platzhalter erst in der Ausgabe auf. Das ist Absicht.

**Seed-Anbindung (SSoT):** Die App nutzt `protocols/standardprotokoll.json` direkt über den Alias
`@protocols` (Vite + tsconfig), **statt** einer Kopie unter `src/data/`. Grund: Die Datei wird in CI
gegen `protocol.schema.json` validiert; eine zweite Kopie würde driften. `src/data/protocols.ts` ist
die einzige Anbindungsstelle (eine kontrollierte Typ-Zusicherung, da JSON-Importe breit inferiert
werden).

## Punkt-Typen — aktueller Stand

| Typ | Eingabe |
|---|---|
| `field` | Textfeld (Override; Default als Placeholder) |
| `finding` | `BefundItem` (normal bestätigen / abweichend eingeben) |
| `findingGroup` | je Kind-Befund ein `BefundItem` |
| `list` | Textarea, eine Zeile pro Eintrag |
| `text` | feste Anzeige (nicht editierbar) |

## Offene Punkte (Folge / #13)

- **Input-seitige `visibleIf` und Platzhalter:** erledigt — Maske und Vorschau nutzen dieselbe
  Runtime-API für Sichtbarkeit (`isBlockVisible`/`getVisiblePoints`) **und** Textauflösung
  (`resolveText`). Keine Doppel-Implementierung mehr.
- **Mehrere Protokolle / Auswahl:** aktuell fest der Standard-Seed; Protokoll-Liste/-Auswahl folgt mit
  dem Kreator/`library`.
- **`number`-Variable:** leeres Feld → `undefined`; Validierung/Bereich offen.
- **`text`-Punkt editierbar?** derzeit fix; ob Einsatz-Override sinnvoll ist, mit #13 klären.
- **Bottom-Tabs-IA (S4):** umgesetzt als 4 Tabs (Einsatz · Protokolle · Bausteine · Einstellungen,
  DaisyUI `dock`). Diese Runtime-Ansicht ist der **Einsatz**-Tab; **Protokolle** ist die Kreator-Shell
  (#13-B, `docs/protocol-creator-mvp.md`); **Bausteine** (#13-F3) und **Einstellungen** (#14-A:
  App-Einstellungen, Gerät/Pico, Datenschutz/Reset, Info/Hilfe, Open Source) sind umgesetzt. Der
  **Gerät/Pico**-Bereich ist seit **#14-B** interaktiv (Verbindung prüfen / Status / Testtext über die
  gekapselte `src/pico/`-Schicht; `/config` folgt).
- **„Sitzung zurücksetzen"** bleibt prominent im Einsatz-Tab (verwirft `caseState`); die Lösch-Funktionen
  für die persistente Library liegen in den Einstellungen (#14-A) — strikt getrennt.

## Tests

```
node --test packages/shared/renderer/runtime.test.mjs
node --test packages/shared/renderer/render.test.mjs
node --test --experimental-strip-types apps/pico-pwa/src/composables/caseState.test.ts
```
Deckt: zentrale Sichtbarkeit (Blöcke/Punkte, optionale Blöcke, Variablen-/Punkt-/`all`/`any`/`not`-
Bedingungen), **Textauflösung** (`{{var:id}}` inkl. Select-Label, de-gender w/m/d, Defaults/Overrides,
Unbekanntes unverändert), **Renderer↔Runtime-Konsistenz** für Sichtbarkeit und Text,
CaseState-Init/Defaults/Reset, Render mit echtem Seed, keine Mutation des Protokolls.
