// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
// Host-Test fuer die Ablauflogik des Tipp-Auftrags (firmware/bridge/bridge_s2/TypeJob.h).
// Lauf: bash firmware/test/typejob/run.sh
#include <cassert>
#include <cstdio>
#include "TypeJob.h"

uint32_t g_millis = 1000;
std::string rq::g_typed;

using namespace rq;

static uint32_t chars(const std::string& s) {
  uint32_t n = 0;
  for (unsigned char c : s) if ((c & 0xC0) != 0x80) n++;
  return n;
}
static bool accept(TypeJob& j, const std::string& s, uint16_t delay = 10) {
  return j.accept(String(s), chars(s), delay);
}
// Laesst die Zeit laufen und ruft tick() jede Millisekunde, wie loop().
static void run(TypeJob& j, uint32_t ms) {
  for (uint32_t i = 0; i < ms; i++) { j.tick(); g_millis++; }
}
static void reset() { g_typed.clear(); }

#define CHECK(c) do { if (!(c)) { std::printf("FEHLER Zeile %d: %s\n", __LINE__, #c); return 1; } } while (0)

int main() {
  {  // 1) Ein Auftrag wird vollstaendig getippt, ein Zeichen je delayMs.
    reset(); TypeJob j;
    CHECK(accept(j, "Hallo", 10));
    CHECK(j.state == TypeState::TYPING && j.total == 5 && j.done == 0 && j.jobId == 1);
    j.tick(); CHECK(g_typed == "H" && j.done == 1);
    run(j, 5); CHECK(g_typed == "H");            // noch keine 10 ms um
    run(j, 6); CHECK(g_typed == "Ha");
    run(j, 100);
    CHECK(g_typed == "Hallo" && j.state == TypeState::IDLE && j.done == 5 && j.lastEnd == TypeEnd::DONE);
    CHECK(j.text.length() == 0);                 // Inhalt nach dem Ende geleert
  }
  {  // 2) Umlaute zaehlen als EIN Zeichen (Fortschritt in Zeichen, nicht Bytes).
    reset(); TypeJob j;
    CHECK(accept(j, "\xC3\xA4\xC3\xB6\xC3\xBC\xE2\x82\xAC", 5));   // ä ö ü €
    CHECK(j.total == 4);
    j.tick(); CHECK(j.done == 1 && g_typed == "\xC3\xA4");
    run(j, 100); CHECK(j.done == 4 && j.state == TypeState::IDLE);
  }
  {  // 3) Anhalten stoppt sofort, Fortsetzen tippt an derselben Stelle weiter.
    reset(); TypeJob j;
    CHECK(accept(j, "abcdef", 10));
    run(j, 25); CHECK(g_typed == "abc");
    CHECK(j.pause() && j.state == TypeState::PAUSED);
    run(j, 500); CHECK(g_typed == "abc" && j.done == 3);
    CHECK(j.pause());                            // nochmal anhalten ist kein Fehler
    CHECK(j.resume() && j.state == TypeState::TYPING);
    run(j, 100); CHECK(g_typed == "abcdef" && j.lastEnd == TypeEnd::DONE);
  }
  {  // 4) Abbrechen: nichts wird mehr getippt, Text ist weg, Ende = cancelled.
    reset(); TypeJob j;
    CHECK(accept(j, "geheim-geheim", 10));
    run(j, 25);
    const std::string bisher = g_typed;
    CHECK(j.cancel());
    CHECK(j.state == TypeState::IDLE && j.lastEnd == TypeEnd::CANCELLED && j.text.length() == 0);
    run(j, 500); CHECK(g_typed == bisher);
    CHECK(j.done == chars(bisher) && j.total == 13);   // Zahlen bleiben fuer die Anzeige stehen
    CHECK(!j.cancel() && !j.pause() && !j.resume());   // ohne Auftrag: nichts zu steuern
  }
  {  // 5) Zweiter Teil waehrend des Tippens wird angehaengt (lange Texte, aeltere Apps).
    reset(); TypeJob j;
    CHECK(accept(j, "eins ", 10));
    run(j, 25); CHECK(g_typed == "ein");
    CHECK(accept(j, "zwei", 10));
    CHECK(j.jobId == 1 && j.total == 9 && j.done == 3 && j.state == TypeState::TYPING);
    run(j, 200); CHECK(g_typed == "eins zwei" && j.done == 9 && j.lastEnd == TypeEnd::DONE);
    CHECK(accept(j, "neu", 10)); CHECK(j.jobId == 2 && j.done == 0 && j.total == 3);
  }
  {  // 6) Anhaengen auch im angehaltenen Zustand; Auftrag bleibt angehalten.
    reset(); TypeJob j;
    CHECK(accept(j, "ab", 10)); j.tick(); CHECK(j.pause());
    CHECK(accept(j, "cd", 10)); CHECK(j.state == TypeState::PAUSED && j.total == 4);
    run(j, 100); CHECK(g_typed == "a");
    CHECK(j.resume()); run(j, 100); CHECK(g_typed == "abcd");
  }
  {  // 7) Warteschlange voll: neuer Teil wird abgelehnt, der laufende Auftrag bleibt unberuehrt.
    reset(); TypeJob j;
    const std::string gross(TYPE_QUEUE_MAX_BYTES - 10, 'x');
    CHECK(accept(j, gross, 5));
    CHECK(!accept(j, std::string(100, 'y'), 5));
    CHECK(j.total == gross.size() && j.state == TypeState::TYPING);
    j.tick(); CHECK(g_typed == "x");
    CHECK(!TypeJob().accept(String(std::string(TYPE_QUEUE_MAX_BYTES + 1, 'z')), TYPE_QUEUE_MAX_BYTES + 1, 5));
  }
  {  // 8) Angehalten und vergessen: nach dem Timeout wird verworfen (Text nicht ewig im RAM).
    reset(); TypeJob j;
    CHECK(accept(j, "patient", 10)); j.tick(); CHECK(j.pause());
    g_millis += TYPE_PAUSE_TIMEOUT_MS - 5; j.tick(); CHECK(j.state == TypeState::PAUSED);
    g_millis += 10; j.tick();
    CHECK(j.state == TypeState::IDLE && j.lastEnd == TypeEnd::CANCELLED && j.text.length() == 0);
  }
  {  // 9) millis()-Ueberlauf (nach ~49 Tagen) haelt das Tippen nicht an.
    reset(); TypeJob j;
    g_millis = 0xFFFFFFF0u;
    CHECK(accept(j, "abc", 10));
    run(j, 100); CHECK(g_typed == "abc");
    g_millis = 1000;
  }
  {  // 10) Statusausgabe: nur Zahlen und Zustand, nie Inhalt.
    reset(); TypeJob j;
    CHECK(accept(j, "Mustermann", 25)); j.tick();
    const std::string js = j.json().str();
    CHECK(js == "{\"state\":\"typing\",\"done\":1,\"total\":10,\"delayMs\":25,\"jobId\":1,\"lastEnd\":\"none\"}");
    CHECK(js.find("Muster") == std::string::npos);
  }
  {  // 11) Ungueltige Bytes werden uebersprungen; am Ende gilt done == total.
    reset(); TypeJob j;
    const std::string kaputt = std::string("a") + "\x80" + "b" + "\xC3";   // Folgebyte allein, abgeschnittene Sequenz
    CHECK(j.accept(String(kaputt), chars(kaputt), 5));
    run(j, 100); CHECK(g_typed == "ab" && j.state == TypeState::IDLE && j.done == j.total);
  }
  std::printf("typejob: 11 Faelle ok\n");
  return 0;
}
