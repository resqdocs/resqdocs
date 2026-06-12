# Quellen

> Projektvorgabe: Lösungen mit Online-Quellen belegen statt Trial-and-Error. Recherche-Stand
> 2026-06-04.

## Hardware (Pico 2 W / RP2350)

- Raspberry Pi — Pico 2 Ankündigung & Preis (Pico 2 5 $, Pico 2 W 7 $):
  <https://www.raspberrypi.com/news/raspberry-pi-pico-2-our-new-5-microcontroller-board-on-sale-now/>
- RP2350 Spezifikation (Dual-Core M33/RISC-V, USB 1.1 Device, BT 5.2):
  <https://en.wikipedia.org/wiki/RP2350>
- CircuitPython-Image für Pico 2 W (USB-HID stabil):
  <https://circuitpython.org/board/raspberry_pi_pico2_w/>
- RP2040 vs ESP32 — Kosten/Eignung 2025:
  <https://thinkrobotics.com/blogs/learn/rp2040-vs-esp32-which-is-better-complete-comparison-guide-2025>

## Alternative Bridge-Module (natives USB-HID + WLAN, CircuitPython)

> Vergleich ~10 €, Kriterium nach Pivot: natives USB-HID + WLAN. Fähigkeiten belegt über die
> CircuitPython-Boardseiten (Preise = Straßenpreis-Schätzung, nicht aus diesen Quellen).

