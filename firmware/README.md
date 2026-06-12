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
