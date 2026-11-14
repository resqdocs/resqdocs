// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  TypeJob.h — der laufende Tipp-Auftrag der Bridge.

  Bis 0.3.4 tippte loop() einen Text am Stueck und beantwortete in dieser Zeit keine Anfragen.
  Jetzt tippt die Bridge ZEICHENWEISE: zwischen zwei Zeichen laeuft der Webserver weiter. Dadurch
  kann die App den Fortschritt abfragen und das Tippen anhalten, fortsetzen oder abbrechen. Getippt
  wird unveraendert ueber die Typer-Lib (derselbe Pfad wie bisher, nur ein Zeichen pro Aufruf).

  Das Tippen haengt NICHT an der Verbindung: ein angenommener Auftrag laeuft zu Ende, auch wenn das
  Handy das WLAN verlaesst.

  Datenschutz: der Text kann Patientendaten enthalten. Er liegt nur im RAM, wird nie geloggt oder
  gespeichert und beim Ende des Auftrags (fertig, abgebrochen, Pausen-Timeout) sofort geleert. Nach
  aussen gehen ausschliesslich Zahlen (Zeichen getippt/gesamt), nie Inhalt.
*/
#pragma once
#include <Arduino.h>
#include <Typer.h>

namespace rq {

enum class TypeState : uint8_t { IDLE, TYPING, PAUSED };
enum class TypeEnd : uint8_t { NONE, DONE, CANCELLED };

// Obergrenze fuer den noch nicht getippten Rest plus einen neuen Teil (Bytes). Ein Request traegt
// hoechstens 16384 Zeichen; so passen mehrere Teile eines langen Textes hintereinander in die
// Warteschlange, ohne dass der Speicher knapp wird.
static const size_t TYPE_QUEUE_MAX_BYTES = 65536;
// Ein angehaltener Auftrag wird nach dieser Zeit verworfen: der Text soll nicht unbegrenzt im RAM
// liegen, wenn das Handy nicht zurueckkommt.
static const uint32_t TYPE_PAUSE_TIMEOUT_MS = 5UL * 60UL * 1000UL;

struct TypeJob {
  String text;            // noch zu tippender Text (transient)
  size_t pos = 0;         // Byte-Offset des naechsten Zeichens in text
  uint32_t done = 0;      // getippte Zeichen dieses Auftrags
  uint32_t total = 0;     // Zeichen dieses Auftrags (waechst, wenn ein weiterer Teil angehaengt wird)
  uint16_t delayMs = 60;  // Pause nach jedem Zeichen
  uint32_t jobId = 0;     // zaehlt je NEUEM Auftrag hoch (angehaengte Teile behalten die Nummer)
  TypeState state = TypeState::IDLE;
  TypeEnd lastEnd = TypeEnd::NONE;  // wie der letzte Auftrag endete
  uint32_t nextAt = 0;    // millis(): fruehestens dann das naechste Zeichen
  uint32_t pausedAt = 0;  // millis() beim Anhalten

  bool active() const { return state != TypeState::IDLE; }

  void finish(TypeEnd how) {
    text = "";  // Inhalt nicht vorhalten
    pos = 0;
    if (how == TypeEnd::DONE) done = total;
    state = TypeState::IDLE;
    lastEnd = how;
  }

  // Nimmt einen Text an: neuer Auftrag, oder Anhaengen an den laufenden (lange Texte in Teilen).
  // false = kein Platz (Aufrufer antwortet 503 busy; die App versucht es spaeter erneut).
  bool accept(const String& add, uint32_t addChars, uint16_t delay) {
    const size_t rest = active() ? text.length() - pos : 0;
    if (rest + add.length() > TYPE_QUEUE_MAX_BYTES) return false;
    if (!active()) {
      text = add;
      if (text.length() != add.length()) { text = ""; return false; }  // kein Speicher
      pos = 0;
      done = 0;
      total = addChars;
      jobId++;
      lastEnd = TypeEnd::NONE;
      state = TypeState::TYPING;
      nextAt = millis();
    } else {
      String merged = text.substring(pos);
      const size_t want = merged.length() + add.length();
      merged += add;
      if (merged.length() != want) return false;  // kein Speicher: laufender Auftrag bleibt unberuehrt
      text = merged;
      pos = 0;
      total += addChars;
    }
    delayMs = delay;
    return true;
  }

  bool pause() {
    if (state != TypeState::TYPING) return state == TypeState::PAUSED;
    state = TypeState::PAUSED;
    pausedAt = millis();
    return true;
  }

  bool resume() {
    if (state != TypeState::PAUSED) return state == TypeState::TYPING;
    state = TypeState::TYPING;
    nextAt = millis();
    return true;
  }

  bool cancel() {
    if (!active()) return false;
    finish(TypeEnd::CANCELLED);
    return true;
  }

  // Aus loop(): tippt hoechstens EIN Zeichen und kehrt zurueck. Zwischen zwei Zeichen liegt genau
  // delayMs (wie vorher delay() nach jedem Zeichen), in dieser Zeit bedient loop() den Webserver.
  void tick() {
    if (state == TypeState::PAUSED) {
      if (millis() - pausedAt > TYPE_PAUSE_TIMEOUT_MS) finish(TypeEnd::CANCELLED);
      return;
    }
    if (state != TypeState::TYPING) return;
    if ((int32_t)(millis() - nextAt) < 0) return;

    const char* p = text.c_str() + pos;
    const bool countsAsChar = ((uint8_t)*p & 0xC0) != 0x80;  // wie utf8Length(): Nicht-Folgebyte
    bool typed = false;
    const size_t used = typeNextUtf8(p, &typed);
    if (used == 0) { finish(TypeEnd::DONE); return; }
    pos += used;
    if (countsAsChar && done < total) done++;
    if (pos >= text.length()) { finish(TypeEnd::DONE); return; }
    if (typed) nextAt = millis() + delayMs;
  }

  // Nur Zahlen und Zustand - kein Inhalt.
  String json() const {
    const char* st = state == TypeState::TYPING ? "typing" : (state == TypeState::PAUSED ? "paused" : "idle");
    const char* le = lastEnd == TypeEnd::DONE ? "done" : (lastEnd == TypeEnd::CANCELLED ? "cancelled" : "none");
    return String("{\"state\":\"") + st + "\",\"done\":" + done + ",\"total\":" + total +
           ",\"delayMs\":" + delayMs + ",\"jobId\":" + jobId + ",\"lastEnd\":\"" + le + "\"}";
  }
};

}  // namespace rq
