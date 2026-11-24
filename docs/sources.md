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


## Großes Textfeld: Fenster, Tastatur und Schriftgröße

> Recherche-Stand 2026-11-17. Angewandt in `packages/protocol-core-ui` (`components/LongTextDialog.vue`,
> `components/LongTextField.vue`, `longTextSize.ts`, `visibleViewport.ts`) und in der App
> (`composables/useLongTextSize.ts`, Textbausteine). Anlass war ein Video vom iPhone: „Fertig“ lag hinter der
> Tastatur, das Fenster nutzte 85 % der Höhe, der Titel stand noch einmal als Platzhalter im Feld.

- Lange Texte bekommen am Handy den ganzen Bildschirm: „Consider using a full-screen modal style for in-depth
  content or a complex task“ — Apple, Human Interface Guidelines, Modality:
  <https://developer.apple.com/design/human-interface-guidelines/modality>; ein Fenster von unten „should not be
  used for displaying complex content“ — Nielsen Norman Group, P. Laubheimer (2023):
  <https://www.nngroup.com/articles/bottom-sheet/>
  → am Handy volle Höhe ohne abgedunkelten Rand, auf breiten Bildschirmen bleibt es ein mittiger Dialog.
- Schließen steht oben: „Always give people an obvious way to dismiss a modal view“, in iOS „people typically
  expect to find a button in the top toolbar“ — Apple, Human Interface Guidelines, Modality (wie oben)
  → „Fertig“ im Kopf; unten verdeckte ihn die Tastatur.
- Der Text endet über der Tastatur: „User-interface features like the on-screen keyboard (OSK) can shrink the
  visual viewport without affecting the layout viewport“ — MDN, Visual Viewport API:
  <https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API>
  → im Online-Editor (iOS-Safari) folgt die Höhe des Fensters dem sichtbaren Bereich; die Schreibmarke verschwindet
  nicht hinter der Tastatur. In der App verkleinert die Tastatur seit der App-Hülle das Layout selbst (Abschnitt
  „App-Hülle und Tastatur“ unten): das Fenster ist so hoch wie das Layout und passt sich einmal an, statt
  nachzugleiten (Maintainer, 2026-11-23).
- Der Platzhalter ersetzt keine Beschriftung: „the best solution is to have clear, visible labels that are placed
  outside empty form fields“ — Nielsen Norman Group, K. Sherwin (2014):
  <https://www.nngroup.com/articles/form-design-placeholders/>
  → der Titel steht im Kopf, der Platzhalter sagt nur „Tippen oder diktieren …“.
- Sichtbar machen, dass nichts verloren geht: „Whenever users interact with a system, they need to know whether the
  interaction was successful“ — Nielsen Norman Group, A. Harley (2018):
  <https://www.nngroup.com/articles/visibility-system-status/>
  → Hinweis „Wird automatisch gespeichert“ im Fuß; „Fertig“ schließt nur.
- Schriftgröße bleibt im Standard bei 16 px: Apple nennt für iOS 17 pt als Standard und 11 pt als Minimum — Apple,
  Human Interface Guidelines, Typography: <https://developer.apple.com/design/human-interface-guidelines/typography>;
  Material 3 setzt Fließtext auf 16/24 (bodyLarge), die kleinere Stufe auf 14/20 (bodyMedium) — Android Developers:
  <https://developer.android.com/develop/ui/compose/designsystems/material3>; größere Schrift wird unter Ablenkung
  schneller erfasst: „Larger sizes outperformed smaller sizes“ — Nielsen Norman Group, P. Laubheimer (2017):
  <https://www.nngroup.com/articles/glanceable-fonts/>
  → nicht verkleinert; mehr Text kommt über die volle Höhe und den Zeilenabstand.
- Die Größe wählt der Nutzer: Text soll sich „without assistive technology up to 200 percent“ vergrößern lassen —
  W3C, WCAG 2.2, 1.4.4 Resize Text: <https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html>
  → drei Stufen im Fenster (14, 16, 19 px), je Gerät gemerkt. Der Zoom der App ist abgeschaltet, das ist hier der
  erste Weg, Text größer zu stellen.