- Pico 2 W (RP2350) — CircuitPython-Board: <https://circuitpython.org/board/raspberry_pi_pico2_w/>
  (WLAN: Soft-AP bis 4 Clients — <https://docs.circuitpython.org/en/latest/shared-bindings/wifi/>)
- Adafruit Feather/QT Py ESP32-S2 (natives USB, WLAN):
  <https://circuitpython.org/board/adafruit_feather_esp32s2/> ·
  <https://circuitpython.org/board/adafruit_qtpy_esp32s2/>
- MicroDev microS2 (ESP32-S2, USB+WLAN, klein): <https://circuitpython.org/board/microdev_micro_s2/>
- Waveshare ESP32-S2-Pico / ESP32-S3-Pico (Pico-Formfaktor, USB+WLAN):
  <https://circuitpython.org/board/waveshare_esp32s2_pico/> ·
  <https://circuitpython.org/board/waveshare_esp32_s3_pico/>
- Seeed XIAO ESP32-S3 (USB-HID + WLAN+BLE): <https://www.seeedstudio.com/XIAO-ESP32S3-p-5627.html>
  (XIAO RP2040/RP2350 haben **kein** WLAN: <https://github.com/Seeed-Studio/OSHW-XIAO-Series/discussions/24>)
- Adafruit QT Py ESP32-S3 (USB-HID + WLAN): <https://www.adafruit.com/product/5426>
- Chipset-Übersicht (welcher CircuitPython-Chip kann was):
  <https://learn.adafruit.com/choose-your-circuitpython-board/chipsets>

## Firmware-Stacks für die Bridge (offen, nicht auf CircuitPython festgelegt)

- **CircuitPython** (bewährt, SaniScript-Basis): adafruit_hid + Neradoc-DE + adafruit_httpserver.
  Runtime kapselt USB+WLAN. <https://docs.circuitpython.org/projects/hid/en/latest/>
- **MicroPython** ≥1.23 — custom USB device (`machine.USBDevice`) + usb-device-keyboard:
  <https://github.com/orgs/micropython/discussions/15381> ·
  <https://hackaday.com/2024/06/02/micropython-1-23-brings-custom-usb-devices-openamp-much-more/>
  (Composite-HID teils nur mit C-Level-Build — weniger reif als CircuitPython.)
- **Arduino-pico (Philhower-Core)** — Adafruit TinyUSB (Keyboard-HID, Geräte on-the-fly) + WLAN +
  BTstack, RP2040/RP2350: <https://github.com/earlephilhower/arduino-pico> ·
  <https://arduino-pico.readthedocs.io/>
- **C/C++ Pico-SDK + TinyUSB + lwIP** — max. Kontrolle; offizielle Beispiele (hid_composite,
  tinyusb_dev_net_lwip_webserver): <https://github.com/raspberrypi/pico-examples>
- **Rust + Embassy** — embassy-usb (HID) + cyw43 (WLAN), RP2350/Pico-2-W-Templates, Parität seit
  Anf. 2025: <https://github.com/Nivirx/embassy-pico2w-template> · <https://docs.embassy.dev/cyw43/>
- **Zephyr RTOS** — RP2350 unterstützt; Pico-2-W-WLAN ab v4.3; production-grade (schwerer):
  <https://blog.golioth.io/building-zephyr-for-the-raspberry-pi-pico2-w/> ·
  <https://github.com/raspberrypi/pico-zephyr>
- **Keyboard-Firmwares (QMK/KMK/ZMK)** — für *physische* Tastaturen, **schlecht** für dynamischen
  Empfangstext (QMK send_string = Compile-Zeit; ZMK = BLE-fokussiert). Nur als Keymap-/Unicode-
  Referenz: <https://docs.qmk.fm/features/send_string> · <https://github.com/KMKfw/kmk_firmware>
- **Wichtiger Querschnitt-Befund:** USB-HID **+** WLAN gleichzeitig auf *einem* Pico W/2 W ist nicht
  automatisch — bei „nackten" Stacks (C-SDK) berichtete TinyUSB-/CYW43-Interrupt-Konflikte:
  <https://forums.raspberrypi.com/viewtopic.php?t=345919>. CircuitPython kapselt es; sonst früh
  verifizieren — oder **Zwei-Chip-Split** (WLAN-MCU per UART → dedizierter USB-HID-Chip wie CH9329).

## USB-HID & Umlaute/Sonderzeichen

- Adafruit HID Library — Layout-Abhängigkeit, Nicht-ASCII wirft Exception:
  <https://docs.circuitpython.org/projects/hid/en/latest/>
- Neradoc — internationale CircuitPython-Layouts (inkl. `win_de`):
  <https://github.com/Neradoc/Circuitpython_Keyboard_Layouts>
- Windows-Eingabekette (Usage-ID → Scancode → VK → Layout → Zeichen):
  <https://rpnfan.github.io/keyboard-heaven/deep-dive/windows-keyboard-chain/>
- Alt-Code-/Umlaut-Ansatz (layout-unabhängig, Windows):
  <https://alpharesearch.de/?page_id=53>

## Fertige Systeme / Referenz-Projekte (Bridge, USB-HID + WLAN)

- **picow-http-keyboard** (lesley-byte) — Pico W: HTTP-Server tippt Web-Formular-Text als
  USB-HID „human-like". Nächster an unserer Slice 1: <https://github.com/lesley-byte/picow-http-keyboard>
- Adafruit „Pico W HTTP Server with CircuitPython" — WLAN-AP + `adafruit_httpserver` (POST/Form):
  <https://learn.adafruit.com/pico-w-http-server-with-circuitpython/overview>
- RP2w-AP-WebServer (ddfulaa) — minimaler AP + Webserver (wifi/socketpool):
  <https://github.com/ddfulaa/RP2w-AP-WebServer>

## BLE-HID (kabellos / iOS) — eigener Firmware-Track (Arduino)

- **CircuitPython Issue #7693** — Pico (2) W: CYW43-Bluetooth wird **nicht** an `_bleio`
  bereitgestellt → kein BLE-HID in CircuitPython: <https://github.com/adafruit/circuitpython/issues/7693>
- Adafruit „Pico Bluetooth Keyboard Bridge" (Aug 2025) — BLE auf Pico via **Arduino/BTstack**:
  <https://learn.adafruit.com/pico-bluetooth-keyboard-bridge>
- T-vK/ESP32-BLE-Keyboard (Arduino) — ESP32 als BLE-Tastatur: <https://github.com/T-vK/ESP32-BLE-Keyboard>
  - DE-Layout-Diskussion: <https://github.com/T-vK/ESP32-BLE-Keyboard/issues/104> ·
    <https://forum.arduino.cc/t/keyboard-scancodes-for-german-keyboards/913181>
- ESP32-BLE-Combo (blackketter) — Keyboard+Mouse: <https://github.com/blackketter/ESP32-BLE-Combo>
- Espressif HID-Device-API (ESP-IDF, HID over GATT):
  <https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/esp_hidd.html>
- manuelbl — ESP32 as Bluetooth keyboard (Gist): <https://gist.github.com/manuelbl/66f059effc8a7be148adb1f104666467>

## Umlaute macOS / iOS (Host-Layout entscheidet)

- HID `bCountryCode` wird von OS ignoriert — Layout ist Host-seitig:
  <https://deskthority.net/viewtopic.php?t=21960>
- RWTH USGerman Keyboard Layout (macOS, Option-Tasten): <https://hci.rwth-aachen.de/usgermankeyboard>
- patrick-zippenfenig/us-with-german-umlauts (macOS): <https://github.com/patrick-zippenfenig/us-with-german-umlauts>
- iOS Unicode-Eingabe (kein Hex-Input): <https://discussions.apple.com/thread/8395355>
- QMK Unicode-Feature (Referenz reife Layout-/Unicode-Logik):
  <https://beta.docs.qmk.fm/using-qmk/software-features/feature_unicode>

## Vorläuferlösung

- pico-ducky (Dave Bailey, GPLv2) — Basis von „SaniScript":
  <https://github.com/dbisu/pico-ducky>
- CircuitPython:
  <https://github.com/adafruit/circuitpython>

## Onboarding-Tour der App (#142)

- NN/g - Mobile-App Onboarding: An Analysis of Components and Techniques
  (Carousel/"Deck of Cards": sichtbarer Skip, wenige Karten, EIN Konzept pro Karte,
  nur fuers Neuartige): <https://www.nngroup.com/articles/mobile-app-onboarding/>
- NN/g - Onboarding Tutorials vs. Contextual Help (kontextuelle Hilfe bevorzugen;
  in ResQDocs ergaenzen die InlineHints (#72) die Tour):
  <https://www.nngroup.com/articles/onboarding-tutorials/>
- Apple Human Interface Guidelines - Onboarding ("fast, fun, and optional"):
  <https://developer.apple.com/design/human-interface-guidelines/onboarding>
