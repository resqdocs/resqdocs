# Firmware — Drittanbieter-Hinweise (Firmware Third-Party Notices)

Diese Datei dokumentiert die Lizenzen der Drittanbieter-Komponenten, die in die
**Bridge-Firmware** (`firmware/bridge/bridge_s2`, ausgeliefert als
`apps/pico-pwa/src/assets/firmware/bridge_s2.bin`) einfließen. Die **eigenen**
Firmware-Quellen von ResQDocs stehen unter `GPL-3.0-or-later` (siehe
[`firmware/LICENSE`](firmware/LICENSE)); die hier gelisteten Drittkomponenten behalten
**ihre eigenen Lizenzen**. Die Firmware ist getrennt von der App/PWA lizenziert.

**Stand/Toolchain:** arduino-pico Core **5.6.0**, FQBN
`rp2040:rp2040:rpipico2w:flash=4194304_1048576` (Raspberry Pi Pico 2 W / RP2350),
Default-Pico-SDK-USB-Stack (**nicht** Adafruit TinyUSB). Pfadangaben unter „Quelle"
beziehen sich auf das installierte arduino-pico-Core-Paket (Version 5.6.0); die
durablen Belege sind die jeweils verlinkten Upstream-Projekte.

## In der ausgelieferten Binary enthaltene Komponenten