- Zeilenabstand 1,5: „Line spacing (leading) is at least space-and-a-half within paragraphs“ — W3C, WCAG 2.2,
  1.4.8 Visual Presentation: <https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html>
  → von 1,625 auf 1,5: etwa 8 % mehr Zeilen, ohne die Schrift zu verkleinern.
- Kein erzwungenes Querformat für mehr Platz: Inhalte sollen ihre Ansicht nicht auf eine Ausrichtung beschränken,
  „unless a specific display orientation is essential“ — W3C, WCAG 2.2, 1.3.4 Orientation:
  <https://www.w3.org/WAI/WCAG22/Understanding/orientation.html>; Android 16 ignoriert erzwungene Ausrichtungen
  auf Displays ab 600 dp — Android Developers:
  <https://developer.android.com/develop/ui/compose/layouts/adaptive/app-orientation-aspect-ratio-resizability>;
  nur 0,63 % der Tastenanschläge fielen in einer Feldstudie im Querformat (Buschek et al., zitiert in Palin et al.,
  MobileHCI 2019): <https://www.pokristensson.com/pubs/PalinEtAlMobileHCI2019.pdf>
  → das Hochformat bleibt der Standard, die App dreht weiter frei mit.

## App-Hülle und Tastatur

> Recherche-Stand 2026-11-23. Angewandt in `apps/pico-pwa` (`App.vue`, `style.css`, `capacitor.config.ts`,
> `src/shell/`) und in `packages/protocol-core-ui` (`keyboard.css`, `keyboardViewport.css`, `fullscreenKeyboard.ts`).
> Anlass: Rückmeldung eines Testers (iOS-Simulator), die App verhielt sich bei offener Tastatur wie eine Webseite.

- Auf iOS verkleinert die Tastatur nur den sichtbaren Bereich, nicht das Layout: „User-interface features like the
  on-screen keyboard (OSK) can shrink the visual viewport without affecting the layout viewport“ — MDN, Visual
  Viewport API: <https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API>
  → die App scrollt nicht mehr als Dokument. Kopfzeile, Inhalt und Tab-Leiste bilden eine feste Hülle (`h-dvh`),
  jeder Tab scrollt in einem eigenen Bereich.
- Die Tastatur verkleinert die WebView: `resize: 'native'` — „The whole native Web View will be resized when the
  keyboard shows/hides. This affects the `vh` relative unit.“ — Capacitor, Keyboard API:
  <https://capacitorjs.com/docs/apis/keyboard>; auf Android verkleinert Capacitor die Ansicht selbst,
  `resizeOnFullScreen` ist nur eine Umgehung für den Vollbildmodus (ebenda)
  → beide Plattformen nach demselben Modell: das Layout endet an der Tastatur, Fenster richten sich danach.
- Die WebView selbst scrollt nicht: `ios.scrollEnabled` — „Configure whether the scroll view is scrollable.“ —
  Capacitor, Konfiguration: <https://capacitorjs.com/docs/config>
  → iOS kann die Seite beim Fokus in ein Feld nicht mehr samt Kopfzeile hochschieben.
- Die Leiste ↑ ↓ ✓ über der Tastatur: „We recommend disabling the accessory bar for short forms (login, signup,
  etc.)“ — Capacitor, Keyboard API (wie oben)
  → aus (Maintainer, 2026-11-23). Ersatz für den Haken: Enter-Taste „Fertig“ (`enterkeyhint`, MDN:
  <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint>) schließt einzeilige
  Felder, ein Tipp neben das Feld schließt die Tastatur, Vollbild-Fenster haben „Fertig“ im Kopf.
- Am Ende eines Bereichs läuft das Wischen nicht weiter: „The overscroll-behavior CSS property controls what happens
  when scrolling reaches the edge of a scroll container.“ — MDN, overscroll-behavior:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior>
  → `contain` an Tab-Bereichen und Fenstern, `none` am Dokument.

