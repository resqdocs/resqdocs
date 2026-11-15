// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
// Host-Test fuer die Knopf-Auswertung (firmware/bridge/bridge_s2/ButtonPress.h).
// Lauf: bash firmware/test/button/run.sh
#include <cstdio>
#include "ButtonPress.h"

uint32_t g_millis = 0;
using namespace rq;

// Haelt den Rohzustand `raw` fuer `ms` Millisekunden (Abfrage alle 25 ms wie in loop()) und zaehlt Druecke.
static int hold(ButtonPress& b, bool raw, uint32_t ms) {
  int fired = 0;
  for (uint32_t t = 0; t < ms; t += 25) { g_millis += 25; if (b.tick(raw, g_millis)) fired++; }
  return fired;
}

#define CHECK(c) do { if (!(c)) { std::printf("FEHLER Zeile %d: %s\n", __LINE__, #c); return 1; } } while (0)

int main() {
  {  // 1) Kurzer Druck: genau EIN Ereignis, und zwar beim Loslassen.
    ButtonPress b; g_millis = 1000;
    CHECK(hold(b, false, 200) == 0);
    CHECK(hold(b, true, 300) == 0);      // waehrend des Haltens passiert nichts
    CHECK(b.held());
    CHECK(hold(b, false, 200) == 1);
    CHECK(!b.held());
    CHECK(hold(b, false, 500) == 0);     // kein zweites Ereignis
  }
  {  // 2) Prellen (kuerzer als die Entprellzeit) loest nichts aus.
    ButtonPress b; g_millis = 1000;
    for (int i = 0; i < 6; i++) { g_millis += 10; CHECK(!b.tick(i % 2 == 0, g_millis)); }
    CHECK(!b.held());
    CHECK(hold(b, false, 200) == 0);
  }
  {  // 3) Langes Halten ist kein Druck (z. B. Gedrueckthalten beim Ablegen).
    ButtonPress b; g_millis = 1000;
    CHECK(hold(b, true, ButtonPress::MAX_PRESS_MS + 500) == 0);
    CHECK(hold(b, false, 200) == 0);
  }
  {  // 4) Ausdruecklich verworfen: auch ein kurzes Halten zaehlt dann nicht.
    ButtonPress b; g_millis = 1000;
    CHECK(hold(b, true, 200) == 0);
    b.suppress();
    CHECK(hold(b, false, 200) == 0);
    // Der naechste Druck zaehlt wieder normal.
    CHECK(hold(b, true, 200) == 0);
    CHECK(hold(b, false, 200) == 1);
  }
  {  // 5) suppress ohne gedrueckten Knopf bleibt wirkungslos.
    ButtonPress b; g_millis = 1000;
    b.suppress();
    CHECK(hold(b, true, 200) == 0);
    CHECK(hold(b, false, 200) == 1);
  }
  {  // 6) Zwei Druecke hintereinander: zwei Ereignisse (tippen, dann abbrechen).
    ButtonPress b; g_millis = 1000; int n = 0;
    n += hold(b, true, 150); n += hold(b, false, 150); n += hold(b, true, 150); n += hold(b, false, 150);
    CHECK(n == 2);
  }
  {  // 7) millis()-Ueberlauf waehrend eines Drucks.
    ButtonPress b; g_millis = 0xFFFFFF00u;
    CHECK(hold(b, true, 400) == 0);
    CHECK(hold(b, false, 200) == 1);
  }
  std::printf("button: 7 Faelle ok\n");
  return 0;
}
