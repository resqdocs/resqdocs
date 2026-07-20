# Protokoll-Kreator — MVP-Spezifikation (#13)

> ⚠️ **Beschreibt den Pre-Rework-Stand** (altes Modell). Der In-App-Editor wurde reworked;
> aktuelle Wahrheit für App+Package: [`docs/rework/`](rework/README.md). Historischer Stand in
> der Git-Historie.
>
> **Entscheidungsreife Spezifikation** des Protokoll-Kreators (Tab *Protokolle*) **vor** der
> Implementierung. Status: **Entwurf (0.x)** — `1.0`/MVP-Zeitpunkt deklariert der Maintainer.
> Bezug: `protocols/SCHEMA.md` + `protocols/protocol.schema.json` (S1), `docs/app-ia.md` (S4),
> `docs/data-flow.md` (S3), `docs/app-runtime.md` + `packages/shared/renderer/runtime.mjs` (Runtime),
> `docs/decisions/0003-protocol-creator-mvp.md`.

## Maintainer-Entscheidungen (via Frage-Tool)

- **`visibleIf` im MVP:** **einfacher Regel-Editor** — eine Bedingung „Element sichtbar, wenn
  Variable/Punkt X `eq`/`in`/`truthy` Wert Z". Komplexe (verschachtelte `all`/`any`/`not`) Regeln aus
  Import/Seed werden **nur angezeigt**, nicht editiert.
- **Import/Export im MVP:** **beide** — JSON-Export **und** validierter JSON-Import.
- **Raw-JSON/Expert-Modus im MVP:** **nur Ansicht (read-only)**; Bearbeitung ausschließlich über den
  geführten Editor.
- **Editierbarer Umfang im MVP:** **alle S1-Typen** — Punkte `field/finding/findingGroup/list/text`,
  Variablen `select/boolean/text/number` (vollständiges CRUD).
- **Storage:** in diesem Schritt nur das **fachliche Modell** (s. §5); die Storage-**Technik** ist ein
  bewusst späterer, eigener Entscheidungspunkt (kein Code).

---

## 1. Zweck des Kreators

- Der Kreator **erstellt und bearbeitet neutrale Protokoll-Vorlagen** (S1: Blöcke → Punkte, Variablen,
  `visibleIf`, optionale Blöcke).
- Er ist **nicht** die Einsatzansicht und **speichert keine Einsatzdaten**.
- Er **erzeugt keine Patientenakte** und keine Patientendaten.
- Er erzeugt **S1-kompatibles JSON** (validiert gegen `protocol.schema.json`).
- Er unterstützt **Import/Export** als JSON (Teilen ist opt-in, Datei-basiert).
- **Kein kanonisches Maintainer-Protokoll:** öffentliche Seeds sind neutrale **Muster**, kein
  fachlicher Standard. Das persönliche Protokoll des Maintainers bleibt **privat**.

## 2. MVP-Funktionsumfang

**MVP (enthalten):**
- **Protokoll:** anlegen · duplizieren · umbenennen · löschen · öffnen/bearbeiten.
- **Block:** anlegen · bearbeiten (Titel) · löschen · **als optional markieren** (`optional`).
- **Punkt:** anlegen · bearbeiten · löschen · **Typ wählen bei Anlage** (alle 5 Typen).
- **Variablen:** anlegen · bearbeiten · löschen (alle 4 Typen; bei `select` Optionen; `de-gender`-Flag).
- **`visibleIf`:** einfacher Regel-Editor (eine Bedingung) an Block **und** Punkt.
- **Vorschau/Testlauf:** über den **zentralen Renderer/Runtime** (`render(...)`), mit neutralem
  Default-Zustand (keine Patientendaten).
- **JSON-Export** (nur valide Protokolle) und **validierter JSON-Import**.
- **Read-only JSON-Ansicht** der generierten Vorlage.

**Nach MVP (eigene Tracks):**
- Verschachtelter `visibleIf`-Editor (`all`/`any`/`not`, `state`/`filled`).
- **Editierbares** Raw-JSON / Expert-Modus, freie ID-Bearbeitung.
- Drag-and-drop-Umsortierung (MVP: einfaches Hoch/Runter genügt).
- Teilen über Datei hinaus (Link/Cloud — nur neutrale Daten, opt-in).
- Versions-/Migrations-Assistent bei `schemaVersion`-Sprüngen.
- Patientendaten-Muster-Warnungen (Heuristik) beim Speichern/Export.

**Ausdrücklich nicht Ziel:**
- Einsatz-/Patientendaten im Kreator; Patientenakte; jegliche Patientendaten-Persistenz.
- Automatische Übernahme aus der Einsatzansicht/`caseState` in die `library`.
- Kanonisches Maintainer-Protokoll; Cloud für Patientendaten.