## Lückentext: Ausfüllen und Einrichten am Handy

> Recherche-Stand 2026-11-17/18. Angewandt in `packages/shared` (`cloze.ts`, `clozeFill.ts`, `clozeEdit.ts`) und
> `packages/protocol-core-ui/components/cloze/`. Fenster, Tastatur und Schriftgröße folgen dem Abschnitt
> „Großes Textfeld“ oben.

- Ein Satz mit Eingaben mitten im Text ist für Screenreader und kleine Bildschirme heikel; jede Eingabe braucht
  einen eigenen Namen und darf nicht nur aus dem Satz heraus verständlich sein — A. Roselli, „Sentence Forms (not
  Mad Libs)“ (2021): <https://adrianroselli.com/2021/08/sentence-forms-not-mad-libs.html>; zum Muster selbst
  L. Wroblewski (2010): <https://www.lukew.com/ff/entry.asp?1007>
  → jede Lücke hat einen Namen, wird unter dem Text einzeln und groß abgefragt und nennt im Text Name und Zustand.
- Tippflächen: rund 1 cm × 1 cm — Nielsen Norman Group, A. Harley (2019):
  <https://www.nngroup.com/articles/touch-target-size/>; mindestens 24 px, mit Ausnahme für Ziele im Fließtext —
  WCAG 2.2, 2.5.8: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
  → Antworten mindestens 44 px hoch; die Lücken im Satz sind klein, deshalb die große Abfrage darunter.
- Bedienung mit dem Daumen im unteren Bereich — S. Hoober (2013):
  <https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php>
  → Abfrage und „Weiter“ stehen unten, der Text oben.
- Vorbelegen und Auswählen statt Tippen — Nielsen Norman Group, R. Budiu (2015):
  <https://www.nngroup.com/articles/mobile-input-checklist/>
  → ~~Lücken mit Standardwert werden beim Durchtippen übersprungen (je Lückentext umstellbar).~~ Überholt seit
  2.1 (Maintainer 2026-11-20, Rückmeldung aus dem Test: Auswahl-Lücken fielen immer heraus, weil ihre erste
  Antwort als Standard gilt): Beim Durchtippen kommt jede Lücke der Reihe nach dran; „Weiter“ übernimmt einen
  Standard mit einem Tipp. Begründung: Standardwerte werden kaum geändert und landen sonst ungeprüft in der
  Dokumentation — J. Nielsen, „The Power of Defaults“ (2005), zitiert bei
  <https://blog.codinghorror.com/the-power-of-defaults/>: nicht mit der zufällig ersten Option vorbelegen;
  Pennsylvania Patient Safety Authority (2013), 324 Ereignisse mit Standardwerten in Patientenakten, häufigste
  Ursache ein nicht geänderter Standardwert:
  <https://www.hcinnovationgroup.com/clinical-it/electronic-health-record-electronic-medical-record-ehr-emr/news/13021962/study-finds-ehr-errors-related-to-default-values-could-affect-patient-safety>
- Rückweg und Kontrolle — Nielsen Norman Group, M. Rosala (2020):
  <https://www.nngroup.com/articles/user-control-and-freedom/>
  → jede Lücke bleibt antippbar, „Zurück in Text“ macht eine Lücke rückgängig, jede Antwort gilt sofort.
- Seltenes eine Ebene tiefer — J. Nielsen (2006): <https://www.nngroup.com/articles/progressive-disclosure/>
  → im Einrichten-Fenster nur Art, Name, Antworten und Pflicht; alles Weitere in den normalen Einstellungen.
- Lücken als abgesetzte Einheiten im Text — Apple, Human Interface Guidelines, Token fields:
  <https://developer.apple.com/design/human-interface-guidelines/token-fields>; Platzhalter mit Namen im Text
  als verbreitetes Muster — TextExpander, Fill-ins:
  <https://textexpander.com/learn/using/snippets/snippet-fill-ins>
  → Lücken stehen als Marken im Text, beim Schreiben als `{Name}`.

## Optionen bearbeiten: Tabelle im Browser, Vollbild-Liste am Handy

