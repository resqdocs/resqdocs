# Umlaute & Sonderzeichen — die zentrale Herausforderung

Zuverlässige `ä ö ü ß` und Sonderzeichen waren in der Vorläuferlösung der größte
Schmerzpunkt (der USB-QR-Scanner scheiterte am UTF-8-Mapping). Diese Datei hält die
Ursache und die robuste, **plattformübergreifende** Strategie fest.

## Ursache

Eine USB-HID-Tastatur sendet **keine Zeichen**, sondern nur *Scancodes / Usage-IDs*
(physische Tastenposition). Welches Zeichen daraus wird, entscheidet der **Host**:

```
HID-Usage-ID → Scancode → Virtual-Key → Host-Tastatur-Layout → Zeichen
```

Folge: Dasselbe HID-Signal ergibt je nach **Host-OS und aktivem Layout** ein anderes Zeichen.
`keyboard_layout_win_de` funktioniert nur, solange der Host auf **deutschem** Layout steht —
und gilt streng genommen für **Windows**. Mac und iOS interpretieren teils anders.

## Cross-Platform-Anforderung

ResQDocs soll an **Windows**, **macOS** und **iOS** getippt werden können. Es gibt **keinen
einzelnen Trick**, der überall identisch funktioniert. Die Bridge muss daher das Ziel kennen
(per-OS-Modus, umschaltbar) und je OS die passende Methode wählen:

| Host | Primär (Layout gesetzt) | Layout-unabhängiger Fallback |
|------|--------------------------|------------------------------|
| **Windows** | DE-HID-Layout (`win_de`) | **Alt-Codes** (Alt + Ziffernblock, `ä`=Alt+0228) — die Firmware sendet Keypad-Usage-Codes direkt, kein physischer Numpad nötig |
| **macOS** | DE-Mac-Layout | **Unicode-Hex** via Option-Taste / „Unicode Hex Input"; alternativ Option-Dead-Keys (z. B. Option+u für Umlaut) |
| **iOS / iPadOS** | In iOS gewähltes Hardware-Tastatur-Layout (Settings → Allgemein → Tastatur → Hardware-Tastatur) | iOS hat kein universelles Alt-/Hex-Verfahren → **Layout muss passend gesetzt sein**; BLE-HID-Tastatur empfohlen |

## Empfohlene Strategie

1. **Bridge mit OS-Zielmodus** (Windows / macOS / iOS), per UI/Schalter wählbar.
2. **Primärpfad:** korrektes Tastatur-Layout je OS + dokumentierte Host-Konfiguration
   (welches Layout muss auf dem jeweiligen Gerät gesetzt sein).
3. **Fallback** nur für Problemzeichen je OS (Windows: Alt-Codes; macOS: Unicode-Hex).
4. **Testmatrix** (siehe Verifikation): fester Teststring `ä ö ü Ä Ö Ü ß € 116 117` auf jeder
   Plattform gegen ein leeres Textfeld prüfen, bevor produktiv genutzt.

## Quellen

Siehe [`sources.md`](sources.md) (Adafruit-HID-Layoutabhängigkeit, Windows-Eingabekette,
Neradoc-Layouts, Alt-Code-Ansatz).
