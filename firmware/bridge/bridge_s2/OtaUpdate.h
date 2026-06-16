// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  OtaUpdate.h — OTA-Update-Logik der S2-Bridge (Issue #130).

  Ablauf (docs/pico-api.md): POST /ota/begin {size, sha256, sig} oeffnet eine
  Session und legt /update.bin auf LittleFS an; POST /ota/chunk {offset,
  dataB64} schreibt strikt sequenziell; POST /ota/commit verifiziert KOMPLETT
  vor dem Anwenden (SHA-256 streamend ueber die Datei, dann Ed25519 ueber den
  32-Byte-Digest gegen OTA_PUBLIC_KEY) und uebergibt erst danach an das
  eingebaute arduino-pico-OTA (PicoOTA -> Reboot -> Bootloader flasht).

  Signatur-Modell: Der Maintainer signiert den SHA-256-Digest des Binaries
  lokal (scripts/ota/sign.mjs, Ed25519); der Public Key steckt in
  OtaPublicKey.h (von scripts/ota/keygen.mjs generiert). Unsignierte oder
  manipulierte Images werden VOR dem Flashen abgelehnt — die alte Firmware
  bleibt aktiv. Kein A/B-Rollback: Fallback ist der manuelle BOOTSEL-Flash.

  Krypto: rweather/arduino-libs "Crypto" (MIT) — SHA256 (streaming) +
  Ed25519::verify. Verify ueber den Digest, NICHT ueber das ganze Binary
  (rweather braucht die Message im RAM; 32 Bytes statt ~400 KB).

  Voraussetzung: Flash-Split mit LittleFS-Partition >= Binary-Groesse,
  Build-FQBN rp2040:rp2040:rpipico2w:flash=4194304_1048576 (1 MB FS).
*/
#pragma once
#include <Arduino.h>
#include <LittleFS.h>
#include <PicoOTA.h>
#include <SHA256.h>
#include <Ed25519.h>
#include "OtaPublicKey.h"

