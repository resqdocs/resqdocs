# ResQDocs

**Open-Source-Hilfsmittel zur Strukturierung und Vorbereitung rettungsdienstlicher Dokumentation.**

ResQDocs hilft dabei, Dokumentationstexte mobil-first und strukturiert vorzubereiten und sie
über eine kleine, lokal angebundene Hardware-Brücke (Raspberry Pi Pico 2 W als USB-HID-Tastatur)
in ein Zielsystem zu übertragen. Ziel ist weniger Reibung bei der Dokumentation an unkomfortablen
Eingabegeräten — nicht der Ersatz vorhandener Systeme.

> Status: in aktiver Entwicklung. Nutzung ohne Gewähr.

## Fachlicher Hinweis

Diese App ist eine technische Hilfestellung zur Strukturierung und Vorbereitung von Dokumentation.
Sie ersetzt keine fachliche Entscheidung, keine lokale Vorgabe und keine eigenverantwortliche
Dokumentation.

Der Maintainer kann persönliche Protokollpräferenzen und Musterprotokolle bereitstellen. Diese sind
unverbindliche Beispiele. Wer die App verwendet, ist selbst dafür verantwortlich, Vorgehen,
Handlungen und Dokumentation fachlich, rechtlich und organisatorisch zu prüfen.

## Datenschutz (Kurzfassung)

Entwickelt mit Fokus auf Datenminimierung. **Patientendaten werden durch die Anwendung nicht
dauerhaft gespeichert** — Eingaben und Scans werden nur zur unmittelbaren Verarbeitung verwendet und
anschließend verworfen. Nutzer sind für bewusst gespeicherte oder exportierte Inhalte selbst
verantwortlich. Dies ist keine Rechtsberatung; Einsatz und Konfiguration müssen durch die
verantwortliche Stelle geprüft werden. Details: [`docs/`](docs/).

## Architektur (Überblick)

```
Vue 3 + Vite + Tailwind CSS + Konsta UI / daisyUI   (apps/pico-pwa)
   ↓ lokal-first, Composition API, gekapselte Services
Capacitor                                            (native Hülle iOS/Android)
   ↓ CapacitorHttp (lokales HTTP, kein Mixed-Content)
Raspberry Pi Pico 2 W                                (lokaler HTTP-Endpunkt / Access Point)
   → tippt den Text als USB-HID-Tastatur ins Zielsystem
```

Die App ist die gemeinsame Vue-3-Codebasis; der Pico bleibt ein einfacher, robuster HTTP-Endpunkt.

## Monorepo-Struktur

```
apps/pico-pwa/      Mobile-first Composer-App (Vue 3 + Capacitor)
apps/landing-page/  Open-Source-Landing-Page (statisch, Docker, HTTP)
packages/shared/    geteilte Logik (z. B. Protokoll-Renderer)
firmware/           Bridge-Firmware für den Pico 2 W
protocols/          maschinenlesbares Protokoll-Datenmodell
docs/               Projekt-, Datenschutz- und Sicherheitsdokumentation
```

App und Landing Page sind logisch und technisch getrennt und werden separat gebaut.

## Builds (Maintainer)

Alle Befehle inklusive `git pull` und `npm install` - einfach komplett kopieren.
Repo-Pfad ggf. anpassen.

**iOS** (öffnet garantiert die `.xcworkspace`, nie das `.xcodeproj` - bug-106-sicher):

```bash
cd ~/ResQDocs && git checkout dev && git pull
cd apps/pico-pwa && npm run ios
# In Xcode: ggf. Version/Build hochzählen -> Product -> Archive -> TestFlight
```

**Android** (öffnet Android Studio):

```bash
cd ~/ResQDocs && git checkout dev && git pull
cd apps/pico-pwa && npm run android
```

**Android direkt als APK** (ohne Studio, z. B. zum Verteilen an Tester per Sideload):

```bash
cd ~/ResQDocs && git checkout dev && git pull
cd apps/pico-pwa && npm install && npm run build && npx cap sync android
cd android && ./gradlew assembleDebug && open app/build/outputs/apk/debug/
```

Web-Dev, Tests und weitere Befehle: `docs/manual-test-current-state.md`.
Firmware-Build und OTA-Release: `firmware/bridge/README.md`.

## Lizenz

GNU General Public License v3.0 or later — `SPDX-License-Identifier: GPL-3.0-or-later`.
Vollständiger Text: [`LICENSE`](LICENSE). Externe Pakete unterliegen ihren eigenen Lizenzen
(siehe [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)).

Nutzungs- und Haftungshinweis (Hilfsmittel, keine medizinische Entscheidung, ohne Gewähr):
siehe [`DISCLAIMER.md`](DISCLAIMER.md).

Die Bridge-Firmware wird als Binary mit der App ausgeliefert und ist **getrennt** lizenziert
(eigene Quellen `GPL-3.0-or-later`, [`firmware/LICENSE`](firmware/LICENSE)); ihre
Drittkomponenten haben eigene Lizenzpflichten — siehe
[`FIRMWARE_THIRD_PARTY_NOTICES.md`](FIRMWARE_THIRD_PARTY_NOTICES.md).

Open Source und kostenlos verfügbar. Nutzung ohne Garantie oder Gewährleistung.

## Mitwirken & Sicherheit

- Beiträge: [`CONTRIBUTING.md`](CONTRIBUTING.md) · Verhaltenskodex: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Sicherheitsprobleme melden: [`SECURITY.md`](SECURITY.md)
