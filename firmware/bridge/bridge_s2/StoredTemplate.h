// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  StoredTemplate.h — EINE auf der Bridge abgelegte Vorlage, die ein Knopfdruck ohne Handy tippt.

  Datenschutz: Abgelegt wird ausschliesslich der Text einer VORLAGE mit ihren Standardwerten, den
  die App aus der Vorlage erzeugt - nie ein ausgefuellter Einsatz, nie Patientendaten. Der Text
  liegt im LittleFS der Bridge (dieselbe Partition wie der OTA-Zwischenspeicher; ein Firmware-Update
  laesst ihn stehen). Ohne Knopf gehen nach aussen nur Name, Laenge und Zeitpunkt. Ablegen, Entfernen
  und Auslesen verlangen den gedrueckten Knopf (Nachweis, dass man den Stick in der Hand hat), denn
  das WLAN-Passwort der Bridge ist oeffentlich dokumentiert.
*/
#pragma once
#include <Arduino.h>
#include <LittleFS.h>

namespace rq {

static const char* STORED_TEXT_FILE = "/vorlage.txt";
static const char* STORED_TEMP_FILE = "/vorlage.tmp";
static const char* STORED_META_FILE = "/vorlage.meta";
static const size_t STORED_NAME_MAX = 60;

struct StoredInfo {
  bool present = false;
  String name;            // Titel der Vorlage (bereinigt)
  uint32_t chars = 0;     // Zeichen
  String os = "win_de";   // Ziel-Tastatur beim Tippen
  uint16_t delayMs = 60;  // Tippgeschwindigkeit
  uint32_t savedAt = 0;   // Unix-Sekunden laut App (0 = unbekannt)
};

// Namen fuer die JSON-Ausgabe entschaerfen: keine Steuerzeichen, keine Anfuehrungszeichen/Backslashes.
inline String storedCleanName(const String& in) {
  String out;
  for (size_t i = 0; i < in.length() && out.length() < STORED_NAME_MAX; i++) {
    const char c = in[i];
    if ((uint8_t)c < 0x20) out += ' ';
    else if (c == '"') out += '\'';
    else if (c == '\\') out += '/';
    else out += c;
  }
  out.trim();
  return out;
}

inline bool storedOsValid(const String& os) { return os == "win_de" || os == "mac_de" || os == "ios"; }

// Aus dem Dateisystem lesen (beim Start und nach jeder Aenderung).
inline StoredInfo storedRead() {
  StoredInfo info;
  if (!LittleFS.exists(STORED_TEXT_FILE) || !LittleFS.exists(STORED_META_FILE)) return info;
  File m = LittleFS.open(STORED_META_FILE, "r");
  if (!m) return info;
  info.name = storedCleanName(m.readStringUntil('\n'));
  info.chars = (uint32_t)m.readStringUntil('\n').toInt();
  String os = m.readStringUntil('\n');
  os.trim();
  if (storedOsValid(os)) info.os = os;
  const long d = m.readStringUntil('\n').toInt();
  info.delayMs = (uint16_t)(d < 5 ? 5 : (d > 150 ? 150 : d));
  info.savedAt = (uint32_t)m.readStringUntil('\n').toInt();
  m.close();
  info.present = info.chars > 0;
  return info;
}

// Ablegen: erst in eine Zwischendatei schreiben, dann umbenennen - ein Stromausfall mittendrin
// laesst die bisherige Vorlage stehen. false = Dateisystemfehler (nichts geaendert bzw. aufgeraeumt).
inline bool storedSave(const String& text, const StoredInfo& info) {
  LittleFS.remove(STORED_TEMP_FILE);
  File f = LittleFS.open(STORED_TEMP_FILE, "w");
  if (!f) return false;
  const size_t n = f.write((const uint8_t*)text.c_str(), text.length());
  f.close();
  if (n != text.length()) { LittleFS.remove(STORED_TEMP_FILE); return false; }
  LittleFS.remove(STORED_TEXT_FILE);
  if (!LittleFS.rename(STORED_TEMP_FILE, STORED_TEXT_FILE)) { LittleFS.remove(STORED_TEMP_FILE); return false; }
  File m = LittleFS.open(STORED_META_FILE, "w");
  if (!m) { LittleFS.remove(STORED_TEXT_FILE); return false; }
  m.print(info.name); m.print('\n');
  m.print(info.chars); m.print('\n');
  m.print(info.os); m.print('\n');
  m.print(info.delayMs); m.print('\n');
  m.print(info.savedAt); m.print('\n');
  m.close();
  return true;
}

// Text zum Tippen laden. Leer = nichts abgelegt bzw. Lesefehler.
inline String storedLoad() {
  File f = LittleFS.open(STORED_TEXT_FILE, "r");
  if (!f) return String();
  String text = f.readString();
  f.close();
  return text;
}

inline void storedClear() {
  LittleFS.remove(STORED_TEXT_FILE);
  LittleFS.remove(STORED_TEMP_FILE);
  LittleFS.remove(STORED_META_FILE);
}

// Nur Angaben, kein Inhalt.
// blocked = der abgelegte Text besteht die Pruefung nicht (StoredGuard.h) und wird nicht getippt.
inline String storedJson(const StoredInfo& info, bool buttonHeld, bool blocked) {
  return String("{\"present\":") + (info.present ? "true" : "false") +
         ",\"name\":\"" + (info.present ? info.name : String("")) +
         "\",\"chars\":" + (info.present ? info.chars : 0) +
         ",\"os\":\"" + info.os + "\",\"delayMs\":" + info.delayMs +
         ",\"savedAt\":" + (info.present ? info.savedAt : 0) +
         ",\"buttonHeld\":" + (buttonHeld ? "true" : "false") +
         ",\"blocked\":" + (blocked ? "true" : "false") + "}";
}

}  // namespace rq
