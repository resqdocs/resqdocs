# Firmware — Drittanbieter-Hinweise (Firmware Third-Party Notices)

Diese Datei dokumentiert die Lizenzen der Drittanbieter-Komponenten, die in die
**Bridge-Firmware** (`firmware/bridge/bridge_s2`, ausgeliefert als
`apps/pico-pwa/src/assets/firmware/bridge_s2.bin`) einfließen. Die **eigenen**
Firmware-Quellen von ResQDocs stehen unter `GPL-3.0-or-later` (siehe
[`firmware/LICENSE`](firmware/LICENSE)); die hier gelisteten Drittkomponenten behalten
**ihre eigenen Lizenzen**. Die Firmware ist getrennt von der App/PWA lizenziert.

**Stand/Toolchain:** arduino-pico Core **6.3.2** (mit gebündeltem pico-sdk **2.3.1**),
FQBN `rp2040:rp2040:rpipico2w:flash=4194304_1048576` (Raspberry Pi Pico 2 W / RP2350),
Toolchain `pqt-gcc` aus dem Core-Paket (**GCC 16.1.0**, **newlib 4.6.0**),
Default-Pico-SDK-USB-Stack (**nicht** Adafruit TinyUSB). Pfadangaben unter „Quelle"
beziehen sich auf das installierte arduino-pico-Core-Paket (Version 6.3.2); die
durablen Belege sind die jeweils verlinkten Upstream-Projekte.

**Ermittlung:** Aufgenommen ist nur, was nach `--gc-sections` tatsächlich in der Binary
landet (Abgleich Linker-Map `bridge_s2.ino.map` + Symboltabelle des ELF). Archiv-Member,
die zwar aufgelöst, aber vollständig verworfen werden, stehen unter „Nicht enthalten".

## In der ausgelieferten Binary enthaltene Komponenten

