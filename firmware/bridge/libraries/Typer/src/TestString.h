/*
  TestString.h — canonical Issue #1 umlaut/special-char test string.

  Mirrors firmware/test/umlaut-test/code.py (CircuitPython rig) so a NIDA/iPad
  screenshot can be compared row-by-row against the known reference. Categories
  are on separate lines so it is obvious which class of character fails where.

  SOURCE ENCODING GUARD: this file MUST be saved as UTF-8. In UTF-8, "ä" is the
  two bytes 0xC3 0xA4, so sizeof("ä") == 3 (incl. NUL). If an editor re-saves it
  as Latin-1, "ä" becomes one byte and the assert below fails the BUILD instead
  of silently shipping corrupted bytes.
*/
#pragma once
#include <Arduino.h>

static_assert(sizeof("ä") == 3, "TestString.h must be saved as UTF-8 (ä must encode to 2 bytes)");

namespace rq {

// Binding single-line test string from firmware/README.md (Akzeptanzkriterium #1).
static const char TEST_STRING[] =
    "ä ö ü Ä Ö Ü ß   € § % & / ( ) = ? ! \" ' @ \\ { } [ ] < > | ~ ^ ° µ   116117 112";

// Categorized lines (label words are ASCII so they stay readable even if the
// special chars on that line fail to type).
static const char* const TEST_LINES[] = {
    "Umlaute: ä ö ü Ä Ö Ü ß",
    "DE-Sonder: § ° ! \" $ % & / ( ) = ? + * # - _ . , ; :",
    "AltGr: @ € { } [ ] \\ ~ | µ",
    "Akzente: é è ê ç à â î ô û ñ á í ó ú",
    "Zahlen: 116117 112",
    "Ende.",
};
static const size_t TEST_LINES_COUNT = sizeof(TEST_LINES) / sizeof(TEST_LINES[0]);

}  // namespace rq
