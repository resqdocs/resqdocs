# ResQDocs

**Schnelle, strukturierte Einsatzdokumentation für den Rettungsdienst — getippt von einer USB-Bridge direkt ins Zielsystem.**

ResQDocs ersetzt mühsames Tippen auf Einsatzgeräten (z. B. NIDA-Pads) durch eine
Smartphone-App: Dokumentieren per Vorlagen, Textbausteinen und Medikationsplan-Scan,
Übertragen per Knopfdruck — eine Mikrocontroller-Bridge tippt den fertigen Text als
USB-Tastatur in das Zielgerät. Keine Cloud, keine Telemetrie, keine dauerhafte
Speicherung von Patientendaten.

> **Hinweis:** ResQDocs ist ein Dokumentations-Hilfsmittel und **kein Medizinprodukt**.
> Verantwortung für Vorgehen, Bewertung und Dokumentation bleibt beim Anwender.
> Details: [docs/disclaimer.md](docs/disclaimer.md)

## Wie es funktioniert

```
Smartphone-App (Composer)  --WLAN-->  Bridge (Raspberry Pi Pico 2 W)  --USB-HID-->  Zielgerät
   Vorlagen, Bausteine,                 tippt als USB-Tastatur,            NIDA, iPad,
   BMP-Scan, Klartext                   korrekte Umlaute/Sonderzeichen     Windows, macOS
```

- **App** (`apps/pico-pwa`): Vue 3 + Capacitor (iOS/Android), komplett offline-fähig.
  Eigener Protokoll-Kreator: jede Organisation baut ihre eigenen Vorlagen.
- **Bridge-Firmware** (`firmware/`): arduino-pico (C++), USB-HID-Tastatur + WLAN-AP,
  signierte OTA-Updates (Ed25519). Umlaute/Sonderzeichen pro Ziel-OS korrekt
  (`win_de`, `mac_de`, `ios`) — siehe [docs/umlauts.md](docs/umlauts.md).
- **Geteilte Pakete** (`packages/shared`): Protokoll-Schema, Renderer, Medikationsplan-
  Parser (BMP), medizinische Rechenhilfen (mit Quellen: [docs/medical-sources.md](docs/medical-sources.md)).

Architektur im Detail: [docs/architecture.md](docs/architecture.md) ·
Bridge-HTTP-API: [docs/pico-api.md](docs/pico-api.md) ·
Datenfluss & Datenschutz: [docs/data-flow.md](docs/data-flow.md)

## Datenschutz-Grundsätze

- Patientendaten existieren nur flüchtig im RAM für die aktuelle Ausgabe — kein Auto-Save, keine Übertragung an Server.
- Die App spricht ausschließlich die lokale Bridge (WLAN) und optional eine
  PZN→Medikamentenname-Datenbank (HTTPS, bewusste Nutzeraktion) an.
- Kein Tracking, keine Analytics, keine Werbe-SDKs, keine Crash-Reporter.

## Lokales Build

Voraussetzungen: Node.js 22+, npm.

```bash
cd apps/pico-pwa
npm install
npm run build     # Typecheck (vue-tsc) + Vite-Build
npm test          # Tests (shared + App)
```

**Native Apps (iOS/Android):** Das Repository enthält die Capacitor-Projekte.
Für eigene Builds eigene Konfigurationswerte hinterlegen (Bundle-ID, Signing):

- Platzhalter-Bundle-ID `com.example.resqdocs` in `apps/pico-pwa/capacitor.config.ts`,
  `android/app/build.gradle` und im Xcode-Projekt durch die eigene ID ersetzen.
- iOS: eigenes Apple-Developer-Team in Xcode (Signing & Capabilities) wählen;
  CocoaPods erforderlich, immer die `.xcworkspace` öffnen. Komfort: `npm run ios`.
- Android: eigene Signing-Konfiguration anlegen — siehe
  [docs/android.md](docs/android.md) und [docs/android-release.md](docs/android-release.md).
  Komfort: `npm run android`.

Produktive App-Store- oder Play-Store-Releases erfordern eigene Entwicklerkonten
und eigene Signing-Konfigurationen.

**Firmware:** Build mit `arduino-cli` und dem arduino-pico-Core für `rpipico2w` —
Anleitung in [firmware/README.md](firmware/README.md). Für signierte OTA-Updates
eigenes Schlüsselpaar erzeugen: `node scripts/ota/keygen.mjs` (privater Schlüssel
bleibt außerhalb des Repos).

## Medikamenten-Datenbank (PZN)

Der Medikationsplan-Scan löst PZN über eine offene CC0-Datenbank auf:
[resqdocs/pzn-data](https://github.com/resqdocs/pzn-data) — Beiträge willkommen.

## Beitragen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Sicherheitsmeldungen: [SECURITY.md](SECURITY.md).

## Lizenz

[GPL-3.0-or-later](LICENSE) · Hinweise zu Drittanbietern:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
