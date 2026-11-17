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

## Onboarding-Tour der App

- NN/g - Mobile-App Onboarding: An Analysis of Components and Techniques
  (Carousel/"Deck of Cards": sichtbarer Skip, wenige Karten, EIN Konzept pro Karte,
  nur fuers Neuartige): <https://www.nngroup.com/articles/mobile-app-onboarding/>
- NN/g - Onboarding Tutorials vs. Contextual Help (kontextuelle Hilfe bevorzugen;
  in ResQDocs ergaenzen die InlineHints die Tour):
  <https://www.nngroup.com/articles/onboarding-tutorials/>
- Apple Human Interface Guidelines - Onboarding ("fast, fun, and optional"):
  <https://developer.apple.com/design/human-interface-guidelines/onboarding>

## Online-Editor: Gliederung der Arbeitsfläche

> Recherche-Stand 2026-11-17. Angewandt in `apps/protocol-editor` (`style.css`, Block „Gliederung sichtbar
> machen“, und `components/CanvasNode.vue`): Abschnitt, Unterabschnitt und Element sollen auf einen Blick
> unterscheidbar sein, ohne den Aufbau zu ändern.

- Gemeinsame Region: Rahmen oder Hintergrund fassen Zusammengehöriges, Regionen lassen sich schachteln;
  Weißraum hat Vorrang, zu viele Rahmen machen unruhig — Nielsen Norman Group, A. Harley (2020):
  <https://www.nngroup.com/articles/common-region/>
  → Abschnitt = Karte mit Kopfband, Unterabschnitt = eingelassene Region darin, die Fläche wechselt je Ebene.
- Nähe: Weißraum vereint oder trennt und kann andere Signale überstimmen — Nielsen Norman Group,
  A. Harley (2020): <https://www.nngroup.com/articles/gestalt-proximity/>
  → mehr Abstand zwischen Abschnitten als zwischen den Elementen darin; die Schaltfläche „Element in …
  hinzufügen“ steht in der Region, zu der sie gehört, und nennt sie.
- Trenner sparsam einsetzen; eingerückte Trenner für Zusammengehöriges, verankert an Symbolen vor der
  Titel-Linie — Material Design, Dividers: <https://m1.material.io/components/dividers.html>
  → Haarlinie zwischen zwei Elementen beginnt an der Titel-Linie, die Typ-Kacheln bilden die Spalte davor.
- Stehender Kopf beim Scrollen: klein halten, deckende Fläche, keine Animation — Nielsen Norman Group,
  P. Laubheimer (2021): <https://www.nngroup.com/articles/sticky-headers/>. Vorbild „Sticky Scroll“: zeigt
  oben, in welchem Bereich man gerade ist — Visual Studio Code:
  <https://code.visualstudio.com/docs/getstarted/userinterface>
  → der Kopf des Abschnitts der obersten Ebene bleibt beim Scrollen stehen.

## Online-Editor: Auswahl schließen

> Recherche-Stand 2026-11-17. Angewandt in `apps/protocol-editor` (`src/editor/outsideClick.ts`, eingehängt in
> `src/App.vue`): ein Klick auf freie Fläche außerhalb der aufgeklappten Karte schließt das Bearbeiten.

- Ein vorübergehendes Bedienfeld schließt beim Klick daneben („a popover generally closes when people click
  or tap outside its bounds“); dabei geht nichts verloren („Always save work when automatically closing a
  nonmodal popover“), verworfen wird nur über ein ausdrückliches Abbrechen — Apple, Human Interface
  Guidelines, Popovers: <https://developer.apple.com/design/human-interface-guidelines/popovers>
  → Klick daneben schließt die Karte; jede Änderung ist schon übernommen, Rückgängig bleibt möglich.
- „Light dismiss“ als Web-Standard: „if you click outside of the popover, it closes automatically“, ebenso
  per Esc — web.dev, Learn CSS, Popover and dialog: <https://web.dev/learn/css/popover-and-dialog>;
  MDN, Using the Popover API: <https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using>
  → Esc und Klick daneben tun dasselbe; liegt etwas darüber (Dialog, Einfüge-Menü, Erklärung), schließt
  zuerst nur das.
- Geschlossen wird nur, wenn Drücken und Loslassen dasselbe Ziel außerhalb treffen („If sameTarget is false,
  then return“) — WHATWG, HTML Living Standard, Popover light dismiss:
  <https://html.spec.whatwg.org/multipage/popover.html#popover-light-dismiss>
  → Text in der Karte markieren und außerhalb loslassen schließt nicht.

Bewusst anders als ein Popover: Ein Klick auf ein anderes Element wählt dieses direkt, und Bedienelemente
außerhalb (Leiste „Hinzufügen“, Rückgängig, Ein-/Ausklappen) lassen die Auswahl stehen, weil sie sich auf das
gewählte Element beziehen.

## Online-Editor: Gewähltes Element verschieben

> Recherche-Stand 2026-11-17. Angewandt in `apps/protocol-editor` (`src/components/CanvasNode.vue`, `src/style.css`):
> das gewählte, rot gerahmte Element lässt sich an seinem roten Kopf greifen und verschieben.

