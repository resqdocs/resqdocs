// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
// Minimaler Arduino-Ersatz fuer den Host-Test von TypeJob.h (nur was TypeJob braucht).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>

extern uint32_t g_millis;
inline uint32_t millis() { return g_millis; }

class String {
 public:
  String() {}
  String(const char* c) : s_(c ? c : "") {}
  String(const std::string& s) : s_(s) {}
  size_t length() const { return s_.size(); }
  const char* c_str() const { return s_.c_str(); }
  String substring(size_t from) const { return String(from < s_.size() ? s_.substr(from) : std::string()); }
  String& operator+=(const String& o) { s_ += o.s_; return *this; }
  String operator+(const String& o) const { return String(s_ + o.s_); }
  String operator+(const char* c) const { return String(s_ + c); }
  String operator+(unsigned long n) const { return String(s_ + std::to_string(n)); }
  String operator+(unsigned int n) const { return String(s_ + std::to_string(n)); }
  String operator+(unsigned short n) const { return String(s_ + std::to_string(n)); }
  const std::string& str() const { return s_; }

 private:
  std::string s_;
};
