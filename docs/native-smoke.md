# Native Smoke-Test — SQLite-Library-Persistenz (#13-F2.1)

> **Ziel:** manuell prüfen, dass die lokale Bibliothek (`library.protocols`) auf einer **nativen**
> Plattform (iOS/Android) über App-Neustarts **persistent** ist — und dass der flüchtige Einsatz-Zustand
> (`caseState`) dabei **nicht** wiederhergestellt wird. Bezug: DR-0004, `docs/protocol-creator-mvp.md`.

> **Wichtig:** **Web-Dev (Vite) beweist KEINE native Persistenz.** Im Browser nutzt die App den
> **In-Memory-Fallback** (`libraryMode = 'memory'`); gespeicherte Protokolle sind nach Reload weg. Native
> SQLite (`@capacitor-community/sqlite`) greift nur, wenn `Capacitor.isNativePlatform()` true ist.

## Voraussetzungen

- Node-Toolchain + `npm install` im `apps/pico-pwa`.
- Capacitor-CLI ist vorhanden (`@capacitor/cli`, devDependency). App-Config: `capacitor.config.ts`
  (`appId: org.resqdocs.app`, `webDir: dist`).
- **iOS:** macOS + Xcode (CocoaPods erforderlich: `brew install cocoapods` (ML-Kit-Plugin hat kein SPM, #31)).
- **Android:** Android Studio + SDK.

## Native Projekte

**iOS ist im Repo** (`apps/pico-pwa/ios/`, seit #25) - inkl. konfigurierter `Info.plist`:
`NSCameraUsageDescription` (BMP-Scan #9), `NSLocalNetworkUsageDescription` und
`NSAllowsLocalNetworking` (lokale Pico-Bridge, bewusst kein `NSAllowsArbitraryLoads`).
**Android** wird bei Bedarf analog erzeugt (`npx cap add android`) und eingecheckt.

Vor jedem nativen Lauf den Web-Build synchronisieren:

```bash
cd apps/pico-pwa
npm install                   # einmalig pro Maschine
npm run build                 # erzeugt dist/ (webDir)
npx cap sync ios              # kopiert dist/ + native Plugins
```

> Beim Hinzufügen der Plattformen werden auch die in `capacitor.config.ts` beschriebenen Cleartext-/ATS-
> Ausnahmen für den lokalen Pico eingerichtet (separat dokumentieren).

## Build / Run

```bash
cd apps/pico-pwa
npm run build && npx cap sync
npx cap run ios               # bzw.: npx cap run android   (oder in Xcode/Android Studio öffnen)
# alternativ: npx cap open ios | npx cap open android
```

## Testschritte

1. App auf dem nativen Gerät/Simulator **starten**.
2. Tab **Protokolle** öffnen. Erwartung: Badge **„persistent (SQLite)"** (nicht „nur In-Memory").
3. Ein Protokoll **duplizieren** oder im Editor **bearbeiten** (z. B. Block/Variable hinzufügen).
4. **„In Bibliothek speichern"** drücken. Erwartung: Erfolgsmeldung **ohne** „nur In-Memory"-Zusatz.
5. App **vollständig schließen** (aus dem App-Switcher entfernen, nicht nur in den Hintergrund).
6. App **neu starten**.
7. Im Tab **Protokolle** auf **„Aus Bibliothek laden"** drücken.
8. Prüfen: Das gespeicherte Protokoll ist **vorhanden** (Titel/Inhalt wie gespeichert).
9. Prüfen: Im Tab **Einsatz** ist **kein** früherer `caseState` wiederhergestellt — Variablen stehen auf
   Defaults, keine alten Punkt-Eingaben, keine aktiven optionalen Blöcke.

## Erwartetes Ergebnis

- Schritt 2: Modus-Badge **„persistent (SQLite)"**.
- Schritt 8: Protokoll überlebt den Neustart (SQLite-Persistenz bestätigt).
- Schritt 9: `caseState` ist **flüchtig** — wurde **nicht** persistiert/wiederhergestellt.

## Fehlerbilder

- **Badge „nur In-Memory" auf nativem Gerät:** `initLibrary()` ist auf den Memory-Fallback gefallen —
  SQLite-Plugin nicht verfügbar/nicht synchronisiert (`npx cap sync` vergessen) oder Verbindungsfehler.
  In der nativen Konsole nach `SQLite-Library nicht verfügbar, nutze In-Memory:` suchen.
- **Protokoll nach Neustart weg:** Speichern fehlgeschlagen (Validierung/SQL-Fehler — Statusmeldung
  prüfen) oder DB-Datei nicht persistiert.
- **caseState nach Neustart „zurück":** wäre ein **Regressionsfehler** — `caseState` darf **nie**
  persistiert werden (kein Storage-Schreibpfad dafür; vgl. `creatorSession`/`useStorage`).

## Hinweise

- Persistenz wird durch automatisierte Tests **gegen einen Fake-SQL-Client** (`node:test`) auf
  Logikebene abgesichert (Migration/`user_version`, Save/Load-Validierung, kein Auto-Save). Der native
  Smoke-Test deckt die **echte** SQLite-Schicht ab, die in Node nicht lauffähig ist.
- Es werden **nur neutrale Protokollvorlagen** gespeichert — **keine** Patientendaten, **kein**
  `caseState`, **keine** Protokolle in Preferences.

## Pico-Verbindung (#14-B, optionaler Zusatz-Smoke)

Der Gerät/Pico-Bereich (Einstellungen) kann gegen eine laufende Bridge geprüft werden: Base-URL setzen
(Default `http://10.10.10.1`), „Verbindung prüfen" (`GET /health`), „Status abrufen" (`GET /status`),
neutralen Testtext über „Testtext senden" (`POST /type`).

- **Nativ:** Cleartext-HTTP zur lokalen Bridge erfordert Android-`network_security_config` bzw. iOS-ATS-
  Ausnahmen für den lokalen Host. Diese werden **beim Hinzufügen der nativen Plattformen** eingerichtet
  (`capacitor.config.ts` beschreibt es) — **TODO**, solange `ios/`/`android/` fehlen.
- **Web-Dev:** kann durch CORS/Mixed-Content scheitern; das ist erwartbar und **kein** Beweis gegen die
  native Funktion.
- **Datenschutz:** Im Testtext **keine Patientendaten** verwenden; `/type` überträgt transient, nichts wird
  gespeichert/geloggt.