## 3. Editierbare S1-Elemente im MVP

| Element | MVP |
|---|---|
| `protocol.title` | **editierbar** (Pflicht, nicht leer) |
| `protocol.id` | **system-generiert**, stabil, nicht frei editierbar |
| `protocol.schemaVersion` | **system-verwaltet** (aktuelle `0.x`); `1.0` deklariert der Maintainer |
| `protocol.meta.source` | nur Anzeige (bei Seeds gesetzt); im MVP nicht frei editierbar |
| `variables[]` | **CRUD**: `label`, `type`, `options` (bei select), `default`, `grammar:"de-gender"` |
| `variables[].id` | **system-generiert** (stabil, eindeutig im Protokoll) |
| `blocks[]` | **CRUD** |
| `blocks[].id` | **system-generiert** (eindeutig im Protokoll) |
| `blocks[].title` | **editierbar** (Pflicht) |
| `blocks[].optional` | **editierbar** (Toggle) |
| `blocks[].visibleIf` | **einfacher Editor** (eine Bedingung); komplexe nur Anzeige |
| `points[]` | **CRUD** |
| `points[].id` | **system-generiert** (eindeutig im Protokoll) |
| `points[].type` | **bei Anlage wählbar** (alle 5); Typwechsel nach Anlage → Post-MVP |
| `points[].label` | **editierbar** |
| typ-spezifisch: `field.default/options`, `finding.normal/state`, `findingGroup.key/findings[]`, `list.entries`, `text.content` | **editierbar** |
| `points[].visibleIf` | **einfacher Editor**; komplexe nur Anzeige |

**ID-Erzeugung (verbindlich):**
- IDs werden **automatisch** erzeugt (Slug aus Titel/Label + kurzer eindeutiger Suffix) und sind
  **stabil** (ändern sich bei Umbenennung **nicht**).
- **Kollisionsfrei** je Gültigkeitsbereich: `protocol.id` eindeutig in der `library`; `block.id`,
  `point.id`, `variable.id`, `findingGroup.findings[].id` eindeutig **innerhalb des Protokolls**.
- Der Nutzer sieht/bearbeitet IDs im MVP **nicht** (kein technischer Ballast); freie ID-Bearbeitung
  kommt mit dem Expert-Modus (Post-MVP).

## 4. `visibleIf` im MVP (einfacher Regel-Editor)

- Geführte **eine** Bedingung pro Element:
  `[ Subjekt: Variable X | Punkt Y ]  [ Operator: ist gleich / ist eine von / ist gesetzt ]  [ Wert ]`
  → erzeugt `{"var":"…","eq":…}` / `{"var":"…","in":[…]}` / `{"var":"…","truthy":true}` bzw. die
  `point`-Varianten (`state`/`filled` für Punkte als geführte Auswahl).
