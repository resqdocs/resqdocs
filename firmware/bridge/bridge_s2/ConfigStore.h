// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  ConfigStore.h — persistente Geraete-Konfiguration der S2-Bridge (Issue #14).

  Haelt genau EINEN Wert: die SSID-<id> (S2, docs/pico-api.md). Persistenz ueber
  die arduino-pico EEPROM-Emulation (flash-backed). Default-<id> = 6 Hex aus der
  RP2350-Chip-ID -> out-of-the-box eindeutige SSID ohne Setup.

  Validierung serverseitig wie spezifiziert: ^[A-Za-z0-9_-]{1,23}$
  (keine Umlaute/Leerzeichen/Steuerzeichen; SSID "ResQDocs-<id>" bleibt <=32 Byte).
  KEINE Patientendaten — nur die neutrale Geraete-Id.
*/
#pragma once
#include <Arduino.h>
#include <EEPROM.h>

namespace rq {

static const uint8_t  CFG_MAGIC   = 0x52;  // 'R' — markiert initialisierten Store
static const size_t   CFG_EEPROM  = 64;    // Bytes EEPROM-Emulation (reichlich)
static const uint8_t  ID_MAX_LEN  = 23;

// ^[A-Za-z0-9_-]{1,23}$
inline bool ssidIdValid(const String& id) {
  if (id.length() < 1 || id.length() > ID_MAX_LEN) return false;
  for (size_t i = 0; i < id.length(); i++) {
    char c = id[i];
    bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
              (c >= '0' && c <= '9') || c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

// 6 Hex (Grossbuchstaben) aus dem Ende der eindeutigen Chip-ID.
// rp2040.getChipID() liefert einen Hex-String (pico unique board id).
inline String defaultSsidId() {
  const char* chip = rp2040.getChipID();
  size_t n = strlen(chip);
  char buf[7];
  size_t start = (n > 6) ? n - 6 : 0;
  size_t j = 0;
  for (size_t i = start; i < n && j < 6; i++, j++) buf[j] = (char)toupper((unsigned char)chip[i]);
  buf[j] = '\0';
  return (j > 0) ? String(buf) : String("000000");
}

inline void configBegin() { EEPROM.begin(CFG_EEPROM); }

// Gespeicherte <id> lesen; ohne (gueltigen) Eintrag -> Chip-ID-Default.
inline String loadSsidId() {
  if (EEPROM.read(0) != CFG_MAGIC) return defaultSsidId();
  uint8_t len = EEPROM.read(1);
  if (len < 1 || len > ID_MAX_LEN) return defaultSsidId();
  String id;
  id.reserve(len);
  for (uint8_t i = 0; i < len; i++) id += (char)EEPROM.read(2 + i);
  return ssidIdValid(id) ? id : defaultSsidId();
}

// <id> persistieren (Aufrufer hat validiert). true bei Commit-Erfolg.
inline bool saveSsidId(const String& id) {
  EEPROM.write(0, CFG_MAGIC);
  EEPROM.write(1, (uint8_t)id.length());
  for (size_t i = 0; i < id.length(); i++) EEPROM.write(2 + i, (uint8_t)id[i]);
  return EEPROM.commit();
}

}  // namespace rq
