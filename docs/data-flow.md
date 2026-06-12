# Datenfluss & Datenschutz (S3)

> Beschreibt, welche Daten wie verarbeitet werden. **Keine Rechtsberatung**; **keine** Zusicherung vollständiger
> DSGVO-Konformität. Datenschutz ist hier Architektur, nicht Behauptung. Betreiber prüfen den Einsatz selbst.

## Datenarten
- **Patienten-/Gesundheitsdaten** (Art. 9 DSGVO): Name, Geburtsdatum, eGK, Diagnosen, Medikation/PZN, gescannte
  Inhalte, medizinische Freitexte. → **flüchtig, nie persistent.**
- **Neutrale, wiederverwendbare Daten:** eigene Protokoll-Vorlagen, Blöcke/Bausteine (z. B. „Mitfahrtverweigerung"),
  Snippets. → persistierbar.
- **App-Einstellungen:** Default-`os`, UI-Präferenzen. → persistierbar.
- **Geräte-Konfiguration (Pico):** SSID-`<id>` (Flash). → keine Patientendaten.
- **Secrets:** keine im Code/Repo. Das öffentliche AP-Passwort ist kein Secret, sondern ein dokumentierter Default.

## Speicherorte
- **Arbeitsspeicher (flüchtig):** `caseState` (aktueller Einsatz: Variablenwerte, Punkt-Übersteuerungen,
  `activeBlocks`, gescannte Felder).
- **Lokaler persistenter Speicher (Handy):** **Hybrid (Decision-Record 0004):** App-Einstellungen über
  `@capacitor/preferences` (klein, flach); strukturierte `library`-Daten (Protokolle, Blöcke, Snippets)
  über **SQLite** (`@capacitor-community/sqlite`) — gekapselt hinter einer `useStorage()`/Repository-
  Schicht. **Nur neutrale Daten**, nie Patientendaten. **Stand #13-F2:** Settings über Preferences;
  `library.protocols` über **SQLite** auf nativen Plattformen (Web-Dev: In-Memory-Fallback). Protokolle
  werden **vor dem Speichern und nach dem Laden validiert**; Speichern ist eine **bewusste** Nutzeraktion
  (**kein** Auto-Save). Schema versioniert über `PRAGMA user_version` (#13-F2.1). Seit #13-F3 auch
  `library.blocks` (neutrale Bausteine) + `library.snippets` (neutrale Texte) in eigenen SQLite-Tabellen
  (Migration v2). `caseState` ist **nicht** Teil des Storage. Nativer Persistenz-Smoke-Test:
  `docs/native-smoke.md`.
- **Pico-Flash:** nur Geräte-Konfiguration (SSID-`<id>`), **keine** Patientendaten.
- **Optionale Cloud:** nur neutrale Referenz-/Bausteindaten.

## Flüchtige Daten (`caseState`)
- Existieren nur im Speicher für den aktuellen Einsatz/die aktuelle Ausgabe.
- Werden bei „Sitzung zurücksetzen" sowie bei App-Schließen/Neuladen **verworfen**.
- Werden **nicht** automatisch gespeichert, gecacht, exportiert oder synchronisiert.

## Persistente Daten (`library`)
- Ausschließlich **neutrale** Inhalte: eigene Vorlagen, Blöcke, Snippets, Einstellungen. **Keine** Patientendaten.
- Bleiben lokal; optionales Cloud-Backup ist opt-in und nur für diese neutralen Daten.

## Verbotene Persistenz
Patientendaten dürfen **nie** landen in: LocalStorage, SessionStorage, IndexedDB, Cache API, Service-Worker-Cache,
Cookies, App-Datenbanken, automatischen Backups, Logs, Fehlerberichten, Telemetrie, Analytics, Download-
Verzeichnissen ohne bewusste Nutzeraktion.

## Datenfluss App → Pico
- `POST /type` überträgt den zu tippenden **Text** (kann Patientendaten enthalten) lokal über HTTP (CapacitorHttp).
  **Nur im Body**, nie in URL/Query. **Kein** Logging, **kein** Cache. Der Pico tippt und hält nichts vor — reine
  Durchleitung, transient. (`POST /config` enthält nur die neutrale SSID-`<id>`.)
- **Gekapselt (#14-B):** über `apps/pico-pwa/src/pico/` (`picoClient`/`capacitorHttpAdapter`/`usePicoDevice`),
  keine HTTP-Logik in Komponenten. Base-URL = neutrale App-Einstellung `picoBaseUrl` (keine Patientendaten/
  Secrets). Fehler werden nur als HTTP-Status normalisiert (kein Payload-Logging). Der manuelle Testtext im
  Gerät/Pico-Bereich lebt **nur im RAM** und wird **nicht** persistiert.

## Datenfluss BMP-Scan → Protokoll (#9)
- Der BMP-Data-Matrix-Code enthält **Gesundheitsdaten (Art. 9 DSGVO)** inkl. Patient-/Arzt-Feldern.
  Verarbeitung ausschließlich **on-device und flüchtig**: Scan → Parser → prüfbarer Entwurf →
  ins Protokoll tippen → verwerfen. Kein Bild, kein Roh-String, kein Parser-Ergebnis wird
  persistiert, geloggt oder in eine Cloud gegeben.
- **Datenminimierung im Parser erzwungen** (`packages/shared/medplan/medplan.mjs`): die Elemente
  `P` (Patient), `C` (Custodian) und `O` (Observation) werden **nie gelesen** - ihre Attribute
  werden nicht extrahiert. Extrahiert werden Medikationszeilen (PZN, Name, Wirkstoff/Stärke,
  Darreichungsform, Dosierschema, Einheit, Hinweis, Grund) plus Seitenzahl sowie - seit #144 -
  vom `A`-Element (**Aussteller** = Praxis/Apotheke/Krankenhaus, kein Patientendatum) NUR
  Name, Ort, Arzt-/Praxisnummer (lanr/idf/kik) und Telefon. Der Aussteller landet **nur durch
  aktive Nutzerwahl** im Protokoll (Hausarzt/Facharzt; Default: nicht dokumentieren).
  Per Test abgesichert (Ergebnis enthält nachweislich keine P/O-Inhalte und keine
  Straße/PLZ/E-Mail des Ausstellers).
- Der Scanner ist ein **reiner JS-Decoder** (`@zxing/browser`, Data Matrix) im WebView (#36):
  dekodiert lokal, kein API-Key, kein Netz, keine Google-Dienste - läuft damit auch auf
  Huawei-Geräten ohne GMS und im Browser. Google ML Kit wurde wegen seiner Telemetrie
  (`GoogleDataTransport` → firelog.googleapis.com) bewusst entfernt.

## Datenfluss App → lokaler Speicher
- Nur `library` (neutrale Bausteine) + Einstellungen über eine gekapselte Storage-Schicht (`useStorage()`).
  UI-Komponenten greifen nicht direkt auf Storage-APIs zu. **Nie** Patientendaten.

## Datenfluss App → optionale Cloud
- Optional, opt-in, datensparsam, **nur neutrale Daten** (eigene Bausteine; Community-PZN-DB = CC0).
- **Niemals** Patientendaten. Lokale Verarbeitung hat Vorrang. Standardmäßig datensparsam konfiguriert.

## Trennung `caseState` ↔ `library`
- Technisch getrennte Stores. Aus `caseState` fließt **nichts** automatisch nach `library` oder Cloud.
- Übernahme neutraler Inhalte in die `library` nur durch **bewusste Nutzeraktion**.
- **Aus `library` in ein Protokoll einfügen (#13-F4)** ist **Copy-on-insert**: Baustein/Snippet werden
  kopiert (frische IDs), **nicht** referenziert; die `library` bleibt unverändert und spätere Library-
  Änderungen wirken **nicht** auf eingefügte Protokoll-Kopien. Kein Live-Link, kein Auto-Save.

## Lösch-/Reset-Verhalten
- Funktion „Sitzung zurücksetzen" (Einsatz-Tab) verwirft `caseState` vollständig.
- App-Schließen/Neuladen verwirft `caseState`. Temporäre Scan-/OCR-Daten werden nach Verarbeitung verworfen.
- **Einstellungen-Tab (#14-A):** „Library löschen" entfernt **nur** neutrale Library-Inhalte (Protokolle,
  Bausteine, Snippets) über `LibraryRepository.resetLibrary()` — **nicht** die App-Einstellungen.
  „App-Einstellungen zurücksetzen" setzt **nur** die Einstellungen zurück. „Alles lokal zurücksetzen"
  kombiniert beide. Alle Aktionen mit Bestätigung, über die gekapselte `useStorage`-Schicht; `caseState`
  ist davon nicht betroffen (flüchtig, kein Storage-Pfad).

## Service-Worker-/Cache-Regeln
- Auslieferung primär **nativ (Capacitor)**; ein Service Worker existiert höchstens für einen veröffentlichten
  Web-Build und cacht **nur App-Shell/statische Assets**.
- **Patientendaten und sensible API-Antworten werden nie gecacht.**

## Logging-Regeln
- Logs/Fehlerberichte enthalten **keine** Patientendaten (keine Namen, Diagnosen, Scans, Freitexte).
- Erlaubt sind ereignisbezogene, nicht-sensible Marker (z. B. `scan_completed`, `type_failed`).

## Export-/Kopierverhalten
- Export/Kopieren nur durch **bewusste Nutzeraktion**. Vorher Hinweis: der Inhalt ist ein **Entwurf**, und mit
  Speicherung/Weitergabe übernimmt der Nutzer die Verantwortung.

## Nutzerverantwortung
- Speichert/exportiert/überträgt ein Nutzer bewusst Patientendaten außerhalb des flüchtigen Workflows, liegt das in
  seiner bzw. der verantwortlichen Stelle Verantwortung. Die App fördert das nicht.

## Hinweise
- **Patientendaten werden durch die Anwendung nicht dauerhaft gespeichert.**
- **Cloud ist nur für neutrale, wiederverwendbare Bausteine vorgesehen — nie für Patientendaten.**
- Keine Rechtsberatung; keine Zusicherung vollständiger DSGVO-Konformität.
