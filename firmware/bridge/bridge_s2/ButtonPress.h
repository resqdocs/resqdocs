// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  ButtonPress.h — den Knopf der Bridge (BOOTSEL) als einfachen Taster auswerten.

  Reine Logik ohne Hardware-Zugriff (der Aufrufer reicht den gelesenen Zustand herein), damit sie
  am Rechner testbar ist. Erkennt einen KURZEN Druck beim Loslassen: entprellt, und nur wenn der
  Knopf hoechstens MAX_PRESS_MS gehalten wurde. Ein langes Halten ist kein Druck - so loest das
  Gedrueckthalten beim Ablegen einer Vorlage nicht anschliessend das Tippen aus. Zusaetzlich kann
  der Aufrufer den laufenden Druck ausdruecklich verwerfen (suppress).
*/
#pragma once
#include <Arduino.h>

namespace rq {

struct ButtonPress {
  static const uint32_t DEBOUNCE_MS = 40;
  static const uint32_t MAX_PRESS_MS = 1500;

  bool stable = false;      // entprellter Zustand: gedrueckt?
  bool lastRaw = false;     // zuletzt gelesener Rohzustand
  uint32_t rawSince = 0;    // seit wann der Rohzustand unveraendert ist
  uint32_t pressedAt = 0;   // Beginn des laufenden Drucks
  bool suppressed = false;  // laufender Druck zaehlt nicht

  bool held() const { return stable; }

  // Den gerade gehaltenen Druck verwerfen (z. B. weil er als Bestaetigung fuers Ablegen diente).
  void suppress() { if (stable) suppressed = true; }

  // Regelmaessig aufrufen. Liefert genau einmal true, wenn ein kurzer Druck losgelassen wurde.
  bool tick(bool raw, uint32_t now) {
    if (raw != lastRaw) {
      lastRaw = raw;
      rawSince = now;
    }
    if (raw == stable || (uint32_t)(now - rawSince) < DEBOUNCE_MS) return false;
    stable = raw;
    if (stable) {            // gerade gedrueckt
      pressedAt = now;
      suppressed = false;
      return false;
    }
    const bool fire = !suppressed && (uint32_t)(now - pressedAt) <= MAX_PRESS_MS;
    suppressed = false;
    return fire;
  }
};

}  // namespace rq
