// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  Typer.h — the shared USB-HID typer for the ResQDocs bridge.

  Both slices (slice_a_umlaut, slice_b_bridge) type EXCLUSIVELY through this
  module so the de-risked code path is reused byte-for-byte. Input is always
  UTF-8 (the renderer / web form emit UTF-8); output is German-layout keystrokes.

  Built on the arduino-pico bundled `Keyboard` library, which requires the
  DEFAULT Pico-SDK USB stack — do NOT build with usbstack=tinyusb (the core's
  Keyboard.h #errors under Adafruit TinyUSB).
*/
#pragma once
#include <Arduino.h>
#include "OsMode.h"

namespace rq {

// Initialise the USB-HID keyboard with the de_DE base layout and set the mode.
void typerBegin(OsMode mode = OsMode::WIN_DE);

// Switch target-OS mode at runtime (Slice A serial w/m/i, Slice B web <select>).
void typerSetMode(OsMode mode);
OsMode typerMode();

// Type a UTF-8 string, decoding to codepoints and routing each one. A small
// per-character delay makes failures observable in real time on the target.
void typeUtf8(const char* utf8, uint16_t perCharDelayMs = 60);

// Type a single Unicode codepoint. Returns true if it was mapped to a
// keystroke, false if the visible [?] marker was emitted instead.
bool typeCodepoint(uint32_t cp);

// Type one raw HID usage code with optional Shift / AltGr(=Option). Used by the
// Slice-A layout probe to measure a target device's mapping key-by-key.
void typeRawKey(uint8_t hidKeycode, bool shift, bool altgr);

}  // namespace rq
