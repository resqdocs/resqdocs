# Drittanbieter-Hinweise (Third-Party Notices)

ResQDocs (lizenziert unter `GPL-3.0-or-later`, siehe [`LICENSE`](LICENSE) und
[`NOTICE.md`](NOTICE.md)) bündelt und vertreibt die unten aufgeführten Open-Source-Pakete.
Jedes Paket unterliegt **seiner eigenen Lizenz**; die jeweiligen Copyright- und
Lizenzhinweise bleiben erhalten. Für diese Pakete wird keine eigene Gewährleistung
übernommen.

**Methodik / Quellen:** Lizenz- und Versionsangaben stammen aus den installierten
Paketen (`node_modules/<paket>/package.json` und `node_modules/<paket>/LICENSE`) zum
Stand des committeten Dependency-Baums. Copyright-Inhaber wurden den jeweiligen
`LICENSE`-Dateien entnommen. Es werden ausschließlich Pakete aufgeführt, die tatsächlich
Bestandteil des ausgelieferten Artefakts sind (Runtime). Reine Build-/Dev-Werkzeuge
werden getrennt und ohne Einzelhinweispflicht behandelt.

Alle aufgeführten Lizenzen (MIT, Apache-2.0, ISC, 0BSD) sind mit `GPL-3.0-or-later`
vereinbar.

## App / PWA — ausgelieferte Laufzeit-Abhängigkeiten

Direkte Runtime-Abhängigkeiten (`apps/pico-pwa/package.json`):

| Paket | Version | Lizenz | Copyright | Quelle |
|-------|---------|--------|-----------|--------|
| vue | 3.5.x | MIT | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core> |
| @capacitor/core | 8.x | MIT | Copyright (c) 2017-present Drifty Co. | <https://github.com/ionic-team/capacitor> |
| @capacitor/ios | 8.x | MIT | Copyright (c) 2017-present Drifty Co. | <https://github.com/ionic-team/capacitor> |
| @capacitor/android | 8.x | MIT | Copyright (c) 2017-present Drifty Co. | <https://github.com/ionic-team/capacitor> |
| @capacitor/filesystem | 8.x | MIT | Copyright (c) 2025 Ionic | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/preferences | 8.x | MIT | Copyright 2020-present Ionic | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/share | 8.x | MIT | Copyright 2020-present Ionic | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/camera | 8.2.x | MIT | Copyright 2020-present Ionic | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor-community/sqlite | 8.x | MIT | Copyright (c) 2020-2024 Quéau Jean Pierre | <https://github.com/capacitor-community/sqlite> |
| @zxing/browser | 0.2.x | MIT | Copyright (c) 2018 ZXing for JS | <https://github.com/zxing-js/browser> |
| @zxing/library | 0.22.x | Apache-2.0 | ZXing for JS (zxing-js project) | <https://zxing-js.github.io/library/> |

Mit ausgelieferte transitive Laufzeit-Abhängigkeiten:

| Paket | Version | Lizenz | Copyright | Über |
|-------|---------|--------|-----------|------|
| tslib | 2.8.x | 0BSD | Copyright (c) Microsoft Corporation | @capacitor/core |
| @capacitor/synapse | 1.0.x | ISC | Copyright (c) 2025 Ionic | @capacitor/filesystem |

### Apache-2.0-Hinweis (`@zxing/library`)

`@zxing/library` steht unter der Apache License 2.0. Das Paket enthält **nur** eine
`LICENSE`-Datei und **keine** `NOTICE`-Datei; eine Pflicht zur Weitergabe von
NOTICE-Inhalten nach Abschnitt 4(d) der Apache-2.0 besteht daher nicht. Der vollständige
Apache-2.0-Lizenztext liegt dem Paket bei (`node_modules/@zxing/library/LICENSE`) und ist
unter <https://www.apache.org/licenses/LICENSE-2.0> verfügbar.

