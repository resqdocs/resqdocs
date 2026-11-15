// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  StoredGuard.h — Pruefung des Textes, der auf dem Stick abgelegt und per Knopf getippt wird.

  Der Stick ist eine Tastatur. Ein abgelegter Text, den ein Knopfdruck ohne Handy tippt, darf kein
  Werkzeug werden, um auf dem Zielrechner Befehle auszufuehren. Drei Ebenen:

    1. Tasten (Typer-Lib, unveraendert): getippt werden nur Schriftzeichen mit Umschalt/AltGr. Die
       Lib kann weder Windows-/Befehlstaste noch Strg, Alt oder Funktionstasten druecken - der Stick
       kann also selbst kein Fenster, kein „Ausfuehren" und kein Terminal oeffnen.
    2. Steuerzeichen (hier): ausser dem Zeilenumbruch ist keines erlaubt - kein Tabulator (springt
       zwischen Schaltflaechen), kein Ruecktaste-Zeichen, kein Escape.
    3. Befehlsmuster (hier): Programmaufrufe, Shell-Verkettungen und Internetadressen werden
       abgelehnt, auch mit eingestreuten ^ " ' ` (damit tarnt man Befehle in der Windows-Konsole).

  Ebene 3 ist eine Sperrliste und damit nie vollstaendig; die Garantie liefern Ebene 1 und 2 sowie
  der gedrueckte Knopf beim Ablegen. Geprueft wird beim Ablegen UND vor jedem Tippen per Knopf.

  Die App prueft mit derselben Liste vor dem Speichern (apps/pico-pwa/src/pico/storedTextGuard.ts);
  ein Test haelt beide Listen gleich, gemeinsame Beispiele: firmware/test/storedguard/vectors.tsv.
  Reine Logik ohne Arduino-Abhaengigkeit und ohne Speicheranforderung (Host-Test: storedguard/).