| Komponente | Version | Lizenz | only/or-later | Quelle (Pfad im Core 6.3.2 / Upstream) |
|-----------|---------|--------|---------------|----------------------------------------|
| arduino-pico Core | 6.3.2 | **LGPL-2.1-or-later** | or-later (per Datei-Header) | `cores/rp2040/Arduino.h` Header („version 2.1 … or (at your option) any later version"); `LICENSE` (LGPL-2.1-Volltext) · <https://github.com/earlephilhower/arduino-pico> |
| ArduinoCore-API | 1.5.1 (`ARDUINO_API_VERSION 10501`, mit Core) | LGPL-2.1-or-later | or-later (per Datei-Header) | `ArduinoCore-API/LICENSE`, Header z. B. `ArduinoCore-API/api/String.cpp` · <https://github.com/arduino/ArduinoCore-API> |
| Core-Bibliotheken WiFi (1.0.0), WebServer (2.0.0), lwIP_CYW43, lwIP_Ethernet, SPI (1.0), PicoOTA (1.0.0), LittleFS-Wrapper (0.1.0) | (mit Core) | LGPL-2.1-or-later | or-later (per Datei-Header) | `libraries/<Name>/src/*.cpp` Header (Earle F. Philhower III, Ivan Grokhotkov, esp8266/Arduino, Arduino SA) |
| Keyboard (HID-Tastatur) | 1.0.3 | LGPL-2.1-or-later | or-later (per Datei-Header) | `libraries/Keyboard/src/Keyboard.cpp` Header (beigelegte `LICENSE` enthält den LGPL-3-Text) |
| HID_Keyboard | 1.0.4 | LGPL-2.1-or-later | or-later (per Datei-Header) | `libraries/HID_Keyboard/src/HID_Keyboard.cpp` Header (beigelegte `LICENSE` enthält den LGPL-3-Text) |
| EEPROM | 1.0 | LGPL-2.1-or-later | or-later | `libraries/EEPROM/src/EEPROM.cpp` Header |
| pico-sdk | 2.3.1 (mit Core) | BSD-3-Clause | — | `pico-sdk/LICENSE.TXT`, Version aus `pico-sdk/pico_sdk_version.cmake` · <https://github.com/raspberrypi/pico-sdk> |
| TinyUSB (USB-Device-Stack des pico-sdk: `usbd`, CDC, HID-Klasse, RP2040/RP2350-Treiber) | 0.18.0 (`pico-sdk/lib/tinyusb`) | MIT | — | `pico-sdk/lib/tinyusb/LICENSE` (Copyright hathach/tinyusb.org); Treiber `src/portable/raspberrypi/rp2040/` (MIT, Raspberry Pi); HID-Klasse über Core-Bibliothek `libraries/tusb-hid` (1.0.0, bindet `pico-sdk/lib/tinyusb/src/class/hid/hid_device.c` ein) · <https://github.com/hathach/tinyusb> |
| cyw43-driver (WLAN-Treiber für CYW43439) | 1.1.0 (`pico-sdk/lib/cyw43-driver`) | **LICENSE.RP** (gerätegebunden, s. u.) | — | `pico-sdk/lib/cyw43-driver/LICENSE.RP` · <https://github.com/georgerobotics/cyw43-driver> |
| lwIP (WLAN-TCP/IP-Stack) | 2.2.1 (`pico-sdk/lib/lwip`) | BSD-3-Clause | — | `pico-sdk/lib/lwip/COPYING`; im Core 6.3.2 über `cores/rp2040/lwip/` (Include-Wrapper) mitkompiliert · <https://savannah.nongnu.org/projects/lwip/> |
| LittleFS (`littlefs`) | 2.11 (`LFS_VERSION 0x0002000b`) | BSD-3-Clause | — | `libraries/LittleFS/lib/littlefs/LICENSE.md` · <https://github.com/littlefs-project/littlefs> |
| DHCP-Server (AP-Host-Modus) | (mit Core, aus MicroPython) | MIT | — | `libraries/WiFi/src/dhcpserver/dhcpserver.c` Header (Copyright (c) 2018-2019 Damien P. George) · <https://micropython.org> |
| ARM-optimiertes `memcpy` | (mit Core) | BSD-3-Clause-artig (ARM Ltd) | — | `cores/rp2040/rp2350-memcpy.S` Header (Copyright (c) 2011 ARM Ltd); gelinkt als `__wrap_memcpy` (Wortlaut s. u.) |
| newlib (C-Bibliothek `libc`/`libm`, nano-Variante) | 4.6.0 (Toolchain `pqt-gcc`, mit Toolchain-Patches) | newlib-Sammellizenz (BSD-/MIT-artige Einzelhinweise) | — | `arm-none-eabi/include/_newlib_version.h` der Toolchain; Lizenzübersicht upstream `COPYING.NEWLIB` · <https://sourceware.org/newlib/> |
| GCC-Laufzeit (`libgcc`, `libstdc++`, `crtbegin`/`crti`/`crtend`/`crtn`) | GCC 16.1.0 (Toolchain `pqt-gcc`) | GPL-3.0-or-later **mit GCC Runtime Library Exception 3.1** | or-later | `arm-none-eabi-gcc --version`; Ausnahme upstream <https://www.gnu.org/licenses/gcc-exception-3.1.html> |
| Crypto (rweather/arduinolibs) | 0.4.0 (Build-Umgebung; via `arduino-cli lib install Crypto`) | MIT | — | `library.properties` (`version=0.4.0`); Per-Datei-Header `Ed25519.cpp`, `SHA256.cpp`, `SHA512.cpp`, `Curve25519.cpp` („Copyright (C) 2015 Southern Storm Software" + MIT) · <https://github.com/rweather/arduinolibs> |

### OTA-Bootloader (`lib/rp2350/ota.o`)

Der Core linkt einen vorgebauten OTA-Bootloader („stage 3", Abschnitt `.OTA` ab Flash-Anfang,
10 028 Bytes) als Binär-Objekt in jede Firmware. Laut `ota/CMakeLists.txt` besteht er aus:

| Bestandteil | Lizenz | Quelle (Pfad im Core 6.3.2) |
|-------------|--------|-----------------------------|
| `ota.c`, `ota_lfs.c` (Earle F. Philhower III) | LGPL-2.1-or-later | `ota/ota.c`, `ota/ota_lfs.c` Header |
| `ota_clocks.c` (aus dem pico-sdk) | BSD-3-Clause | `ota/ota_clocks.c` Header |
| littlefs (`lfs.c`, `lfs_util.c`, read-only) | BSD-3-Clause | `libraries/LittleFS/lib/littlefs/LICENSE.md` |
| **uzlib** (`tinflate.c`, `tinfgzip.c`; GZIP-Entpacken) | **Zlib** | `ota/uzlib/LICENSE` (Copyright (c) 2003 Joergen Ibsen, (c) 1997-2014 Simon Tatham, (c) 2014-2020 Paul Sokolovsky) · <https://github.com/pfalcon/uzlib> |
| pico-sdk-Laufzeit (`pico_stdlib`, `hardware_*`) | BSD-3-Clause | `pico-sdk/LICENSE.TXT` |

Quellen und Build-Skript (`ota/make-ota.sh`) liegen dem Core bei; damit ist auch dieser
LGPL-Anteil neu erzeugbar.

## CYW43-Treiber (cyw43-driver) und CYW43439-WLAN-Firmware-Blob (separat lizenziert)

Die WLAN-Funktion des Pico 2 W nutzt den **cyw43-driver** (George Robotics) samt der
**CYW43439-Funk-Firmware** (Blob `w43439A0_7_95_49_00_combined.h`, Version 7.95.49, nur WLAN,
ohne Bluetooth). Der Treiber-Code (`cyw43_ctrl.c`, `cyw43_ll.c`, `cyw43_lwip.c`) wird in die
Firmware **gelinkt**; der Blob ist als Datenarray in derselben Binary enthalten und wird zur
Laufzeit auf den **separaten Funk-Coprozessor** geladen. Beides ist **kein** ResQDocs-Code,
steht **nicht** unter der GPL und wird **nicht** umlizenziert.

- **Lizenz (für RP-Builds maßgeblich): `LICENSE.RP`** (Raspberry Pi Ltd / George Robotics):
  Nutzung/Weitergabe nur „**solely with the Licensor's microcontroller chip (RP2040) or any
  other semiconductor device produced by the Licensor**" — also **gerätegebunden** auf
  Raspberry-Pi-Pico-W-/RP-Hardware. Binär-Weitergabe ist unter Wiedergabe von Copyright,
  Bedingungen und Disclaimer erlaubt.
- **Alternative Lizenz:** George-Robotics-`LICENSE` (nur nicht-kommerziell; diese Fassung
  steht auch in den Datei-Headern der Treiberquellen) — **nicht** gewählt; für ResQDocs gilt
  die gerätegebundene `LICENSE.RP`, auf die die Datei-Header ausdrücklich verweisen.
- **Einordnung:** Der Blob läuft auf dem CYW43439-Funkchip (separate Hardware) und wird
  **in Verbindung mit dem RP-Chip** weiterverteilt (Bedingung erfüllt). Der Treiber-Code ist
  unverändert aus dem pico-sdk übernommen; eigener ResQDocs-Code wird nicht mit ihm vermischt.
  Zur Verträglichkeit des gelinkten Treibers mit den GPL-lizenzierten eigenen Quellen siehe
  „Offene Punkte".
- **Quelle:** `pico-sdk/lib/cyw43-driver/LICENSE.RP` und `…/LICENSE`,
  `pico-sdk/lib/cyw43-driver/firmware/README.md`, Blob-Auswahl in
  `pico-sdk/src/rp2_common/pico_cyw43_driver/include/cyw43_configport.h` ·
  <https://github.com/georgerobotics/cyw43-driver>
- **Release-Hinweis:** Für den jetzigen Release reicht diese Dokumentation/Abgrenzung. **Bei
  kommerziellem Vertrieb oder größerer Veröffentlichung ist eine juristische Gegenprüfung
  empfohlen.**

### LICENSE.RP — Volltext (Pflicht-Reproduktion bei Binär-Weitergabe)

LICENSE.RP verlangt bei Weitergabe in Binärform die Reproduktion von Copyright-Hinweis,
Bedingungsliste und Haftungsausschluss. Daher hier vollständig und wortgleich wiedergegeben
(Quelle: arduino-pico Core 6.3.2, `pico-sdk/lib/cyw43-driver/LICENSE.RP`;
<https://github.com/georgerobotics/cyw43-driver/blob/main/LICENSE.RP>). Der Verweis
„./LICENSE" im letzten Absatz meint die nicht-kommerzielle George-Robotics-Lizenz im selben
Verzeichnis.

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

This software is also available from the copyright owner under different
terms (see ./LICENSE)
```

ResQDocs liefert die Firmware ausschließlich für den **Raspberry Pi Pico 2 W (RP2350,
RP-Silizium des Licensors)** aus; Bedingung 1 (Hardware-Bindung) ist damit erfüllt.

## Nicht enthalten

- **Adafruit TinyUSB** (MIT) — im Core vorhanden, aber **nicht gelinkt**: die Firmware nutzt
  den Default-Pico-SDK-USB-Stack (Beleg: `firmware/bridge/README.md`; core-`Keyboard.h`
  bricht mit `#error Keyboard is not compatible with Adafruit TinyUSB` ab; FQBN ohne
  `:usbstack=tinyusb`). **Achtung:** Der Default-Stack ist selbst TinyUSB aus dem pico-sdk
  (`pico-sdk/lib/tinyusb`) und ist **enthalten** (s. Tabelle).
- **Boot Stage 2 (Second-Stage-Bootloader)** — für `rpipico2w` **nicht** enthalten: `boards.txt`
  setzt `rpipico2w.build.boot2=none`, `boot2/rp2350/none.S` definiert nur ein leeres Symbol
  `__boot2_entry_point`; der Abschnitt `.boot2` ist 0 Bytes groß und wird verworfen. Die
  Flash-Konfiguration übernimmt beim RP2350 das Boot-ROM.
- **BearSSL** (MIT), **MD5Builder** (LGPL-2.1-or-later) und **libb64** (Public Domain) — werden
  über WebServer als Archiv-Member aufgelöst, aber von `--gc-sections` **vollständig
  verworfen** (keine `br_md5_*`-, `MD5Builder::*`- oder `base64_*`-Symbole im ELF). Gleiches
  gilt für das lwIP-mDNS-Modul.
- **Updater** und **http-parser** — vom Build-System mitkompiliert, aber ohne gelinkte Member.
- **Bluetooth** (btstack, `liblwip-bt.a`, Bluetooth-Firmware-Blob), **FreeRTOS** und
  **mbedTLS** — von dieser Firmware nicht verwendet bzw. nicht gelinkt.
- **picotool / GCC-Toolchain / UF2CONV.PY** — reine Build-Werkzeuge, nicht Teil der Binary
  (ausgenommen die oben genannten Laufzeit-Bibliotheken newlib und GCC-Laufzeit).

## Lizenztexte / Pflichten

- Der vollständige **LGPL-2.1-Text** liegt im arduino-pico-Core (`LICENSE`) und ist Teil des
  Firmware-Quellangebots; die **LGPL-§6-Pflichten** (Relink-Möglichkeit über den
  vollständigen Firmware-Quellstand + gepinnte Toolchain/Versionen, Hinweis auf
  LGPL-Nutzung, Beilage des Lizenztexts) werden über den vollständigen Quellstand in diesem
  Repository und die Build-/Source-Offer-Dokumentation in [`firmware/README.md`](firmware/README.md)
  erfüllt. Der Core (einschließlich OTA-Bootloader `ota.o`) wird **unverändert** gelinkt
  (keine §2(b)-Änderungsmarkierung nötig).
- **BSD-3-Clause** bzw. BSD-artig (pico-sdk, lwIP, LittleFS, ARM-`memcpy`, cyw43-driver unter
  `LICENSE.RP`) und **MIT** (TinyUSB, DHCP/MicroPython-Anteil, Crypto) verlangen die
  Wiedergabe von Copyright- und Lizenzhinweis bei Binär-Weitergabe — abgedeckt durch diese
  Datei und die jeweiligen Lizenzdateien im Core.
- **Zlib** (uzlib im OTA-Bootloader) verlangt bei Binär-Weitergabe keine Reproduktion; die
  Nennung hier dient der Herkunftsangabe.
- **newlib** besteht aus Einzeldateien mit eigenen (überwiegend BSD-/MIT-artigen) Hinweisen;
  maßgeblich ist die Übersicht `COPYING.NEWLIB` des newlib-Projekts.
- **GCC-Laufzeit** (`libgcc`, `libstdc++`, `crt*`): Die GCC Runtime Library Exception 3.1
  erlaubt die Weitergabe der damit erzeugten Binary unabhängig von der GPL; zusätzliche
  Pflichten entstehen nicht.

### ARM-`memcpy` — Lizenzhinweis (Wiedergabe aus `cores/rp2040/rp2350-memcpy.S`)

Für diese Komponente existiert im Core keine eigene Lizenzdatei, nur der Datei-Header.
Daher hier wortgleich wiedergegeben:

```
Copyright (c) 2011 ARM Ltd
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. The name of the company may not be used to endorse or promote
   products derived from this software without specific prior written
   permission.

THIS SOFTWARE IS PROVIDED BY ARM LTD ``AS IS'' AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL ARM LTD BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Offene Punkte

- **Crypto-Version:** In der dokumentierten Build-Umgebung ist Crypto **0.4.0** installiert
  (via `arduino-cli lib install Crypto`, Quelle <https://github.com/rweather/arduinolibs>);
  der Build mit Core 6.3.2 verwendet diese Version. Ob die historisch ausgelieferte
  0.3.2-Binary exakt mit 0.4.0 gebaut wurde, ist im Repo nicht protokolliert und vom
  Maintainer zu bestätigen; künftige Builds halten die Crypto-Version in der Build-Doku fest.
- **CYW43-Treiber/-Blob:** bei kommerziellem Vertrieb juristisch gegenprüfen lassen (s. o.).
  Zusätzlich prüfen lassen, ob die Kombination der `GPL-3.0-or-later`-Firmware mit dem
  gelinkten, nur gerätegebunden lizenzierten cyw43-driver eine ausdrückliche
  Zusatzerlaubnis (GPL-3.0 §7) in `firmware/LICENSE` erfordert.
- **OTA-Bootloader `ota.o`:** liegt nur als vorgebautes Binär-Objekt ohne Symbole vor. Die
  Zusammensetzung stützt sich auf `ota/CMakeLists.txt`; im Objekt nachweisbar sind die
  uzlib-Tabelle `clcidx` und die Kennung `littlefs`. Ob zusätzlich newlib-/libgcc-Teile der
  Toolchain enthalten sind, ist ohne Neubau nicht feststellbar.
- **Versionen vorgebauter Bibliotheken:** TinyUSB 0.18.0, cyw43-driver 1.1.0 und lwIP 2.2.1
  sind aus den im Core mitgelieferten Quellen abgelesen; dass `libpico.a`/`liblwip.a` exakt
  aus diesem Stand gebaut wurden, ist eine Annahme (Core-Paket als Einheit).
- **Lizenz-Volltexte:** Für TinyUSB, pico-sdk, lwIP, LittleFS, DHCP/MicroPython, Crypto und
  newlib verweist diese Datei auf die Lizenzdateien im Core bzw. upstream. Da diese Dateien
  nicht mit der Binary ausgeliefert werden, ist zu entscheiden, ob die Volltexte (wie bei
  LICENSE.RP und ARM-`memcpy`) zusätzlich hier wiedergegeben werden.
- **Reproduzierbarkeit:** erledigt für 0.4.0. Die ausgelieferte `bridge_s2.bin` wurde aus dem
  gepinnten Quellstand auf zwei Rechnern (macOS und Linux) Bit-identisch gebaut (gleiche sha256,
  siehe `firmware/README.md`).
- **Frühere Binaries:** Mit Core 5.6.0 gebaute Firmware-Stände (bis 0.3.4) sind durch den
  vorherigen Stand dieser Datei (Git-Historie) dokumentiert.
