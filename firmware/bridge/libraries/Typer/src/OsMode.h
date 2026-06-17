// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  OsMode.h — target-OS selector for the ResQDocs typer.

  The HID `bCountryCode` is ignored by every OS, so the HOST's active keyboard
  layout decides how scancodes become characters. The bridge must therefore be
  told which host layout to aim at. `win_de` is the proven path (SaniScript).
  `mac_de` / `ios` use Apple Option-key conventions that differ from Windows
  AltGr — their keymaps do not exist yet, so they currently alias win_de (see
  Typer.cpp). The enum is the clean seam: real per-OS tables drop in later.
*/
#pragma once
#include <Arduino.h>

namespace rq {

enum class OsMode : uint8_t { WIN_DE = 0, MAC_DE = 1, IOS = 2 };

inline const char* osModeName(OsMode m) {
  switch (m) {
    case OsMode::WIN_DE: return "win_de";
    case OsMode::MAC_DE: return "mac_de";
    case OsMode::IOS:    return "ios";
  }
  return "?";
}

}  // namespace rq