*/
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace rq {

enum class GuardVerdict : uint8_t { OK, CONTROL, COMMAND };

// Muster in Kleinbuchstaben. left/right = an dieser Seite darf kein Buchstabe und keine Ziffer
// anschliessen (Wortgrenze), damit z. B. „Curling" oder „Internet user" nicht anschlagen.
struct GuardNeedle { const char* s; bool left; bool right; };

static const GuardNeedle GUARD_NEEDLES[] = {
  // Kommandozeilen und Skript-Interpreter
  {"powershell", true, true},
  {"pwsh", true, true},
  {"cmd.exe", true, false},
  {"cmd /", true, false},
  {"bash", true, true},
  {"zsh", true, true},
  {"sudo", true, true},
  {"python", true, true},
  {"python3", true, true},
  {"perl", true, true},
  {"osascript", true, true},
  {"wscript", true, true},
  {"cscript", true, true},
  {"mshta", true, true},
  {"rundll32", true, true},
  {"regsvr32", true, true},
  {"msiexec", true, true},
  {"wmic", true, true},
  // Laden und Verbinden
  {"curl", true, true},
  {"wget", true, true},
  {"certutil", true, true},
  {"bitsadmin", true, true},
  {"ssh", true, true},
  {"scp", true, true},
  {"netcat", true, true},
  {"ncat", true, true},
  {"http://", false, false},
  {"https://", false, false},
  {"ftp://", false, false},
  {"file://", false, false},
  {"javascript:", false, false},
  {"vbscript:", false, false},
  {"<script", false, false},
  {"\\\\", false, false},
  // System veraendern
  {"schtasks", true, true},
  {"netsh", true, true},
  {"regedit", true, true},
  {"taskkill", true, true},
  {"diskpart", true, true},
  {"bcdedit", true, true},
  {"vssadmin", true, true},
  {"icacls", true, true},
  {"chmod", true, true},
  {"chown", true, true},
  {"mkfs", true, false},
  {"reg add", true, false},
  {"reg delete", true, false},
  {"net user", true, false},
  {"net localgroup", true, false},
  {"rm -rf", true, false},
  {"rm -fr", true, false},
  {"del /", true, false},
  {"format c:", true, false},
  {"shutdown /", true, false},
  {"shutdown -", true, false},
  {"hkey_", false, false},
  {"hklm:", false, false},
  {"hkcu:", false, false},
  {"c:\\windows", false, false},
  {"/bin/", false, false},
  {"/etc/", false, false},
  {"/dev/tcp", false, false},
  // PowerShell-Bausteine
  {"iex", true, true},
  {"invoke-", true, false},
  {"start-process", true, false},
  {"new-object", true, false},
  {"set-executionpolicy", true, false},
  {"add-mppreference", true, false},
  {"downloadstring", false, false},
  {"downloadfile", false, false},
  {"frombase64string", false, false},
  {"encodedcommand", false, false},
  {"-enc ", false, false},
  {"$env:", false, false},
  // Shell-Verkettung und Ersetzung
  {"&&", false, false},
  {"||", false, false},
  {"$(", false, false},
  {"${", false, false},
  {"2>&1", false, false},
  {"%appdata%", false, false},
  {"%temp%", false, false},
  {"%comspec%", false, false},
  {"%systemroot%", false, false},
  // Ausfuehrbare Dateien
  {".exe", false, true},
  {".bat", false, true},
  {".ps1", false, true},
  {".vbs", false, true},
  {".scr", false, true},
  {".msi", false, true},
  {".dll", false, true},
};
static const size_t GUARD_NEEDLES_N = sizeof(GUARD_NEEDLES) / sizeof(GUARD_NEEDLES[0]);

// Zeichen, die beim Vergleich uebergangen werden (Tarnung in der Windows-Konsole/PowerShell).
inline bool guardSkipped(uint8_t c) { return c == '^' || c == '"' || c == '\'' || c == '`'; }
inline uint8_t guardFold(uint8_t c) { return (c >= 'A' && c <= 'Z') ? (uint8_t)(c + 32) : c; }
inline bool guardAlnum(uint8_t c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'); }

// Passt das Muster ab Position i? Uebergeht Tarnzeichen und fasst mehrere Leerzeichen zusammen.
// `end` erhaelt die Position hinter dem Treffer.
inline bool guardMatchAt(const uint8_t* s, size_t n, size_t i, const char* needle, size_t* end) {
  size_t j = i;
  uint8_t last = 0;
  for (size_t k = 0; needle[k]; ) {
    if (j >= n) return false;
    const uint8_t raw = s[j];
    if (guardSkipped(raw)) { j++; continue; }
    const uint8_t c = guardFold(raw);
    if (c == ' ' && last == ' ') { j++; continue; }
    if (c != (uint8_t)needle[k]) return false;
    last = c;
    j++;
    k++;
  }
  *end = j;
  return true;
}

// Index des ersten Musters, das im Text vorkommt, sonst -1.
inline int guardFindCommand(const uint8_t* s, size_t n) {
  uint8_t prev = 0;  // letztes nicht uebergangenes Zeichen vor i (klein)
  for (size_t i = 0; i < n; i++) {
    if (guardSkipped(s[i])) continue;
    const uint8_t c = guardFold(s[i]);
    for (size_t m = 0; m < GUARD_NEEDLES_N; m++) {
      const GuardNeedle& nd = GUARD_NEEDLES[m];
      if ((uint8_t)nd.s[0] != c) continue;
      if (nd.left && guardAlnum(prev)) continue;
      size_t end = 0;
      if (!guardMatchAt(s, n, i, nd.s, &end)) continue;
      if (nd.right) {
        size_t r = end;
        while (r < n && guardSkipped(s[r])) r++;
        if (r < n && guardAlnum(guardFold(s[r]))) continue;
      }
      return (int)m;
    }
    prev = c;
  }
  return -1;
}

inline GuardVerdict storedGuardCheck(const char* text, size_t n) {
  const uint8_t* s = (const uint8_t*)text;
  for (size_t i = 0; i < n; i++) {
    if ((s[i] < 0x20 && s[i] != '\n') || s[i] == 0x7F) return GuardVerdict::CONTROL;
  }
  return guardFindCommand(s, n) >= 0 ? GuardVerdict::COMMAND : GuardVerdict::OK;
}

inline const char* guardReason(GuardVerdict v) {
  return v == GuardVerdict::CONTROL ? "control" : (v == GuardVerdict::COMMAND ? "command" : "ok");
}

}  // namespace rq