Fenster „Optionen bearbeiten“ einer Auswahl (`packages/protocol-core-ui/components/OptionsDialog.vue`).

- Vollbild-Dialog am Handy für Eingaben mit Tastatur, die gesammelt gespeichert werden; Verwerfen (✕) oben
  links, Bestätigen oben rechts — Material Design, Dialogs, Full-screen dialogs:
  <https://m1.material.io/components/dialogs.html>
  → am Handy ganzer Bildschirm mit ✕ und „Fertig“ im Kopf; erst „Fertig“/„Übernehmen“ schreibt ins Feld.
- Tabellen am Handy: wenige Spalten, Details eines gewählten Eintrags statt Vergleich in Spalten —
  Nielsen Norman Group, A. Schade (2017): <https://www.nngroup.com/articles/mobile-tables/>
  → am Handy eine Liste mit Marken „Standard“/„allein“; Antippen öffnet das Eintrag-Feld. Ab 640 px Tabelle.
- Lange Einträge als Titel listen, Inhalt in einer Detailansicht; Umsortieren schätzen Nutzer — Apple, Human
  Interface Guidelines, Lists and tables: <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables>
  → Sortier-Griff an jeder Zeile (Ziehen oder Pfeiltasten), Text der Option im Eintrag-Feld.
- Wischen zum Löschen wird kaum entdeckt — Nielsen Norman Group, Contextual Swipe:
  <https://www.nngroup.com/articles/contextual-swipe/>
  → Löschen sichtbar im Eintrag-Feld (mit Rückfrage) und über „Mehr …“ → „Mehrere löschen“, kein Wischen.

## Mehrfachauswahl: Verbindung im Protokolltext

Einstellung „Verbindung im Protokolltext“ einer Mehrfachauswahl (`multiSeparator`,
`packages/protocol-core-ui/components/ContainerProperties.vue`, Ausgabe `joinFieldValues` in `packages/shared/fill.ts`).

- Eine aus wenigen Möglichkeiten: Auswahlknöpfe, weil sie alle Varianten dauerhaft zeigen — Nielsen Norman
  Group, Checkboxes vs. Radio Buttons, Richtlinie 8 („make all options permanently visible so that users can
  easily compare them“): <https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/>
  → vier Knöpfe (Aufzählung, Komma, Semikolon, Eigener Trenner), je mit Beispiel aus den eigenen Optionen
  (bei langen Optionen „A, B, C“),
  damit man das Ergebnis vor dem Wählen sieht. Jede Zeile ≥ 44 px hoch.
- Zusatzfrage erst nach der Wahl einblenden, nur wenn sie einfach ist — GOV.UK Design System, Radios,
  „Conditionally revealing a related question“: <https://design-system.service.gov.uk/components/radios/>
  → das Eingabefeld für den eigenen Trenner erscheint nur bei „Eigener Trenner“, mit Vorschau daneben.
- Standard bleibt die deutsche Aufzählung (Maintainer, 2026-11-13); ohne Einstellung ändert sich keine Ausgabe.
  Zeilenumbrüche im Trenner entfallen, weil die Bridge sie als Eingabetaste tippen würde.

## Aufbau der Vorlage am Handy: Abschnitte ein- und ausklappen

> Recherche-Stand 2026-11-22. Angewandt in `packages/protocol-core-ui/components/ContainerTreeNode.vue`,
> `packages/protocol-core-ui/treeFold.ts` und `apps/pico-pwa/src/components/rebuild/EditorView.vue`.

- Ein- und Ausklappen ist ein Knopf, der seinen Zustand mitteilt — W3C, ARIA Authoring Practices Guide,
  Disclosure Pattern („The element that shows and hides the content has role button“, `aria-expanded` true/false):
  <https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>
  → der Pfeil ist ein eigener Knopf mit `aria-expanded` und dem Namen des Abschnitts.
