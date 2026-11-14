// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
// Typer-Ersatz fuer den Host-Test: "tippt" in einen String statt ueber USB. Die Zerlegung in Zeichen
// entspricht typeNextUtf8 aus libraries/Typer/src/Typer.cpp.
#pragma once
#include <Arduino.h>

namespace rq {
extern std::string g_typed;

inline size_t typeNextUtf8(const char* utf8, bool* typed = nullptr) {
  if (typed) *typed = false;
  const uint8_t* start = (const uint8_t*)utf8;
  const uint8_t* p = start;
  if (!*p) return 0;
  uint8_t b = *p++;
  int extra;
  if (b < 0x80) extra = 0;
  else if ((b & 0xE0) == 0xC0) extra = 1;
  else if ((b & 0xF0) == 0xE0) extra = 2;
  else if ((b & 0xF8) == 0xF0) extra = 3;
  else return (size_t)(p - start);
  for (int i = 0; i < extra; i++) {
    if ((*p & 0xC0) != 0x80) return (size_t)(p - start);
    p++;
  }
  g_typed.append((const char*)start, (size_t)(p - start));
  if (typed) *typed = true;
  return (size_t)(p - start);
}
}  // namespace rq