### Native Android-Abhängigkeit — ZXing-C++ (#170)

Der native Data-Matrix-Scan auf Android (Scanner-Modus „Native ZXing-C++") nutzt die
Gradle-/Maven-Abhängigkeit `io.github.zxing-cpp:android:3.0.2` (**Apache-2.0**),
Copyright (c) ZXing-C++ Authors (Axel Waggershauser u. a.),
<https://github.com/zxing-cpp/zxing-cpp>. Sie ist **GMS-frei** (kein Google ML Kit, keine
Play Services). Apache-2.0-Lizenztext: <https://www.apache.org/licenses/LICENSE-2.0>.

### Nicht ausgelieferte transitive Abhängigkeiten (Hinweis)

`@capacitor-community/sqlite` zieht für den **Web-Fallback** das Paket `jeep-sqlite`
(samt `jszip`, `localforage`, `sql.js`, `pako`, `@stencil/core` u. a.) als transitive
Abhängigkeit nach. Diese werden **nicht** in das ausgelieferte Artefakt gebündelt: Auf
nativen Plattformen (iOS/Android) wird die plattformeigene SQLite-Implementierung des
Plugins genutzt; im Web greift die App auf einen Memory-Store zurück und bindet
`jeep-sqlite` bewusst nicht ein (Designentscheidung DR-0004, siehe
`apps/pico-pwa/src/storage/useStorage.ts`). Sie sind daher nicht hinweispflichtig, werden
hier aber zur Transparenz erwähnt.

## Build- und Entwicklungswerkzeuge (nicht ausgeliefert)

Vite, `@vitejs/plugin-vue`, `vue-tsc`, TypeScript, Tailwind CSS, `@tailwindcss/vite`,
daisyUI, `@vue/tsconfig`, `@types/node` und der Capacitor-CLI dienen ausschließlich dem
Build bzw. der Entwicklung und sind **kein** Bestandteil des ausgelieferten Artefakts.
Sie stehen unter MIT (Tailwind/daisyUI/Vite/Vue-Tooling) bzw. Apache-2.0 (TypeScript) und
lösen ohne Distribution keine Einzelhinweispflicht aus.

## Firmware (`firmware/`, Pico 2 W Bridge)

Die Bridge-Firmware wird als Binary mit der App ausgeliefert und ist **getrennt** lizenziert
(eigene Quellen `GPL-3.0-or-later`, [`firmware/LICENSE`](firmware/LICENSE)). Sie basiert auf
dem arduino-pico-Core (Earle F. Philhower III) und dessen gebündelten Bibliotheken sowie der
Crypto-Bibliothek; diese behalten ihre jeweiligen Lizenzen. Die **vollständige** Auflistung der
Firmware-Drittkomponenten (arduino-pico Core LGPL-2.1-or-later, Keyboard/EEPROM/HID_Keyboard
LGPL-2.1-or-later, pico-sdk/lwIP/LittleFS BSD, DHCP/Crypto MIT, CYW43-WLAN-Blob
separat/gerätegebunden) mit Quellen sowie das Source-/Build-Angebot stehen in
[`FIRMWARE_THIRD_PARTY_NOTICES.md`](FIRMWARE_THIRD_PARTY_NOTICES.md) und
[`firmware/README.md`](firmware/README.md).

Der Vorläufer „SaniScript"/pico-ducky (GPL-2.0-only) diente ausschließlich als
**Inspiration** (DE-Layout-Tippen); es wurde **kein Code übernommen** (Clean-Room, vgl.
`firmware/README.md`).

## Hinweis zu neuen Abhängigkeiten

Vor Einführung neuer Abhängigkeiten sind Lizenzkompatibilität (mit `GPL-3.0-or-later`)
und Pflegezustand zu prüfen; unmaintained/deprecated Pakete werden nicht verwendet. Neue
ausgelieferte Runtime-Abhängigkeiten sind in dieser Datei zu ergänzen.