- Greifbarkeit zeigen: Griff-Symbol und Zeiger-Wechsel; ein Griff ist ein sicheres Ziel, das keine benachbarten
  Bedienelemente auslöst. Ziehen mit einer genaueren Alternative koppeln („an accompanying more-precise
  interaction“) — Nielsen Norman Group, P. Laubheimer (2020): <https://www.nngroup.com/articles/drag-drop/>
  → Griff-Punkte und Greif-Zeiger im roten Kopf; die Knöpfe ↑/↓ (Alt+↑/↓) bleiben die genaue Alternative.
- Ist Ziehen eine Hauptaktion, bleibt der Griff dauerhaft sichtbar („use an always visible drag handle icon“);
  hat ein Element eigene Bedienelemente, ist nur der Griff greifbar, nicht das ganze Element — Atlassian
  Design System, Pragmatic drag and drop, Design guidelines:
  <https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines>
  → greifbar ist der Kopf ohne seine Knöpfe; Titel- und Einstellungsfelder der Karte bleiben normal bedienbar.
- Beim Start des Ziehens Aufgeklapptes schließen („collapse the tree item when the drag starts“) und nach dem
  Ablegen wieder öffnen, wenn es vorher offen war; das Ziehbild klein halten (höchstens 280 × 280 px, wenige
  Angaben), das Original bleibt abgeschwächt an seinem Platz — ebd.
  → die offene Karte klappt beim Ziehen auf Kopf und Titelzeile zusammen und steht nach dem Ablegen am neuen
  Platz wieder offen; am Zeiger hängt nur die kleine Marke mit Griff und Typ.
- Ein Ziehbild muss im Fenster liegen: „If the element is _completely_ offscreen, Safari@17.1 will cancel the
  drag“ — Atlassian, Quelltext-Kommentar in `@atlaskit/pragmatic-drag-and-drop` (1.4.0),
  `set-custom-native-drag-preview.js`:
  <https://unpkg.com/@atlaskit/pragmatic-drag-and-drop@1.4.0/dist/esm/public-utils/element/custom-native-drag-preview/set-custom-native-drag-preview.js>
  → als Ziehbild dient die Marke, die ohnehin sichtbar im Kopf steht; es wird kein Bild außerhalb erzeugt.

## Online-Editor: Einfügestelle neben Abschnitten

> Recherche-Stand 2026-11-17. Angewandt in `apps/protocol-editor` (`src/components/InsertGap.vue`, `src/style.css`):
> neben Abschnitten zeigt ein kleines Plus dauerhaft, dass dort eingefügt werden kann.

- Bedienbares muss ohne Suchen als bedienbar erkennbar sein: „Users need to know which areas of the page are
  plain static content, and which areas are clickable (or tappable)“ und „Never make users rely on scrubbing
  the screen with the mouse to determine if a text is clickable“ — Nielsen Norman Group, H. Loranger (2015):
  <https://www.nngroup.com/articles/clickable-elements/>
  → zwischen zwei Elementen verrät die Haarlinie die Einfügestelle; neben Abschnitten, wo keine Linie steht,
  übernimmt das ein ruhiges Plus mit etwas Abstand zu den Rahmen. Beim Überfahren wird es wie überall zur
  Einfügelinie.

## Einstellungen eines Elements: Reihenfolge und Gruppen

> Recherche-Stand 2026-11-17. Angewandt in `packages/protocol-core-ui` (`components/ContainerProperties.vue`,
> `terms.ts`), gilt für App und Online-Editor: Titel-Format und „Inline“ stehen unter „Allgemein“ direkt bei
> ihrem Schalter, „Erweitert“ enthält nur noch Seltenes. Keine Funktion und keine Beschriftung geändert.

- Häufig Gebrauchtes gehört nach vorn: „You have to disclose everything that users frequently need up front,
  so that they have to progress to the secondary display only on rare occasions“ — Nielsen Norman Group,
  J. Nielsen (2006): <https://www.nngroup.com/articles/progressive-disclosure/>
  → gezählt an den Vorlagen im Repo: jedes Element mit sichtbarem Titel hat ein eigenes Präfix/Suffix, gut die
  Hälfte der Felder nutzt „Inline“. Beides lag hinter „Erweitert“.
- Abhängige Einstellungen stehen bei der Einstellung, von der sie abhängen: „Don't make the settings on a page
  dependent upon settings on other pages. Put the dependent settings on a single page instead“ — Microsoft,
  Windows UX Guide, Property Windows: <https://learn.microsoft.com/en-us/windows/win32/uxguide/win-property-win>;
  „Place a dependent setting below the setting on which it depends“ — Android Developers, Settings:
  <https://developer.android.com/design/ui/mobile/guides/patterns/settings>
  → das Titel-Format erscheint nur bei „Titel im Protokolltext zeigen“ und steht jetzt eingerückt direkt
  darunter; „Kein Trenner davor“ steht unter „Inline“.
- So wenig ändern wie nötig: „Never make radical changes when minimal adjustments will suffice“ — Nielsen Norman
  Group, H. Loranger (2015): <https://www.nngroup.com/articles/radical-incremental-redesign/>
  → Gruppen, Namen, Reihenfolge und Beschriftungen bleiben; es ziehen nur zwei Blöcke um.