- Als Zeichen für „klappt an Ort und Stelle auf“ ist der Pfeil (Caret) am sichersten; Plus und Richtungspfeil
  schneiden nicht besser ab als kein Zeichen — Nielsen Norman Group, P. Laubheimer und R. Budiu, „Accordion Icons:
  Which Signifiers Work Best?“ (2020): <https://www.nngroup.com/articles/accordion-icons/>
  → Pfeil nach rechts (zu) und nach unten (offen), größtes Zeichen der Zeile.
- Dieselbe Quelle rät davon ab, Zeichen und Beschriftung getrennte Aktionen zu geben, weil rund 29 % der Tipps auf
  der Beschriftung landen. Hier bewusst anders (Maintainer, 2026-11-22): Der Name springt wie bisher zu den
  Eigenschaften, das ist die Hauptaufgabe der Zeile; nur der Pfeil klappt. Wer den Namen trifft, verliert nichts
  und kommt über „Aufbau“ zurück, der Zustand bleibt.
- Tippflächen wie im Abschnitt „Lückentext“ oben (NN/g Touch Targets, WCAG 2.5.8)
  → Pfeil 44 × 44 px; die Knöpfe der Zeile bleiben 44 px breit, damit der Name Platz behält.
- Wörter „Einklappen“ und „Ausklappen“ wie im Online-Editor (gleiche Begriffe in App und Editor).

## Zeichen, die die Bridge tippen kann: Ersetzen, Hinweis, Emojis

Die Bridge tippt als Tastatur mit deutscher Belegung; welche Zeichen sie kennt, steht in ihren Tabellen
(`firmware/bridge/libraries/Typer/src/Typer.cpp`). `packages/shared/typeable.ts` hält dieselbe Menge, ein Test
vergleicht beide.

- Gleichwertigkeit zusammengesetzter Zeichen (ein „a“ mit nachgestellten Punkten und das fertige „ä“ sind
  derselbe Text): Unicode Standard Annex 15, „Unicode Normalization Forms“, Form NFC:
  <https://unicode.org/reports/tr15/>
  → der Protokolltext wird vor dem Vergleich mit der Zeichenmenge in NFC gebracht.
- Was ein Emoji ist, legt Unicode Technical Standard 51 fest („Unicode Emoji“): Zeichen mit Emoji-Darstellung
  von Haus aus (`Emoji_Presentation`), Schriftzeichen, die erst durch U+FE0F zum Emoji werden, sowie Folgen mit
  U+200D, Hauttönen, Regional-Buchstaben (Flaggen), U+20E3 (Tasten) und Tag-Zeichen:
  <https://www.unicode.org/reports/tr51/>
  → entfernt wird jedes Bildzeichen (Eigenschaft `Extended_Pictographic`), also auch Symbole wie ©, ♀ oder ☑
  ohne Emoji-Zusatz (Maintainer, 2026-11-24). Zeichen außerhalb dieser Eigenschaft (✓, ☐, →) bleiben und
  erscheinen im Hinweis.
- Eingaben lassen sich vor dem Einfügen ablehnen (`beforeinput`, abbrechbar für `insertText` und
  `insertReplacementText`), während einer Komposition aber nicht (`insertCompositionText` ist nicht abbrechbar):
  W3C, „Input Events Level 2“: <https://www.w3.org/TR/input-events-2/>
  → ein Emoji allein wird abgelehnt (das Feld ändert sich nicht, die Schreibmarke bleibt); alles andere wird nach
  dem Einfügen bereinigt.
- Während einer Komposition (Eingabemethoden, Wortvorschläge) gehört der Text im Feld der Tastatur; verändert die
  Seite ihn, bricht die Eingabe ab. MDN, „Element: compositionstart event“ und „compositionend event“:
  <https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionstart_event>
  → zwischen `compositionstart` und `compositionend` greift der Filter nicht ein, bereinigt wird am Ende.
- Hinweis statt Sperre (Maintainer, 2026-11-24): Zeichen ohne Taste nennt die App vor dem Senden mit Anzahl;
  Senden bleibt möglich. Die Erklärung steht hinter dem ⓘ (Tippfläche 44 × 44 px, wie im Abschnitt „Lückentext“).
