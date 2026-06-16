# firmware/ — Bridge (USB-HID-Typer)

Die „dumme" Brücke: empfängt Text vom Composer (WLAN-AP) und tippt ihn als **USB-Tastatur**
in das Zielsystem (NIDA, iPad, Win/macOS). **USB-HID ist Pflicht, BLE ist raus** (die Ziele
akzeptieren kein BLE) — siehe [`../docs/hardware.md`](../docs/hardware.md).

## Firmware-Stack: arduino-pico (C++ / TinyUSB) — entschieden [2026-06-05]

Gewählt als bester Kompromiss aus sauberer Use-Case-Abdeckung und künftiger Wartbarkeit
(Stack-Vergleich + Quellen in [`../docs/sources.md`](../docs/sources.md)):

- **USB-HID + WLAN + Dual-Core** offiziell im Core
  ([arduino-pico USB-Doku](https://arduino-pico.readthedocs.io/en/latest/usb.html)), RP2040 **und** RP2350.
- **Mehrsprachige Tastatur-Layouts eingebaut:** offizielle `KeyboardLayout_de_DE / en_US /
  fr_FR / es_ES` ([arduino-libraries/Keyboard](https://github.com/arduino-libraries/Keyboard)),
  Runtime-Umschaltung ([cervoise/KeyboardWithLayout](https://github.com/cervoise/KeyboardWithLayout)),
  Unicode-Erweiterung ([Arduino_KeyboardUTF8](https://github.com/JohnWasser/Arduino_KeyboardUTF8)).
- Großes, stabiles Ökosystem; zugänglich für ein kleines Team — gut wartbar ohne Spezialwissen.

Verworfen: CircuitPython/MicroPython (nur „lief zufällig"/HID unreifer), reines C-SDK & Zephyr
(zu viel Aufwand/Overkill), Rust/Embassy (technisch top, aber Lernkurve), QMK/KMK/ZMK (für
physische Tastaturen). Begründung je Stack: `../docs/sources.md` + Issue #2.

## Sprachen

- **Deutsch ist primär und Pflicht** (ä ö ü Ä Ö Ü ß €).
- EN/FR/ES sind „kann" — über die umschaltbaren offiziellen Layouts abgedeckt, nicht jetzt nötig.
- **Inhalts-Übersetzung ist NICHT Aufgabe der Firmware/des Projekts** (passiert geräteseitig).
- Korrektheits-Regel: Das gewählte Layout muss zum **am Zielgerät eingestellten** Layout passen
  (`bCountryCode` wird vom OS ignoriert — Host entscheidet; siehe [`../docs/umlauts.md`](../docs/umlauts.md)).

## ⭐ Akzeptanzkriterium #1: Umlaute & Sonderzeichen (oberste Priorität)

Umlaute **und** Sonderzeichen müssen in der Ausgabe korrekt ankommen — das ist die
Kernanforderung (Issue #1). Verbindlicher **Teststring**, der vor jedem „fertig" sauber
ins Ziel getippt werden muss:

```
ä ö ü Ä Ö Ü ß   € § % & / ( ) = ? ! " ' @ \ { } [ ] < > | ~ ^ ° µ   116117 112
```

Technischer Weg (belegt, `../docs/sources.md`):
- Der Composer liefert **UTF-8**; getippt wird über das **DE-Layout** → Umlaute + die meisten
  deutschen Sonderzeichen kommen direkt aus `KeyboardLayout_de_DE`.
- **Knifflige Fälle** (z. B. **€**, `@ \ { } [ ] | ~` via AltGr, fremdsprachige Akzente) laufen
  über die Unicode-/UTF-8-Schicht ([Arduino_KeyboardUTF8](https://github.com/JohnWasser/Arduino_KeyboardUTF8))
  bzw. explizite AltGr-Keycodes — **nicht** über das nackte `Keyboard.print(char)` (nur Latin-1).
- **Früh auf echter Hardware verifizieren** (Pico 1, per Kabel an NIDA/iPad), bevor die Flotte läuft.

## Geplantes Verhalten (Slice 1)

1. Start als **USB-HID-Tastatur** (TinyUSB).
2. **WLAN-AP** + kleine Web-UI; empfängt Text lokal (kein Cloud-Dienst).
3. Tippt den Text über das gewählte `KeyboardLayout` (DE-Default).
4. Layout-/Ziel-Modus wählbar.

## Offene Risiken / zu verifizieren (auf Hardware)

- **USB-HID + WLAN gleichzeitig** auf *einem* Pico W/2 W — Dual-Core hilft, aber früh testen
  (Koexistenz-Befund, `../docs/sources.md`). Fallback: **Zwei-Chip-Split** (WLAN-MCU per UART →
  dedizierter USB-HID-Chip / CH9329).
- Sonderzeichen außerhalb des reinen Layouts (z. B. €, fremdsprachige Akzente auf DE-Host) →
  Unicode-Pfad (Arduino_KeyboardUTF8) prüfen.
- **Jetzt sofort testbar:** Umlaut-Ausgabe auf dem vorhandenen **Pico 1 (RP2040)** via arduino-pico
  + `KeyboardLayout_de_DE`, per USB-Kabel gegen NIDA/iPad (Issue #1).

## Referenz

Vorläufer „SaniScript" (pico-ducky, GPLv2) nur als Inspiration (bewährte Idee: DE-Layout-Tippen).
Originale Protokoll-Inhalte unter [`../protocols/reference/`](../protocols/reference/); der
Firmware-Code wird **nicht** übernommen.

## Lizenz & Quellangebot (Firmware-Compliance)

- **Eigene Firmware-Quellen:** `GPL-3.0-or-later` ([`LICENSE`](LICENSE)); SPDX-Header in den
  Quelldateien. Die Firmware ist **getrennt** von der App/PWA lizenziert (die App ist ebenfalls
  `GPL-3.0-or-later`, aber ein eigenständiges Programm — Kommunikation nur über HTTP/JSON).
- **Drittkomponenten:** stehen unter ihren eigenen Lizenzen — vollständige Auflistung mit
  Quellen in [`../FIRMWARE_THIRD_PARTY_NOTICES.md`](../FIRMWARE_THIRD_PARTY_NOTICES.md)
  (arduino-pico Core LGPL-2.1-or-later, Keyboard/EEPROM/HID_Keyboard LGPL-2.1-or-later,
  pico-sdk/lwIP/LittleFS BSD, DHCP/Crypto MIT, **CYW43-WLAN-Blob separat/gerätegebunden**).
- **Auslieferung:** Die kompilierte Binary `bridge_s2.bin` wird **mit der App ausgeliefert**
  (`apps/pico-pwa/src/assets/firmware/`, OTA #130). Die **LGPL-§6-Pflichten** für die
  statisch gelinkten LGPL-Komponenten werden über den **vollständigen Firmware-Quellstand in
  diesem Repository** + die folgenden Build-Angaben (Relink-Möglichkeit) erfüllt; der
  arduino-pico-Core wird **unverändert** gelinkt.

### Reproduzierbarer Build (Source-Offer / „designated place")

Das **designated place** für den vollständigen, korrespondierenden Quellstand ist dieses
Repository (`firmware/`). Build der ausgelieferten Binary:

```bash
# Toolchain: arduino-cli + arduino-pico Core 5.6.0
arduino-cli lib install Crypto            # rweather, Ed25519/SHA256 (MIT)
arduino-cli compile --fqbn rp2040:rp2040:rpipico2w:flash=4194304_1048576 \
  --libraries firmware/bridge/libraries \
  --output-dir firmware/bridge/build/bridge_s2 firmware/bridge/bridge_s2
# Ergebnis: build/bridge_s2/bridge_s2.ino.bin -> signieren via scripts/ota/sign.mjs
```

- **arduino-pico Core-Version:** `5.6.0`
- **FQBN:** `rp2040:rp2040:rpipico2w:flash=4194304_1048576`
- **Crypto (rweather):** `0.4.0` (Build-Umgebung; via `arduino-cli lib install Crypto`,
  Quelle <https://github.com/rweather/arduinolibs>). Hinweis: ob die historisch
  ausgelieferte 0.3.2-Binary exakt mit 0.4.0 gebaut wurde, ist nicht protokolliert
  (offener Release-Check, s. u.).

### Binary ↔ Source-Zuordnung (ausgelieferte Firmware)

| Feld | Wert |
|------|------|
| FW_VERSION (Quelle, `bridge_s2/bridge_s2.ino`) | `0.3.2` |
| Manifest-Version (`…/assets/firmware/bridge_s2.manifest.json`) | `0.3.2` |
| Größe | `430240` Bytes |
| sha256 | `30781cba27719ba72f942e1785911456416a293c2a147a52c66fc13d185b73ed` |
| Signatur | Ed25519 über den sha256-Digest (`sigB64` im Manifest; Public Key in `bridge_s2/OtaPublicKey.h`) |
| Quell-Commit (Binary signiert) | `9354ae3` (S2 0.3.2); Quellstand `402d150` (FW_VERSION 0.3.2) |

Die `.uf2`-Dateien unter `dist/` sind der BOOTSEL-Weg (anderes Format, gleicher Quellstand);
die ausgelieferte `.bin` ist das OTA-Format.

### Pfad-neutraler, reproduzierbarer Supersede-Build (#6 Gate 2/3)

Die historisch ausgelieferte `bridge_s2.bin` (0.3.2) bettet absolute Toolchain-Pfade
ein (`<home>/Library/Arduino15/…` bzw. `/home/<name>/.arduino15/…`) und ist
daher nicht pfad-/maschinenneutral. Behebung über `firmware/bridge/build-reproducible.sh`
(`-ffile-prefix-map` auf das Arduino-Datenverzeichnis + Build-Pfad).

**Verifiziert (Container):** mit den Flags enthält die Binary **0** absolute Pfade
(vorher 4), und zwei Builds aus **unterschiedlichen** Build-Verzeichnissen sind
**bit-identisch** (gleiche sha256) → pfad-unabhängig reproduzierbar. Crypto/rweather
**0.4.0** ist die belegte Build-Version (Gate 3 gilt damit für den neuen Build).

**Signierter Supersede auf 0.3.3 (MUSS auf der Maschine mit dem privaten OTA-Key
laufen — der Key liegt außerhalb des Repos):**

```bash
# 1) FW_VERSION in bridge_s2/bridge_s2.ino auf 0.3.3 setzen (eindeutiger Supersede)
# 2) Pfad-neutral bauen:
bash firmware/bridge/build-reproducible.sh
# 3) Signieren + ablegen (bestehender Key, KEINE Key-Rotation):
node scripts/ota/sign.mjs --bin firmware/bridge/build/bridge_s2/bridge_s2.ino.bin --version 0.3.3
# 4) BOOTSEL-.uf2 0.3.3 erzeugen (gleiche Flags) und dist/bridge_s2.pico2w.uf2 ersetzen
# 5) src/pico/firmwareArtifacts.test.ts (Drift-Guard) + Volltests laufen lassen
```

Hinweis: Schritt 1–4 sind ein **atomarer** Vorgang — FW_VERSION, signierte `.bin`,
`.manifest.json` und `.uf2` müssen gemeinsam auf 0.3.3 wechseln, sonst schlägt der
Drift-Guard fehl. Erst danach committen.
