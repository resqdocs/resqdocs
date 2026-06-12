# App-Informationsarchitektur (S4)

> **Umbenennung (#138, 2026-06-12):** Die Tabs heißen in der App jetzt **Einsatz, Vorlagen
> (vorher „Protokolle"), Textbausteine (vorher „Bausteine"), Einstellungen**. Dieses Dokument
> verwendet teils noch die alten Namen; gemeint sind dieselben Bereiche.


> **Fundament-Spezifikation S4** — wie die App fachlich und strukturell aufgebaut ist, *bevor* weitere
> UI-Features oder der Protokoll-Kreator (#13) gebaut werden. Mobile-first, lokal-first, Usability als
> Top-Priorität. Status: **Entwurf (0.x)** — `1.0`/MVP-Zeitpunkt deklariert der Maintainer.
> Bezug: `protocols/SCHEMA.md` (S1), `docs/pico-api.md` (S2), `docs/data-flow.md` (S3),
> `docs/app-runtime.md` (Runtime), `docs/decisions/0002-spec-s4-app-ia.md`.

## Maintainer-Entscheidungen (S4, via Frage-Tool)

- **Navigation:** **4 Bottom-Tabs** — *Einsatz · Protokolle · Bausteine · Einstellungen*. **Gerät/Pico**
  ist ein Unterbereich von *Einstellungen* (kein eigener Tab); der **Verbindungs-Indikator** bleibt global
  im Header.
- **Protokoll-Kreator (#13):** **Teil des MVP** (Erstellen/Bearbeiten eigener Protokolle).
- **Info/Hilfe:** **Unterbereich von *Einstellungen*** (kein eigener Tab).
- **Datenschutz/Reset:** **„Sitzung zurücksetzen" prominent im *Einsatz***; Lösch-Funktionen
  (Bausteine / alle lokalen Daten) in *Einstellungen*.

---

## 1. Zweck der App-IA

S4 legt die **Bereichsstruktur, Navigation und Datenverantwortung** der App fest. Sie ist wichtig, weil
die App zwei grundverschiedene Welten sauber trennen muss:

- **Runtime (Einsatz):** verarbeitet **konkrete, flüchtige** Einsatzdaten (können Patientendaten sein).
- **Creator/Bausteine/Einstellungen:** verwalten **neutrale, persistente** Strukturen (Protokolle,
  Bausteine, App-/Geräte-Einstellungen) — **nie** Patientendaten.

Ohne klare IA droht Vermischung dieser Welten (Datenschutzrisiko) und eine unübersichtliche Navigation.
S4 ist die verbindliche Grundlage, gegen die jedes spätere UI-Feature geprüft wird.

| Welt | Bereiche | Speicher |
|---|---|---|
| **Runtime** | Einsatz | `caseState` — flüchtig |
| **Creator** | Protokolle (Kreator), Bausteine | `library` — persistent, neutral |
| **Einstellungen** | App-/Geräte-Einstellungen, Datenschutz, Info/Hilfe | lokal, neutral |

## 2. Hauptbereiche der App

Sechs fachliche Bereiche, abgebildet auf **4 Tabs** (Gerät + Info/Hilfe als Unterbereiche von
*Einstellungen*).

### 2.1 Einsatz (Tab) — Runtime/Composer
- **Protokollauswahl** (aktives Protokoll für den Einsatz wählen).
- **Variablen** setzen (z. B. Geschlecht) → steuern Sichtbarkeit/Texte über die gemeinsame Runtime.
- **Punkte** ausfüllen/abhaken; **optionale Blöcke** aktivieren (`activeBlocks`).
- **Live-Vorschau** des Klartexts (`render(...)`), konsistent zur Eingabemaske (geteilte Runtime).
- **Kopieren / „An Bridge senden"** (`POST /type`, App chunkt > 16384 Zeichen; OS aus App-Einstellung).
- **„Sitzung zurücksetzen"** — **prominent**, verwirft `caseState` vollständig.
- **Medplan-Scan** (on-device, nur Medikament+Dosierung → transient): **eigener Track #9–#11**, nicht
  Teil dieses S4-Schnitts.
- **Fall-Zustand (`caseState`) ist flüchtig** — keine Persistenz (S3).

### 2.2 Protokolle (Tab) — Auswahl + Kreator
- **Liste** der eigenen Protokolle (persistent, neutral); **aktives** Protokoll wählen.
- **Kreator (#13, MVP):** Blöcke → Punkte, Standardinhalt, **Variablen**, **`visibleIf`**, **optionale
  Blöcke** ohne Code zusammenklicken (S1-Modell).
- **Import/Export** als JSON (Teilen opt-in). **Seed-Muster** kopierbar — **kein** kanonisches
  Maintainer-Protokoll; jeder baut sein eigenes Standardprotokoll.
- Protokolle sind **neutrale Daten** → persistierbar; **privat**, kein Auto-Teilen.

### 2.3 Bausteine (Tab) — neutrale Block-Bibliothek
- Verwaltung **nutzer-globaler, wiederverwendbarer Blöcke** (z. B. „Mitfahrtverweigerung") + **Snippets**
  (neutrale Texte): anlegen, bearbeiten, löschen. **Neutral, persistent** (`library`).
- **Umgesetzt (#13-F3):** MVP-Shell + Persistenz über `library.blocks`/`library.snippets` (SQLite nativ /
  In-Memory im Web-Dev), gekapselt über `useStorage`/`LibraryRepository`.
- Einsetzen in ein Protokoll = **Kopie** (neue Block-`id`), **nicht** Referenz → Protokolle bleiben
  portabel/selbst-enthalten (S1). **Umgesetzt (#13-F4):** „Aus Library einfügen" im Protokolle-Tab
  (Baustein → neuer Block, Snippet → `text`-Punkt; frische IDs + `visibleIf`-Remap, kein Live-Link).
- **Später:** optionale Cloud-Sync-Schicht — **nur** für diese neutralen Bausteine, opt-in.

### 2.4 Gerät / Pico — Unterbereich von *Einstellungen*
- **Verbindung** zur Bridge: Status über `GET /health` (Header-Indikator) und `GET /status`
  (`name, fwVersion, apiVersion, ready, defaultOs`).
- **Senden** läuft im Einsatz (`POST /type`).
- **SSID-`<id>` ändern** über `POST /config` (Validierung `^[A-Za-z0-9_-]{1,23}$`, Hinweis auf
  AP-Neustart). Passwort fix/öffentlich (nur Anzeige). `/config` ist späterer/Recovery-Weg + Serial.
- **OS-Einstellung** (win_de/mac_de/ios) — Default in App-Einstellungen, pro Sendung mitgeschickt.
- **Verbindungszustand** verständlich darstellen („keine Bridge").

### 2.5 Einstellungen (Tab)
- **App-Einstellungen** (lokal, `@capacitor/preferences`): **Default-OS**, UI-Präferenzen, Theme.
- **Gerät/Pico** (2.4).
- **Datenschutz/Reset:** „Library löschen", „App-Einstellungen zurücksetzen", „Alles lokal zurücksetzen",
  Hinweistexte (keine dauerhafte Speicherung von Patientendaten), Nutzerverantwortung.
- **Info/Hilfe** (2.6).
- **Umgesetzt (#14-A):** strukturierte Shell — App-Einstellungen · Gerät/Pico (**Vorschau**, echte
  Kommunikation in #14-B) · Datenschutz & lokale Daten · Info/Hilfe · Open Source. Lösch-Aktionen über
  `useStorage` (`resetLibrary`/`resetSettings`) mit Bestätigung; **keine** direkte SQLite-/Preferences-
  Nutzung in Komponenten. `caseState`-Reset bleibt im Einsatz-Tab.

### 2.6 Info / Hilfe — Unterbereich von *Einstellungen*
- **Fachlicher Hinweis** (Hilfsmittel, kein Ersatz; keine medizinische/rechtliche Garantie).
- **Datenschutzhinweis** (Architektur, keine DSGVO-Zusicherung — S3).
- **Open-Source-Hinweise**, **Lizenz** (Code GPL-3.0-or-later, Daten CC0), **Mitwirken** (Repo/Issues),
  **Doku**-Verweise, Version.

## 3. Navigation

**Bottom-Tab-Leiste** (DaisyUI `dock`), mobile-Standard, schneller touch-freundlicher Wechsel:

```
┌───────────────────────────────────────────────┐
│  (Bereichsinhalt)            ● Bridge verbunden │   ← globaler Header: Titel + Verbindungs-Indikator
│                                                 │
└───────────────────────────────────────────────┘
   Einsatz  │  Protokolle  │  Bausteine  │  Einstellungen
    ▲aktiv
```

- **Begründung 4 Tabs:** „Einsatz" ist der tägliche Treiber und bleibt im Fokus. „Protokolle"
  (inkl. Kreator) und „Bausteine" sind die Erstellungs-/Verwaltungsseite. „Gerät" wird selten geändert
  → Unterbereich von „Einstellungen"; die laufende Verbindung ist über den **Header-Indikator** ohnehin
  immer sichtbar. 4 Tabs sind auf kleinen Displays komfortabel (5 wären das Limit).
- **Composer (Verwenden) und Kreator (Erstellen) sind getrennt** (eigene Bereiche, nie vermischt).
- **Header (global):** App-Titel + persistenter **Verbindungs-Indikator** (verbunden / keine Bridge).

## 4. Datenverantwortung je Bereich

| Bereich | Welche Daten | Flüchtig/Persistent | Patientendaten? | Cloud? | Export/Kopieren | UI-Hinweise |
|---|---|---|---|---|---|---|
| **Einsatz** | Variablenwerte, Punkt-Übersteuerungen, `activeBlocks`, gescannte Felder, Klartext-Ausgabe | **flüchtig** (`caseState`) | **ja, möglich** | **nein** | „An Bridge senden" / Kopieren (bewusst) | „Entwurf", „flüchtig, nicht gespeichert", fachlicher Hinweis, Reset sichtbar |
| **Protokolle/Kreator** | eigene Protokoll-Vorlagen (Struktur) | **persistent** (`library`) | **nein** | optional, später, opt-in (neutral) | Import/Export JSON (bewusst) | „neutrale Vorlage", „Entwurf", „Muster übernehmen & bearbeiten" |
| **Bausteine** | neutrale Blöcke/Snippets | **persistent** (`library`) | **nein** | optional, später, opt-in (neutral) | Einsetzen = Kopie; Export (bewusst) | „neutral, keine Patientendaten" |
| **Gerät/Pico** | SSID-`<id>`, OS-Default, Verbindungszustand | **persistent** (App/Flash) | **nein** | **nein** | — | AP-Neustart-Hinweis, Passwort öffentlich |
| **Einstellungen** | App-Präferenzen, Default-OS | **persistent** (lokal) | **nein** | **nein** | — | Datenschutz-/Reset-Hinweise |
| **Info/Hilfe** | statische Texte | — | **nein** | **nein** | — | fachlicher/rechtlicher Hinweis |

**Verbindlich (S3):** Patientendaten **nie** in LocalStorage, SessionStorage, IndexedDB, Cache API,
Service-Worker-Cache, Cookies, App-DBs, Backups, Logs, Telemetrie, Analytics. Cloud **nur** für neutrale
Bausteine, opt-in. Der `POST /type`-Body kann Patientendaten enthalten → nur im Body, kein Logging/Cache.

## 5. Runtime vs. Creator (saubere Trennung)

- **Runtime/Einsatz** verarbeitet **konkrete Einsatzdaten flüchtig** (`caseState`).
- **Creator (Protokolle + Bausteine)** verarbeitet **neutrale Strukturen persistent** (`library`).
- **`caseState` und `library` sind technisch getrennte Stores** und dürfen **nicht vermischt** werden.
- **Keine automatische Übernahme** aus Einsatzdaten in die `library`.
- **Neutrale** Inhalte (z. B. ein selbst gebauter Block) wandern in die `library` **nur durch bewusste
  Nutzeraktion** — und nur, wenn sie frei von Patientendaten sind.
- Sichtbarkeit (`visibleIf`) und Platzhalter werden in **beiden** Welten über die **gemeinsame
  Runtime-Schicht** ausgewertet (`packages/shared/renderer/runtime.mjs`) — keine Doppel-Logik.

## 6. Datenschutz- und Reset-Konzept

| Aktion | Wo | Wirkung |
|---|---|---|
| **„Sitzung zurücksetzen"** | **Einsatz (prominent)** | verwirft `caseState` vollständig (Variablen → Defaults, Überschreibungen, `activeBlocks`, Scan-Felder) |
| **„Lokale Bausteine löschen"** | Einstellungen → Datenschutz | entfernt neutrale Bausteine aus der `library` |
| **„Alle lokalen Daten löschen"** | Einstellungen → Datenschutz | setzt App auf Auslieferungszustand (Protokolle, Bausteine, Präferenzen) — neutrale Daten; Patientendaten gibt es ohnehin keine persistent |

- **App-Schließen/Neuladen** verwirft `caseState` automatisch. Temporäre Scan-/OCR-Daten werden nach
  Verarbeitung verworfen.
- **Export/Kopieren** nur durch **bewusste Nutzeraktion**, mit Hinweis: Inhalt ist **Entwurf**, mit
  Speicherung/Weitergabe übernimmt der Nutzer die Verantwortung.
- **Nutzerverantwortung:** Speichert/überträgt jemand bewusst Patientendaten außerhalb des flüchtigen
  Workflows, liegt das in seiner/der verantwortlichen Stelle Verantwortung. Die App fördert das nicht.
- **Keine Rechtsberatung, keine DSGVO-Zusicherung** (S3).

## 7. MVP-Schnitt

> Der Maintainer definiert den `1.0`/MVP-Zeitpunkt. Dieser Schnitt ist der **vereinbarte S4-Rahmen**.

**MVP (enthalten):**
- **Navigation:** 4 Tabs (Einsatz · Protokolle · Bausteine · Einstellungen).
- **Einsatz:** Composer auf S1-Modell, Variablen/Punkte/optionale Blöcke, Live-Vorschau, „An Bridge
  senden", „Sitzung zurücksetzen". `caseState` flüchtig.
- **Protokolle:** Liste + **Protokoll-Kreator (#13)** (Blöcke/Punkte/Variablen/`visibleIf`/optionale
  Blöcke), Import/Export JSON, Seed-Muster kopieren.
- **Bausteine:** neutrale Block-Bibliothek (anlegen/bearbeiten/löschen, copy-on-insert).
- **Einstellungen:** Default-OS, **Gerät/Pico** (Status, SSID-`<id>` via `/config`), Datenschutz/Reset,
  **Info/Hilfe** (fachlich, Lizenz, Mitwirken).

**Nach MVP (eigene Tracks):**
- Optionale **Cloud-Sync** neutraler Bausteine (opt-in, nie Patientendaten).
- **Medplan-Scan** (#9–#11, on-device).
- Teilen von Protokollen über reine Datei-Weitergabe hinaus.

**Ausdrücklich nicht Ziel:**
- Cloud für **Patientendaten** (niemals).
- **Kanonisches** Maintainer-Protokoll (es gibt nur Seeds/Muster).
- **Auth** auf der Pico-API (MVP); OTA-Firmware-Updates (separat, auth-/signiert).
- Patientendaten-Persistenz jeglicher Art.

## 8. Offene Entscheidungen

**Entschieden (Abschnitt „Maintainer-Entscheidungen"):** Navigation (4 Tabs), Kreator im MVP,
Info/Hilfe in Einstellungen, Reset prominent im Einsatz.

**Noch offen (eigene spätere Frage-Runden, nicht in S4):**
- Konkretes UI-Design/Styling je Bereich (DaisyUI-Komponenten).
- **Storage-Backend entschieden (Decision-Record 0004): Hybrid** — `@capacitor/preferences` für
  App-Einstellungen, **SQLite** (`@capacitor-community/sqlite`) für strukturierte `library`-Daten,
  hinter gekapselter `useStorage()`-Schicht. Umsetzung ist ein separater Folgeschritt.
- Sync-/Konfliktmodell der optionalen Cloud-Bausteine.
- Genauer MVP-Umfang des Kreators (welche Punkt-/Variablentypen zuerst editierbar) → mit #13.

## Querschnitt (verbindlich)

- **Gekapselte Schichten:** `usePicoApi()`/Verbindung, `useStorage()`/`library`, Runtime
  (`useProtocolRuntime`/`runtime.mjs`), `usePrivacyReset()`. **UI greift nicht direkt** auf
  HTTP/Storage zu.
- **Neutrale UI-Texte:** verboten „rechtssicher dokumentieren", „final erstellen", „medizinisch
  geprüft"; besser „Entwurf", „Muster übernehmen und bearbeiten", „An Zielgerät tippen".
- **Fachlicher Hinweis** sichtbar (Hilfsmittel, kein Ersatz). Erstanzeige bei sensibler Verarbeitung.
- **Mobile-first:** große Touch-Targets, Safe Areas, Tastaturverhalten, kein Hover-only.
- **Lokal-first:** alles funktioniert offline; Cloud ist optionaler Zusatz, nie Voraussetzung.
- **Verbindungs-/Lade-/Offline-/Fehlerzustände** verständlich; „keine Bridge" klar anzeigen.