- **Wertauswahl** ist datengetrieben (z. B. Optionen einer `select`-Variablen) → keine Tippfehler.
- **Komplexe Regeln** (`all`/`any`/`not`, mehrere Bedingungen) aus Seed/Import werden **lesbar
  zusammengefasst angezeigt**, aber im MVP **nicht** verändert (Hinweis: „komplexe Regel — Bearbeitung
  später"). So geht beim Bearbeiten nichts verloren.
- Auswertung erfolgt **ausschließlich** über die gemeinsame Runtime (`runtime.mjs`) — der Kreator baut
  **keine** eigene `visibleIf`-Logik.

## 5. Storage-Modell (fachlich)

```
library = {
  protocols: Protocol[]      // neutrale S1-Vorlagen (eigene + kopierte Seeds)
  blocks:    Block[]         // neutrale, wiederverwendbare Bausteine (Bibliothek)
}
appSettings = { defaultOs, uiPrefs, … }   // getrennter Store
```
- **`library.protocols`** und **`library.blocks`** sind **persistent** und enthalten **nur neutrale
  Daten**. **App-Einstellungen** liegen in einem **getrennten** Store.
- **`caseState` liegt NIE in `library`.** **Keine Patientendaten** in `library`.
- **Technik entschieden (Decision-Record 0004): Hybrid** — App-Einstellungen via
  `@capacitor/preferences`, strukturierte `library`-Daten (Protokolle/Blöcke/Snippets) via **SQLite**
  (`@capacitor-community/sqlite`), gekapselt hinter `useStorage()`. Diese Spezifikation legt die
  **fachliche Struktur** fest; die **Implementierung** ist ein separater Folgeschritt.

## 6. Bausteine vs. Protokolle

- **Protokolle** bestehen aus **Blöcken → Punkten**.
- **Bausteine** sind **neutrale, wiederverwendbare Blöcke/Snippets** (z. B. „Mitfahrtverweigerung").
- **Einfügen eines Bausteins in ein Protokoll = Kopie** (neue, eindeutige `block.id`), **keine
  Referenz** → Protokolle bleiben **portabel/selbst-enthalten**.
- **Änderungen an globalen Bausteinen propagieren NICHT** in bereits eingefügte Kopien (bewusst).

## 7. Datenschutzgrenzen im Kreator

- Der Kreator **darf keine echten Patientendaten speichern**; er verarbeitet **nur neutrale Strukturen**.
- **UI macht deutlich:** „Neutrale Vorlage/Baustein — keine Patientendaten". Neutrale UI-Texte (S4):
  „Entwurf", „Muster übernehmen und bearbeiten".
- Schreibt ein Nutzer dennoch Patientendaten in Vorlagen, liegt das **außerhalb des Designs** und in
  **Nutzerverantwortung** (kein harter Auto-Block im MVP; Muster-Warnungen sind ein Post-MVP-Track).
- **Keine automatische Übernahme** aus der Einsatzansicht in den Kreator.
- **Keine automatische Speicherung** aus `caseState` in `library` — nur **bewusste** Nutzeraktion mit
  neutralen Inhalten.

## 8. Validierung

- **Schema-Validierung** gegen `protocol.schema.json` (dieselbe Quelle wie CI) **vor Speichern und
  Export**.
- **Pflichtfelder:** `schemaVersion`, `id`, `title`, `blocks`; je Block `id`, `title`, `points`; je
  Punkt die typ-spezifischen Pflichtfelder (`finding.normal`; `field.id`; `list.entries`;
  `text.content`; `findingGroup.key`+`findings[]`).
- **Eindeutige IDs** je Gültigkeitsbereich (§3); **keine leeren Titel** (Protokoll/Block).
- **Keine unbekannten Punkt-Typen**; **keine ungültigen `visibleIf`** (geführter Editor erzeugt nur
  gültige; importierte werden validiert).
- **Import:** JSON parsen → **Schema-validieren** → bei Fehler **ablehnen** mit verständlicher Meldung;
  `schemaVersion` prüfen (`0.x` akzeptiert; abweichend → Hinweis/Block, Migration dokumentiert).
- **Export:** nur **valide** Protokolle werden geschrieben.
- **Patientendaten-Erkennung:** **kein** harter Auto-Block im MVP; heuristische Warnhinweise sind
  Post-MVP.

## 9. UX-Grundstruktur (Tab „Protokolle", mobile-first)

```
Protokolle (Tab)
├─ Liste
│   ├─ [Protokoll A]  … openen ▸   ⋯ (Duplizieren · Umbenennen · Export · Löschen)
│   ├─ [Protokoll B]  …
│   ├─ [+ Neues Protokoll]
│   └─ [⇪ Importieren (JSON)]
└─ Editor (Vollbild)
    ├─ Kopf: Titel-Feld · [Vorschau/Testlauf] · [JSON ansehen (read-only)] · [Export]
    ├─ Variablen:  Liste + [+ Variable]   (Typ, Optionen, Default, de-gender)
    ├─ Blöcke:     Liste (Hoch/Runter)
    │     └─ Block: Titel · [optional ⨯] · [Sichtbar wenn …] · Punkte-Liste
    │           └─ Punkt: Typ-spezifisches Formular · [Sichtbar wenn …] · ↑/↓ · Löschen
    └─ Aktionsleiste unten: Speichern · Abbrechen
```
- **Mobile-first:** Vollbild-Formulare, große Touch-Targets, Bottom-Action-Bar, **kein** Drag-and-drop
  im MVP (einfaches Hoch/Runter genügt); Safe Areas; kein Hover-only.
- **Vorschau/Testlauf** nutzt den **zentralen Renderer** mit neutralem Default-Zustand (Variablen-
  Defaults, keine Eingabedaten) — zeigt dasselbe Ergebnis wie der Einsatz.
- **Gekapselte Schichten:** Editor schreibt über eine `useStorage()`/`library`-Schicht; **kein**
  direkter Storage-Zugriff in Komponenten; Rendern nur über die Runtime.

## 10. Pflicht-Tests für die spätere Umsetzung (#13)

- Protokoll **anlegen** (gültige Minimalstruktur, system-IDs eindeutig).
- Protokoll **duplizieren** (neue `protocol.id`, Inhalt identisch, unabhängig editierbar).
- **Block hinzufügen**; **optionalen Block** setzen (`optional:true`).
- **Punkt hinzufügen** (je Typ Pflichtfelder korrekt).
- **Variable hinzufügen** (inkl. `select`-Optionen, `de-gender`).
- **Einfache `visibleIf`-Regel** erzeugen → ergibt gültiges Prädikat; Runtime blendet korrekt.
- **Export validiert gegen `protocol.schema.json`** (nur valide werden exportiert).
- **Import lehnt ungültiges JSON ab** (Parse- und Schema-Fehler → klare Meldung, kein Teil-Import).
- **`library` speichert keine `caseState`-Daten** (Trennung erzwungen).
- **Runtime-Vorschau nutzt den zentralen Renderer** (keine Render-/`visibleIf`-Doppel-Logik).
- **Baustein-Einfügen kopiert** (neue `block.id`, keine Referenz; spätere Baustein-Änderung
  propagiert nicht).
- **Protokoll wird nicht mutiert**, wo Lese-Operationen erwartet werden (Vorschau/Validierung).

## Implementierung — Slice #13-A: Creator-Domainlogik (umgesetzt)

> Dieser Slice ist **reine Domainlogik**, **keine UI**. Sie ist die Vue-unabhängige Grundlage für die
> spätere „Protokolle"-Tab-UI.

- **Ort:** `packages/shared/creator/creator.mjs` (+ `creator.d.mts`, `creator.test.mjs`) — analog zur
  `renderer/`-Schicht, **dependency-frei**, mit `node --test` geprüft.
- **Reine Funktionen** (geben neue Strukturen zurück, **mutieren nie** die Eingabe — `structuredClone`):
  - Protokoll: `createProtocol` · `duplicateProtocol` · `renameProtocol`
  - Block: `addBlock` · `updateBlock` · `removeBlock` · `duplicateBlock`
  - Punkt (alle 5 Typen): `addPoint` · `updatePoint` · `removePoint` · `duplicatePoint`
  - Variablen (alle 4 Typen): `addVariable` · `updateVariable` · `removeVariable` · `findVariableReferences`
  - IDs: `slugify` · `createUniqueId` (stabil, zählerbasiert, kollisionsfrei) · `collectProtocolIds`
  - Einfaches `visibleIf`: `isSimpleVisibleIf` · `createSimpleVisibleIf`
  - Validierung/Transfer: `assertValidProtocolDraft` · `exportProtocol` · `parseImport`
- **Keine Persistenz** in diesem Slice (kein Storage), **keine Patientendaten**, **kein `caseState`**:
  `createProtocol` übernimmt **nur** bekannte Protokoll-Felder (kein blindes Spread) — Einsatz-/Fall-Daten
  können nicht in eine Vorlage gelangen.
- **Keine Auto-Übernahme** aus der Einsatzansicht; `caseState` und Creator bleiben getrennt.
- **Keine Renderer-/`visibleIf`-Duplizierung:** der Kreator **konstruiert/validiert** nur; Auswertung
  bleibt in der Runtime (`packages/shared/renderer`).
- **Entscheidungen innerhalb der Spec (dokumentiert):** Typwechsel nach Anlage wird **abgelehnt**
  (Post-MVP); `removeVariable` lässt **weiche** Referenzen stehen — `findVariableReferences` listet sie,
  `assertValidProtocolDraft` meldet sie als **Warnung** (nicht Fehler).
- **Validierungs-Hinweis:** `assertValidProtocolDraft` ist ein **leichter Struktur-/Draft-Check** für die
  Editier-Schleife (Pflichtfelder, ID-Eindeutigkeit **pro Namespace** — Block- und Punkt-ids dürfen sich
  überschneiden, wie im Seed —, gültige Typen, gültiges `visibleIf`). Die **autoritative** Prüfung bleibt
  `protocol.schema.json` (CI/Export). Export serialisiert nur valide Protokolle; Import parst + prüft und
  lehnt ungültiges JSON/Schema ab.

## Implementierung — Slice #13-B: Protokolle-Tab-Shell (umgesetzt)

> Dieser Slice ist eine **UI-Shell**, **kein** vollständiger Editor. Er beweist den Lese-/Auswahl-/
> Validierungs-/Vorschau-Fluss auf der #13-A-Domainlogik.

- **Navigation (S4):** App-Shell auf **4 Bottom-Tabs** umgestellt (`App.vue`, DaisyUI `dock`):
  *Einsatz · Protokolle · Bausteine · Einstellungen*. Tabwechsel via `v-show` → der Einsatz-`caseState`
  bleibt erhalten. Bausteine/Einstellungen sind Platzhalter (Gerät/Pico + Datenschutz/Reset folgen unter
  Einstellungen). Der bisherige fixe Send-Footer wandert in den **Einsatz**-Tab.
- **Flüchtige Creator-Session (keine Persistenz):** `composables/creatorSession.ts` (pure, Vue-frei,
  node-getestet) + `useCreatorSession.ts` (reaktiver Wrapper). `CreatorSession = { protocols, selectedProtocolId }`
  **nur im Arbeitsspeicher** — **kein** LocalStorage/SessionStorage/IndexedDB/Preferences/SQLite/Cache/Cloud.
  Initialisiert als **Kopie** des kanonischen Seeds. Storage-Technik bleibt offen.
- **Protokolle-Tab** (`components/protocols/`): `ProtocolsTab` orchestriert `ProtocolList`,
  `ProtocolActions` (Neu/Duplizieren/Umbenennen/Löschen), `ProtocolValidationPanel`
  (`assertValidProtocolDraft` — keine eigene Validierung), `ProtocolJsonView` (**read-only**, kein
  In-App-Editor), `ProtocolTestPreview` (über den **bestehenden Renderer**, neutraler Standardzustand).
- **Neutralitäts-Hinweis** sichtbar: „Protokolle sind neutrale Vorlagen. Keine Patientendaten oder
  Einsatzdaten in Vorlagen speichern."
- **Trennung gewahrt:** Creator-Session verarbeitet nur **neutrale** Vorlagen; **keine** Einsatz-/
  Patientendaten, **kein** `caseState`, **keine** Auto-Übernahme. Creator-Domainfunktionen werden
  **wiederverwendet**, nicht dupliziert; Vorschau nutzt **Renderer/Runtime**, nicht nachgebaut.

## Implementierung — Slice #13-C: Geführter Block-/Punkt-Editor (umgesetzt)

> Dieser Slice ist der erste **geführte Editor** im Protokolle-Tab: Blöcke und Punkte des ausgewählten
> Protokolls strukturiert bearbeiten. **Variablen-UI und `visibleIf`-Editor sind bewusst Folge-Slices.**

- **Editor-Komponenten** (`components/protocols/editor/`): `ProtocolEditor` (Layout + Neutralitäts-
  Hinweis) → `BlockList` (Blöcke anlegen/auswählen) → `BlockEditor` → `BlockForm` (Titel/optional/
  duplizieren/löschen), `PointList` (Punkt anlegen mit Typwahl, auswählen, duplizieren, löschen) →
  `PointEditor` → `PointForm` (typ-spezifische Felder).
- **Bearbeitbar je Punkt-Typ** (bewusst einfach): `field` (Label, Standardinhalt) · `finding`
  (Label, Normalbefund, Standard-Zustand) · `findingGroup` (Schlüssel, Label, Befunde mit Label/Normal,
  hinzufügen/entfernen) · `list` (Label, Einträge je Zeile) · `text` (Inhalt).
- **Wiederverwendung, keine Duplizierung:** Alle Mutationen laufen über die bestehenden
  Creator-Funktionen (`addBlock`/`updateBlock`/`duplicateBlock`/`removeBlock`/`addPoint`/`updatePoint`/
  `duplicatePoint`/`removePoint`), gekapselt in `creatorSession.ts` (pure, getestet). Validierung
  (`assertValidProtocolDraft`), read-only JSON und Test-Vorschau (Renderer) **aktualisieren sich live**.
- **Geteilte Session:** `useCreatorSession` ist ein **Modul-Singleton** (eine flüchtige Session pro
  App-Laufzeit) und verwaltet zusätzlich die **Editor-Auswahl** (aktiver Block/Punkt) — so teilen sich
  Liste, Editor, Validierung und Vorschau denselben Zustand. **Keine Persistenz.**
- **UX-Details:** Blocktitel über lokalen State (leerer Titel wird nicht committet → kein Abbruch durch
  `updateBlock`); Typwechsel nach Anlage **nicht** angeboten (durch #13-A abgelehnt); Löschen mit
  Bestätigung; mobile-first (kompakte Formulare, kein Drag-and-drop).
- **Trennung gewahrt:** nur neutrale Vorlagen; **kein** `caseState`, **keine** Auto-Übernahme, **keine**
  Patientendaten.

## Implementierung — Slice #13-D: Variablen-Editor + einfacher `visibleIf`-Editor (umgesetzt)

> Ergänzt den geführten Editor um **Variablen** und einen **einfachen `visibleIf`-Editor**. Komplexe
> Regeln bleiben **read-only**.

- **Variablen-Bereich** (`components/protocols/editor/Variable{Editor,List,Form}.vue`): Variable anlegen
  (Typwahl select/boolean/text/number), bearbeiten (Label, Standardwert, **select-Optionen** mit Wert/
  Anzeige, `de-gender`-Flag), löschen. **ID system-generiert/stabil**, Typ nur angezeigt (kein Typwechsel,
  #13-A).
- **Variable löschen mit Referenzschutz:** vor dem Löschen prüft die UI `findVariableReferences`. Solange
  Referenzen (visibleIf / `{{var:id}}`) bestehen, ist Löschen **blockiert** (konservativer Default laut
  #13-Spec) und die betroffenen Stellen werden angezeigt.
- **Einfacher `visibleIf`-Editor** (`VisibleIfEditor.vue`, an Block **und** Punkt): genau **eine**
  Bedingung — Quelle **Variable**/**Punkt** (datengetriebene Auswahl), Operatoren **eq/filled/truthy/
  state**; Bedingung setzen/bearbeiten/entfernen. Prädikat-Bau über `createSimpleVisibleIf` (Domain).
- **Komplexe Regeln read-only:** über `isSimpleVisibleIf` erkannt (inkl. `all`/`any`/`not` und `in`,
  das der MVP-Editor nicht anbietet) → Hinweis „Komplexe Regel – nur über Import/JSON sichtbar, im MVP
  nicht editierbar." Keine Bearbeitung, kein Datenverlust.
- **Live:** Validierung, read-only JSON und Renderer-Vorschau aktualisieren sich nach jeder Änderung; die
  Laufzeit-Sichtbarkeit greift über die **bestehende Runtime** (keine neue Render-/`visibleIf`-Logik).
- **Session:** `creatorSession.ts` um pure Variablen-/`visibleIf`-Aktionen erweitert (wiederverwendet
  `addVariable`/`updateVariable`/`removeVariable`/`findVariableReferences` und setzt `visibleIf` via
  `updateBlock`/`updatePoint`); `useCreatorSession` verwaltet zusätzlich die Variablen-Auswahl. **Keine
  Persistenz, kein `caseState`, keine Patientendaten.**

## Implementierung — Slice #13-E: Import-/Export-UX (umgesetzt)

> Import und Export sind **bewusste Nutzeraktionen**. Import ist **validiert**; Export gibt **nur valide**
> Protokolle aus. Beides bleibt **flüchtig** (keine Persistenz).

- **UI** (`components/protocols/ProtocolImportExport.vue`): „JSON exportieren" (Datei-Download),
  „Kopieren" (Zwischenablage) und „JSON importieren" (Datei-Auswahl) als schlichte Card im Protokolle-Tab.
  Erfolg/Fehler werden klar angezeigt. Import ist immer verfügbar; Export betrifft die Auswahl.
  Datenschutzhinweis sichtbar.
- **Export:** über `exportSelectedProtocol` → nutzt `exportProtocol` (validiert via
  `assertValidProtocolDraft`); **ungültig ⇒ blockiert** mit Fehlertext. Dateiname:
  `resqdocs-protocol-<slug>-<schemaVersion>.json`. Web-Blob-Download; Fallback **Zwischenablage**.
- **Import:** Datei lesen → `parseImport` (Schema-Validierung) → bei Erfolg **in die flüchtige Session**
  aufnehmen und auswählen (id-Kollision wird neu vergeben); bei Fehler **verständliche Meldung, Session
  unverändert**.
- **Reine Logik vs. Browser:** `creatorSession.ts` enthält `importProtocolIntoSession`/
  `exportSelectedProtocol` (rein, getestet, **keine** Browser-APIs). Datei-/Clipboard-/Blob-Logik liegt
  ausschließlich in `utils/fileTransfer.ts`. `useCreatorSession` bietet `importJson`/`exportSelected`.
- **Keine Persistenz:** Import schreibt **nicht** in LocalStorage/Preferences/IndexedDB/Cloud — nur in die
  flüchtige Session; nach App-Neustart weg, bis eine Storage-Entscheidung getroffen/gebaut ist.

## Implementierung — Slice #13-F1: Storage-Schicht (Verträge + Fake + Preferences-Settings, umgesetzt)

> Führt **nur** die gekapselte Storage-Schicht ein: Verträge, In-Memory-Library-Fake und
> Preferences-Settings. **SQLite folgt in #13-F2.** Protokolle werden hier **noch nicht** dauerhaft
> gespeichert (Library ist In-Memory). Keine `caseState`-Persistenz, keine Patientendaten.

- **Verträge** (`src/storage/types.ts`): `AppSettings`, `LibraryState`, `KeyValueAdapter`,
  `SettingsRepository`, `LibraryRepository`, `DEFAULT_SETTINGS`. UI/Composables kennen nur diese.
- **Adapter-Schicht:** `KeyValueAdapter` (get/set/remove) mit `preferencesAdapter` (Capacitor, **einzige**
  Plugin-Berührung) und `createFakeKeyValueAdapter` (In-Memory, für Tests). So ist das
  `SettingsRepository` Capacitor-frei und pur testbar.
- **Settings:** `createSettingsRepository(adapter)` — lädt/speichert/resettet `AppSettings`; **Sanitize**
  übernimmt **nur** die vier bekannten Felder → keine Protokolle/Patientendaten in Preferences.
- **Library (vorerst):** `createMemoryLibraryRepository()` (In-Memory-Fake; load/save/delete/reset; gibt
  Kopien zurück, nicht persistent). **SQLite (#13-F2) wird hinter demselben `LibraryRepository`-Interface
  eingehängt** — kein UI-/Session-Code ändert sich.
- **Composable:** `useStorage()` bündelt Settings (Preferences) + Library (Memory-Fake). **Kein**
  direkter `localStorage`/`sessionStorage`/`IndexedDB`-Zugriff im App-Code (Preferences kapselt das).
- **Minimale Integration:** `components/settings/SettingsTab.vue` (Default-OS, Theme, Reset) im
  Einstellungen-Tab. Die Creator-Session bleibt **bewusst flüchtig** (keine Auto-Persistenz).
- **Keine neue Dependency:** `@capacitor/preferences` war bereits vorhanden; SQLite-Plugin folgt erst mit
  #13-F2.

## Implementierung — Slice #13-F2: SQLite-Library + bewusste Session-Anbindung (umgesetzt)

> Ergänzt **SQLite für `library.protocols`** hinter dem F1-Interface; F1 bleibt unverändert. Protokolle
> werden **vor dem Speichern und nach dem Laden validiert**. **Kein Auto-Save.** `caseState` bleibt
> flüchtig und wird nie gespeichert.

- **Dependency:** **eine** neue — `@capacitor-community/sqlite@^8.1.0` (DR-0004). **Kein** jeep-sqlite/
  Web-Plugin; Web-Dev nutzt den vorhandenen In-Memory-Fake.
- **Schicht** (`src/storage/sqlite/`): `sqlClient.ts` (Interface) · `sqliteMigrations.ts`
  (`library_protocols`, **versioniert über `PRAGMA user_version`**, idempotent — #13-F2.1) · `sqliteLibraryRepository.ts`
  (`createLibraryRepositoryOnClient`, **rein**, gegen Fake-SQL-Client getestet) · `capacitorSqlClient.ts`
  (nativer Client + `createSqliteLibraryRepository`, **dynamisch** importiert) · `fakeSqlClient.ts` (Test).
- **Tabelle:** `library_protocols(id, title, schema_version, protocol_json, created_at, updated_at)` —
  `protocol_json` = vollständiges S1-Protokoll; `id/title/schema_version` gespiegelt; `created_at` bleibt
  bei Updates erhalten. **Save validiert** (throw bei ungültig); **Load validiert** (defektes JSON/
  ungültige Datensätze werden übersprungen, nicht still übernommen).
- **Backend-Wahl** (`useStorage`): nativ → SQLite (`Capacitor.isNativePlatform()`, einmalige
  `initLibrary()`), Web → Memory-Fallback. `libraryMode` (`sqlite`/`memory`) für die UI.
- **Session-Anbindung** (pur, getestet, repo per DI): `loadLibraryIntoSession` (Merge, Library gewinnt),
  `saveSelectedToLibrary` (validiert, bewusst). `useCreatorSession`: `loadFromLibrary`/`saveToLibrary`.
- **UI** (`ProtocolLibraryActions.vue`, im Protokolle-Tab): „Aus Bibliothek laden" / „In Bibliothek
  speichern", Erfolg/Fehler, Modus-Badge (persistent/In-Memory), Neutralitätshinweis. **Keine** Komponente
  berührt SQLite direkt. **Kein** Auto-Save.

## Härtung — Slice #13-F2.1 (umgesetzt)

- **Migrationen versioniert** über `PRAGMA user_version` (Migration 1 → `user_version=1`); `runMigrations`
  wendet nur Versionen > aktuell an → idempotent, gegen Fake-SQL-Client getestet. Kein Framework, keine
  Dependency.
- **Storage-Review** durchgeführt: Kapselung, Validierung vor Speichern + nach Laden, Web-Fallback,
  dynamischer Import, keine UI-direkte SQLite-/Preferences-/Browser-Storage-Nutzung, keine
  `caseState`-Persistenz, kein Auto-Save — **alle bestätigt**, keine Architekturänderung nötig.
- **UI-Klarheit:** `ProtocolLibraryActions` kennzeichnet im Memory-Modus „(nur In-Memory — nach
  App-Neustart weg)" bei Erfolgsmeldungen; Modus-Badge + Neutralitätshinweis bleiben.
- **Native-Smoke-Doku:** `docs/native-smoke.md` (manueller Persistenz-Test; TODO: `ios/`/`android/` noch
  hinzuzufügen).

## Implementierung — Slice #13-F3: Bausteine + Snippets (umgesetzt)

> Erweitert die Library um **neutrale Bausteine** (`library.blocks`) und **Snippets**
> (`library.snippets`) und bindet den **Bausteine-Tab** als MVP-Shell an. SQLite nativ / In-Memory im
> Web-Dev. Keine neue Dependency. Keine Patientendaten, kein `caseState`.

- **Datenmodell** (`storage/types.ts`): `LibraryBlock { id, title, block: ProtocolBlock, createdAt, updatedAt }`,
  `LibrarySnippet { id, title, text, createdAt, updatedAt }`; `LibraryState`/`LibraryRepository` erweitert.
- **Validierung** (`storage/libraryValidation.ts`, pur): `isValidLibraryBlock` (Block über die Domain-
  Validierung `assertValidProtocolDraft`) / `isValidLibrarySnippet`. **Vor Speichern** (throw) und **nach
  Laden** (defekte/ungültige werden übersprungen, nicht still übernommen).
- **SQLite** (`sqliteMigrations.ts`): **Migration v2** legt `library_blocks` + `library_snippets` an
  (`user_version` → 2, idempotent; v1 unverändert). Repository um `loadBlocks/saveBlock/deleteBlock`,
  `loadSnippets/saveSnippet/deleteSnippet` erweitert; **`resetLibrary` löscht alle drei** (nie Settings).
  Fake-SQL-Client tabellen-generisch; **Memory-Fake** spiegelt dieselbe API + Validierung.
- **Bausteine-Tab** (`components/library/`): `BausteineTab` → `BlockLibrarySection` (anlegen/umbenennen/
  löschen, JSON read-only) + `SnippetLibrarySection` (anlegen/bearbeiten/löschen). Composable
  `useBausteine` (Singleton) lädt über `useStorage` — **keine** Komponente berührt SQLite direkt.
  Neutralitäts- + Modus-Hinweis (persistent/In-Memory).
- **Einfügen in Protokolle (Copy-on-insert):** bewusst **Folge-Slice**.

## Implementierung — Slice #13-F4: Aus Library einfügen (Copy-on-insert, umgesetzt)

> Library-Bausteine/Snippets werden beim Einfügen **kopiert, nicht referenziert** → Protokolle bleiben
> portabel; spätere Library-Änderungen verändern eingefügte Kopien **nicht**. Bewusste Nutzeraktion,
> kein Live-Link, kein Auto-Save. Keine Patientendaten, kein `caseState`.

- **Domain** (`creator.mjs`): neue **`insertBlock(protocol, block)`** — hängt einen externen Block als
  Kopie an, vergibt frische kollisionsfreie Block-/Punkt-/findingGroup-Kind-IDs und remappt interne
  `visibleIf`-`point`-Referenzen (über `remapPredicate`); `var`-Referenzen und Referenzen auf Punkte
  **außerhalb** des Blocks bleiben erhalten (letztere können danach als Dangling-**Warnung** in
  `assertValidProtocolDraft` erscheinen). Snippet-Einfügen nutzt das bestehende `addPoint` (`text`-Punkt).
- **Session** (`creatorSession.ts`, pur, getestet): `insertLibraryBlockIntoSelectedProtocol` und
  `insertLibrarySnippetIntoSelectedProtocol(…, targetBlockId)` — validieren **nach** dem Einfügen und
  übernehmen nur bei gültigem Ergebnis; mutieren weder Session noch Library.
- **UI** (`components/protocols/InsertFromLibrary.vue`, im Protokolle-Tab): „Aus Library einfügen" —
  Bausteine (→ neuer Block) und Snippets (→ `text`-Punkt in wählbaren Zielblock; Default aktiver/erster
  Block, klare Meldung wenn kein Block vorhanden). Liest die Library über `useBausteine`, fügt über
  `useCreatorSession` ein — **keine** SQLite-Direktnutzung. Erfolg/Fehler + Neutralitätshinweis.

## Offene Folgepunkte

- **Folge-Slices:** Gerät/Pico + Info/Hilfe in Einstellungen (S4).
- Drag-and-drop-Umsortierung; Typwechsel nach Anlage; verschachtelter `visibleIf`-Editor; editierbares
  Raw-JSON/Expert-Modus; Patientendaten-Muster-Warnungen; `schemaVersion`-Migrationsassistent — Post-MVP.
- **#13-F (nächster Slice):** `library`-**Persistenz** gemäß DR-0004 (`useStorage()`/Repository +
  In-Memory-Fake für Tests; Preferences für Settings, SQLite für `library.*`) sowie **Bausteine**- und
  **Einstellungen**-Tabs.
