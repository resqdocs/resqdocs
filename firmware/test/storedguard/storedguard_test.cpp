// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
// Host-Test fuer die Pruefung des Knopf-Textes (firmware/bridge/bridge_s2/StoredGuard.h).
// Lauf: bash firmware/test/storedguard/run.sh
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include "StoredGuard.h"

using namespace rq;

static std::string unescape(const std::string& in) {
  std::string out;
  for (size_t i = 0; i < in.size(); i++) {
    if (in[i] != '\\' || i + 1 >= in.size()) { out += in[i]; continue; }
    const char c = in[++i];
    out += c == 'n' ? '\n' : c == 't' ? '\t' : c == 'e' ? '\x1b' : c == 'b' ? '\b' : c == 'r' ? '\r' : c;
  }
  return out;
}

int main(int argc, char** argv) {
  if (argc < 2) { std::printf("Aufruf: storedguard_test <vectors.tsv>\n"); return 2; }
  std::ifstream f(argv[1]);
  if (!f) { std::printf("FEHLER: %s nicht lesbar\n", argv[1]); return 2; }
  int n = 0, bad = 0;
  std::string line;
  while (std::getline(f, line)) {
    if (line.empty() || line[0] == '#') continue;
    const size_t tab = line.find('\t');
    if (tab == std::string::npos) { std::printf("FEHLER: Zeile ohne Tabulator: %s\n", line.c_str()); return 2; }
    const std::string want = line.substr(0, tab);
    const std::string text = unescape(line.substr(tab + 1));
    const char* got = guardReason(storedGuardCheck(text.c_str(), text.size()));
    n++;
    if (want != got) { bad++; std::printf("FEHLER: erwartet %s, erhalten %s: %s\n", want.c_str(), got, line.c_str() + tab + 1); }
  }
  // Jedes Muster muss fuer sich allein anschlagen (kein totes Muster in der Liste).
  for (size_t m = 0; m < GUARD_NEEDLES_N; m++) {
    const char* s = GUARD_NEEDLES[m].s;
    n++;
    if (storedGuardCheck(s, std::strlen(s)) != GuardVerdict::COMMAND) { bad++; std::printf("FEHLER: Muster greift nicht: %s\n", s); }
  }
  if (n < 30) { std::printf("FEHLER: nur %d Faelle gelesen\n", n); return 1; }
  if (bad) { std::printf("%d von %d Faellen falsch\n", bad, n); return 1; }
  std::printf("OK: %d Faelle\n", n);
  return 0;
}