namespace rq {

static const uint32_t OTA_MAX_SIZE  = 983040;        // 960 KB Hard-Cap (< 1 MB FS)
static const uint32_t OTA_CHUNK_MAX = 8192;          // Bytes roh pro /ota/chunk
static const char*    OTA_FILE      = "/update.bin";

enum class OtaResult {
  OK,
  INVALID,            // unplausible Parameter (sha256/sig-Format)
  SIZE_INVALID,       // size == 0 oder > OTA_MAX_SIZE
  NO_SPACE,           // LittleFS-Freiplatz reicht nicht
  FS_ERROR,           // Datei nicht anlegbar/lesbar
  NO_SESSION,         // chunk/commit ohne offene Session
  BAD_OFFSET,         // offset != bisher empfangene Bytes
  BAD_BASE64,         // dataB64 nicht dekodierbar
  CHUNK_TOO_LARGE,    // dekodierter Chunk > OTA_CHUNK_MAX
  SIZE_OVERFLOW,      // empfangene Bytes wuerden size ueberschreiten
  FS_WRITE_FAILED,    // LittleFS-Schreibfehler
  SIZE_MISMATCH,      // commit: received != size
  SHA256_MISMATCH,    // commit: Digest passt nicht zur Ansage
  SIG_INVALID,        // commit: Ed25519-Signatur ungueltig
  APPLY_FAILED,       // PicoOTA-Uebergabe fehlgeschlagen
};

struct OtaSession {
  bool     active   = false;
  uint32_t size     = 0;
  uint32_t received = 0;
  uint8_t  sha256[32];
  uint8_t  sig[64];
  File     file;
};

static OtaSession otaSession;

// --- Helfer ----------------------------------------------------------------------

// Hex-String fester Laenge -> Bytes; false bei falscher Laenge/Nicht-Hex.
inline bool hexToBytes(const String& hex, uint8_t* out, size_t outLen) {
  if (hex.length() != outLen * 2) return false;
  for (size_t i = 0; i < outLen; i++) {
    int hi = hexVal(hex[2 * i]);      // hexVal aus JsonMini.h
    int lo = hexVal(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
  return true;
}

inline int b64Val(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

/*
  Base64 -> Bytes (RFC 4648, mit '='-Padding, ohne Zeilenumbrueche).
  Rueckgabe: dekodierte Laenge oder -1 (ungueltiges Zeichen/Format/outMax).
*/
inline int b64Decode(const String& in, uint8_t* out, size_t outMax) {
  const size_t n = in.length();
  if (n % 4 != 0) return -1;
  size_t len = 0;
  for (size_t i = 0; i < n; i += 4) {
    int v[4];
    int pad = 0;
    for (int k = 0; k < 4; k++) {
      char c = in[i + k];
      if (c == '=') {
        // Padding nur am Ende der Eingabe und nur in den letzten 2 Positionen.
        if (i + 4 != n || k < 2) return -1;
        v[k] = 0;
        pad++;
      } else {
        if (pad) return -1;          // Zeichen nach '=' -> ungueltig
        v[k] = b64Val(c);
        if (v[k] < 0) return -1;
      }
    }
    const uint32_t triple = ((uint32_t)v[0] << 18) | ((uint32_t)v[1] << 12) |
                            ((uint32_t)v[2] << 6) | (uint32_t)v[3];
    const int bytes = 3 - pad;
    if (len + (size_t)bytes > outMax) return -1;
    out[len++] = (uint8_t)(triple >> 16);
    if (bytes > 1) out[len++] = (uint8_t)(triple >> 8);
    if (bytes > 2) out[len++] = (uint8_t)triple;
  }
  return (int)len;
}

// Session schliessen und Staging-Datei entfernen (Fehlerpfad/Neustart).
inline void otaAbort() {
  if (otaSession.file) otaSession.file.close();
  otaSession.active = false;
  otaSession.received = 0;
  LittleFS.remove(OTA_FILE);
}

// --- Endpoint-Logik ----------------------------------------------------------------

// setup(): LittleFS mounten und verwaiste Staging-Datei wegputzen.
inline bool otaSetup() {
  if (!LittleFS.begin()) return false;
  LittleFS.remove(OTA_FILE);
  return true;
}

// POST /ota/begin — Parameter pruefen, Session oeffnen (ersetzt jede alte).
inline OtaResult otaBegin(uint32_t size, const String& sha256Hex, const String& sigB64) {
  if (otaSession.active) otaAbort();   // Alt-Session implizit verwerfen

  if (size == 0 || size > OTA_MAX_SIZE) return OtaResult::SIZE_INVALID;
  if (!hexToBytes(sha256Hex, otaSession.sha256, 32)) return OtaResult::INVALID;
  if (b64Decode(sigB64, otaSession.sig, sizeof(otaSession.sig)) != 64) return OtaResult::INVALID;

  FSInfo info;
  if (!LittleFS.info(info)) return OtaResult::FS_ERROR;
  if (info.totalBytes - info.usedBytes < size) return OtaResult::NO_SPACE;

  otaSession.file = LittleFS.open(OTA_FILE, "w");
  if (!otaSession.file) return OtaResult::FS_ERROR;

  otaSession.size = size;
  otaSession.received = 0;
  otaSession.active = true;
  return OtaResult::OK;
}

// POST /ota/chunk — strikt sequenziell schreiben; received zaehlt mit.
inline OtaResult otaChunk(uint32_t offset, const String& dataB64, uint32_t& receivedOut) {
  if (!otaSession.active) return OtaResult::NO_SESSION;
  if (offset != otaSession.received) return OtaResult::BAD_OFFSET;

  // dekodierte Maximalgroesse vorab pruefen (4 B64-Zeichen -> 3 Bytes);
  // Padding kann bis zu 2 Bytes abziehen, daher Puffer mit +2 Reserve.
  if ((dataB64.length() / 4) * 3 > OTA_CHUNK_MAX + 2) return OtaResult::CHUNK_TOO_LARGE;

  static uint8_t buf[OTA_CHUNK_MAX + 2];
  const int len = b64Decode(dataB64, buf, sizeof(buf));
  if (len <= 0) return OtaResult::BAD_BASE64;
  if ((uint32_t)len > OTA_CHUNK_MAX) return OtaResult::CHUNK_TOO_LARGE;
  if (otaSession.received + (uint32_t)len > otaSession.size) return OtaResult::SIZE_OVERFLOW;

  if (otaSession.file.write(buf, (size_t)len) != (size_t)len) {
    otaAbort();
    return OtaResult::FS_WRITE_FAILED;
  }
  otaSession.received += (uint32_t)len;
  receivedOut = otaSession.received;
  return OtaResult::OK;
}

/*
  POST /ota/commit — KOMPLETTE Verifikation vor dem Anwenden:
  1) received == size, 2) SHA-256 streamend ueber /update.bin == angekuendigt,
  3) Ed25519::verify(sig, OTA_PUBLIC_KEY, digest, 32). Erst dann PicoOTA.
  Bei 2)/3) wird die Session verworfen und die Datei geloescht.
*/
inline OtaResult otaCommit() {
  if (!otaSession.active) return OtaResult::NO_SESSION;
  if (otaSession.received != otaSession.size) return OtaResult::SIZE_MISMATCH;

  otaSession.file.close();

  File f = LittleFS.open(OTA_FILE, "r");
  if (!f) { otaAbort(); return OtaResult::FS_ERROR; }

  SHA256 sha;
  sha.reset();
  static uint8_t buf[4096];
  while (true) {
    const int n = f.read(buf, sizeof(buf));
    if (n < 0) { f.close(); otaAbort(); return OtaResult::FS_ERROR; }
    if (n == 0) break;
    sha.update(buf, (size_t)n);
  }
  f.close();

  uint8_t digest[32];
  sha.finalize(digest, sizeof(digest));
  if (memcmp(digest, otaSession.sha256, 32) != 0) {
    otaAbort();
    return OtaResult::SHA256_MISMATCH;
  }
  if (!Ed25519::verify(otaSession.sig, OTA_PUBLIC_KEY, digest, sizeof(digest))) {
    otaAbort();
    return OtaResult::SIG_INVALID;
  }

  // Uebergabe an das eingebaute OTA: Kommandoblock schreiben; der Bootloader
  // flasht /update.bin beim naechsten Boot. (Auf Hardware verifiziert: Pfad-
  // Konvention von picoOTA.addFile entspricht dem LittleFS-Pfad.)
  picoOTA.begin();
  if (!picoOTA.addFile(OTA_FILE)) { otaAbort(); return OtaResult::APPLY_FAILED; }
  if (!picoOTA.commit())          { otaAbort(); return OtaResult::APPLY_FAILED; }

  otaSession.active = false;       // Datei NICHT loeschen — der Bootloader braucht sie
  return OtaResult::OK;
}

}  // namespace rq
