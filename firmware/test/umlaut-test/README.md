# Umlaut- & Sonderzeichen-Test (Pico 1, CircuitPython)

Schneller Hardware-Test für **Akzeptanzkriterium #1** (Issue #1): Kommen Umlaute **und**
Sonderzeichen als USB-HID-Tastatur korrekt am Zielgerät (NIDA / iPad) an?

> **Nur Test.** Produktiv-Firmware ist arduino-pico (siehe [`../../README.md`](../../README.md)).
> Die Umlaut-Frage ist host-layout-abhängig → stack-unabhängig; CircuitPython beantwortet sie
> drag-and-drop, ohne Toolchain an der Wache.

## Vorbereitung (morgen an der Wache)

1. **Host (NIDA/iPad):** deutsches Tastatur-Layout sicherstellen (wie bei SaniScript).
2. **Pico 1:** muss CircuitPython haben. `CIRCUITPY/lib/` braucht:
   - `adafruit_hid/`
   - `keyboard_layout_win_de.py` + `keycode_win_de.py` (Neradoc) — lagen bei SaniScript bereits vor.
   - Falls das DE-Layout fehlt → Skript nutzt **US-Fallback** (erste Zeile zeigt `Layout=us_FALLBACK`,
     Umlaute brechen dann erwartungsgemäß). Neradoc-Layouts:
     <https://github.com/Neradoc/Circuitpython_Keyboard_Layouts>
3. `code.py` aus diesem Ordner auf den **CIRCUITPY**-Stick kopieren (ersetzt die alte).

## Durchführung

1. Pico per USB ans Zielgerät stecken.
2. Ein **Textfeld fokussieren** (NIDA-Freitextfeld o. ä.).
3. Nach **5 Sekunden** tippt der Pico den Teststring **einmal**.
4. Erneut testen: Pico ab- und wieder anstecken.

## Auswertung

Erwartete Ausgabe (bei korrektem DE-Host + vollständigem Layout):

```
ResQDocs Test Layout=win_de
Umlaute: ä ö ü Ä Ö Ü ß
DE-Sonder: § ° ! " $ % & / ( ) = ? + * # - _ . , ; :
AltGr: @ € { } [ ] \ ~ | µ
Akzente: é è ê ç à â î ô û ñ á í ó ú
Zahlen: 116117 112
Ende.
```

Pro Zeichen drei mögliche Ergebnisse:
- **korrekt** → funktioniert.
- **falsches Zeichen** → Host-Layout passt nicht (oder Layout-Tabelle bildet es anders ab).
- **`[?]`** → das Layout kann das Zeichen nicht abbilden (z. B. evtl. `€` oder Akzente).

**Bitte notieren/abfotografieren, was rauskommt** — besonders Zeile *AltGr* (`€` ist der
wahrscheinlichste Problemfall) und *Akzente* (EN/FR/ES „kann"). Das Ergebnis entscheidet, ob
für die Produktiv-Firmware die Unicode-Schicht (`Arduino_KeyboardUTF8`) bzw. explizite
AltGr-/Unicode-Keycodes nötig sind. Ergebnis kommt als Kommentar an Issue #1.
