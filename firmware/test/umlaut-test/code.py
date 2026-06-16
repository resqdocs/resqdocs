# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 The ResQDocs project contributors
# ResQDocs — Umlaut- & Sonderzeichen-Test (CircuitPython, Pico 1 / RP2040)
#
# ZWECK: Pruefen, ob Umlaute UND Sonderzeichen als USB-HID-Tastatur korrekt am
#        Zielgeraet (NIDA / iPad / Win / macOS) ankommen. Das ist Akzeptanz-
#        kriterium #1 (Issue #1) und die zentrale Projekt-Unbekannte.
#
# NUR TEST — die Produktiv-Firmware ist arduino-pico (siehe ../../README.md).
# Die Umlaut-Frage ist host-layout-abhaengig und damit stack-unabhaengig; dieser
# CircuitPython-Test beantwortet sie drag-and-drop, ohne Toolchain.
#
# VORAUSSETZUNG AM HOST: deutsches Tastatur-Layout aktiv (wie SaniScript).
# VORAUSSETZUNG AM PICO: CIRCUITPY/lib/ enthaelt:
#   adafruit_hid/  und  keyboard_layout_win_de.py + keycode_win_de.py (Neradoc)
#   (lagen bei SaniScript bereits vor). Fehlt das DE-Layout -> Fallback US (Umlaute brechen).
#
# BENUTZUNG: code.py auf den CIRCUITPY-Stick kopieren, Pico per USB ans Zielgeraet,
#   ein Textfeld fokussieren -> nach 5 s tippt der Pico den Teststring EINMAL.
#   Erneut testen: Pico ab- und wieder anstecken.

import time
import usb_hid
from adafruit_hid.keyboard import Keyboard

try:
    from keyboard_layout_win_de import KeyboardLayout      # Neradoc DE (wie SaniScript)
    LAYOUT_NAME = "win_de"
except ImportError:
    from adafruit_hid.keyboard_layout_us import KeyboardLayoutUS as KeyboardLayout
    LAYOUT_NAME = "us_FALLBACK"

keyboard = Keyboard(usb_hid.devices)
layout = KeyboardLayout(keyboard)

# Kategorien getrennt, damit man in NIDA Zeile fuer Zeile sieht, was wo bricht.
# Label-Woerter sind bewusst ASCII (bleiben lesbar, auch wenn Sonderzeichen scheitern).
LINES = [
    "ResQDocs Test Layout=" + LAYOUT_NAME,
    "Umlaute: ä ö ü Ä Ö Ü ß",
    "DE-Sonder: § ° ! \" $ % & / ( ) = ? + * # - _ . , ; :",
    "AltGr: @ € { } [ ] \\ ~ | µ",
    "Akzente: é è ê ç à â î ô û ñ á í ó ú",
    "Zahlen: 116117 112",
    "Ende.",
]


def safe_write(text):
    """Zeichenweise tippen; nicht abbildbare Zeichen werden zu [?], statt abzubrechen."""
    for ch in text:
        try:
            layout.write(ch)
        except Exception:
            try:
                layout.write("[?]")
            except Exception:
                pass


time.sleep(5)  # Zeit zum Fokussieren des Zielfeldes

for line in LINES:
    safe_write(line)
    try:
        layout.write("\n")
    except Exception:
        pass
    time.sleep(0.2)

# Danach Ruhe (nicht wiederholt tippen):
while True:
    time.sleep(1)