| Komponente | Version | Lizenz | only/or-later | Quelle (Pfad im Core 5.6.0 / Upstream) |
|-----------|---------|--------|---------------|----------------------------------------|
| arduino-pico Core | 5.6.0 | **LGPL-2.1-or-later** | or-later (per Datei-Header) | `cores/rp2040/Arduino.h` Header („version 2.1 … or (at your option) any later version"); `LICENSE` (LGPL-2.1-Volltext) · <https://github.com/earlephilhower/arduino-pico> |
| ArduinoCore-API | (mit Core) | LGPL-2.1-or-later | or-later | `ArduinoCore-API/LICENSE` · <https://github.com/arduino/ArduinoCore-API> |
| Keyboard (HID-Tastatur) | 1.0.3 | LGPL-2.1-or-later | or-later (per Datei-Header) | `libraries/Keyboard/src/Keyboard.h` Header (beigelegte `LICENSE` enthält den LGPL-3-Text) |
| HID_Keyboard | 1.0.4 | LGPL-2.1-or-later | or-later (per Datei-Header) | `libraries/HID_Keyboard/src/HID_Keyboard.h` Header (beigelegte `LICENSE` enthält den LGPL-3-Text) |
| EEPROM | 1.0 | LGPL-2.1-or-later | or-later | `libraries/EEPROM/` + Header |
| pico-sdk | (mit Core) | BSD-3-Clause | — | `pico-sdk/LICENSE.TXT` · <https://github.com/raspberrypi/pico-sdk> |
| Boot Stage 2 (Second-Stage-Bootloader) | (pico-sdk) | BSD-3-Clause | — | `pico-sdk/src/rp2350/boot_stage2/` (unter `pico-sdk/LICENSE.TXT`) |
| lwIP (WLAN-TCP/IP-Stack) | (mit Core) | BSD-style (3-clause-ähnlich) | — | `pico-sdk/lib/lwip/COPYING` · <https://savannah.nongnu.org/projects/lwip/> |
| LittleFS (`littlefs`) | (mit Core) | BSD-3-Clause | — | `libraries/LittleFS/lib/littlefs/LICENSE.md` · <https://github.com/littlefs-project/littlefs> |
| DHCP-Server (AP-Host-Modus) | (mit Core, aus MicroPython) | MIT | — | arduino-pico README („DHCP server for AP host mode from the MicroPython Project … MIT") · <https://micropython.org> |
| Crypto (rweather/arduinolibs) | 0.4.0 (Build-Umgebung; via `arduino-cli lib install Crypto`) | MIT | — | Per-Datei-Header `Ed25519.cpp` („Copyright (C) 2015 Southern Storm Software" + MIT) · <https://github.com/rweather/arduinolibs> |

## CYW43439 / CYW43-WLAN-Firmware-Blob (separat lizenzierter Drittanbieter-Blob)

Die WLAN-Funktion des Pico 2 W nutzt die **CYW43439-Funk-Firmware** (ein Binär-Blob, der
auf den **separaten Funk-Coprozessor** geladen wird). Dieser Blob ist **kein** ResQDocs-Code
und steht **nicht** unter der GPL — er wird **nicht** umlizenziert.

- **Lizenz (für RP-Builds maßgeblich): `LICENSE.RP`** (Raspberry Pi Ltd / George Robotics):
  Nutzung/Weitergabe nur „**solely with the Licensor's microcontroller chip (RP2040) or any
  other semiconductor device produced by the Licensor**" — also **gerätegebunden** auf
  Raspberry-Pi-Pico-W-/RP-Hardware. Binär-Weitergabe ist unter Wiedergabe von Copyright,
  Bedingungen und Disclaimer erlaubt.
- **Alternative Lizenz:** George-Robotics-`LICENSE` (nur nicht-kommerziell) — **nicht**
  gewählt; für ResQDocs gilt die gerätegebundene `LICENSE.RP`.
- **Einordnung:** Der Blob läuft auf dem CYW43439-Funkchip (separate Hardware), wird als
  Drittanbieter-Binary **in Verbindung mit dem RP-Chip** weiterverteilt (Bedingung erfüllt)
  und ist damit von den GPL-lizenzierten eigenen Firmware-Quellen **abgegrenzt** (Aggregation,
  kein GPL-Derivat). Vermischung mit eigenem Code findet nicht statt.
- **Quelle:** `pico-sdk/lib/cyw43-driver/LICENSE.RP` und `…/LICENSE`,
  `pico-sdk/lib/cyw43-driver/firmware/README.md` · <https://github.com/georgerobotics/cyw43-driver>
- **Release-Hinweis:** Für den jetzigen Release reicht diese Dokumentation/Abgrenzung. **Bei
  kommerziellem Vertrieb oder größerer Veröffentlichung ist eine juristische Gegenprüfung
  empfohlen.**

### LICENSE.RP — Volltext (Pflicht-Reproduktion bei Binär-Weitergabe)

LICENSE.RP verlangt bei Weitergabe in Binärform die Reproduktion von Copyright-Hinweis,
Bedingungsliste und Haftungsausschluss. Daher hier vollständig wiedergegeben (Quelle:
arduino-pico Core 5.6.0, `pico-sdk/lib/cyw43-driver/LICENSE.RP`;
<https://github.com/georgerobotics/cyw43-driver/blob/main/LICENSE.RP>):

```
Copyright (C) 2019-2022 George Robotics Pty Ltd

Raspberry Pi Ltd (Licensor) hereby grants to you a non-exclusive license to
use this software solely with the Licensor's microcontroller chip (RP2040) or
any other semiconductor device produced by the Licensor. No other use is
permitted under the terms of this licence.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. The software can only be used and redistributed in conjunction with RP2040
   or any other semiconductor device produced by the Licensor.
2. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
3. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE LICENSOR AND COPYRIGHT OWNER "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE LICENSOR OR COPYRIGHT OWNER BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

ResQDocs liefert die Firmware ausschließlich für den **Raspberry Pi Pico 2 W (RP2350,
RP-Silizium des Licensors)** aus; Bedingung 1 (Hardware-Bindung) ist damit erfüllt.

## Nicht enthalten

- **Adafruit TinyUSB** (MIT) — im Core vorhanden, aber **nicht gelinkt**: die Firmware nutzt
  den Default-Pico-SDK-USB-Stack (Beleg: `firmware/bridge/README.md`; core-`Keyboard.h`
  ist mit TinyUSB nicht kompatibel). Quelle: `pico-sdk/lib/tinyusb/LICENSE`.
- **Bluetooth** (btstack u. a.) und **FreeRTOS** — von dieser Firmware nicht verwendet.
- **picotool / GCC-Toolchain / UF2CONV.PY** — reine Build-Werkzeuge, nicht Teil der Binary.

## Lizenztexte / Pflichten

- Der vollständige **LGPL-2.1-Text** liegt im arduino-pico-Core (`LICENSE`) und ist Teil des
  Firmware-Quellangebots; die **LGPL-§6-Pflichten** (Relink-Möglichkeit über den
  vollständigen Firmware-Quellstand + gepinnte Toolchain/Versionen, Hinweis auf
  LGPL-Nutzung, Beilage des Lizenztexts) werden über den vollständigen Quellstand in diesem
  Repository und die Build-/Source-Offer-Dokumentation in [`firmware/README.md`](firmware/README.md)
  erfüllt. Der Core wird **unverändert** gelinkt (keine §2(b)-Änderungsmarkierung nötig).
- **BSD-3-Clause** (pico-sdk, lwIP, LittleFS) und **MIT** (DHCP/MicroPython-Anteil, Crypto)
  verlangen die Wiedergabe von Copyright- und Lizenzhinweis bei Binär-Weitergabe — abgedeckt
  durch diese Datei und die jeweiligen Lizenzdateien im Core.

## Offene Punkte

- **Crypto-Version:** In der dokumentierten Build-Umgebung ist Crypto **0.4.0** installiert
  (via `arduino-cli lib install Crypto`, Quelle <https://github.com/rweather/arduinolibs>).
  Ob die historisch ausgelieferte 0.3.2-Binary
  exakt mit 0.4.0 gebaut wurde, ist im Repo nicht protokolliert und vom Maintainer zu
  bestätigen; künftige Builds halten die Crypto-Version in der Build-Doku fest.
- **CYW43-Blob:** bei kommerziellem Vertrieb juristisch gegenprüfen lassen (s. o.).
- **Reproduzierbarkeit:** Ein Bit-genauer Rebuild der ausgelieferten `bridge_s2.bin` aus dem
  gepinnten Quellstand wurde nicht durchgeführt — offener Release-Check (kein Rebuild ohne
  ausdrückliche Freigabe).
