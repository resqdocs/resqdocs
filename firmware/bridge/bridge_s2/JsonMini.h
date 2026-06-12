/*
  JsonMini.h — minimaler JSON-String-Feld-Extraktor fuer die S2-Bridge.

  Bewusst KEINE externe JSON-Lib (ArduinoJson): die Bridge braucht aus flachen
  Objekten ({ "text": "...", "os": "..." } bzw. { "ssidId": "..." }) nur
  String-Felder. Dieser Extraktor findet `"key"` auf Top-Level-Ebene und
  dekodiert den String-Wert mit allen Standard-JSON-Escapes:
  \" \\ \/ \b \f \n \r \t und \uXXXX (inkl. Surrogate-Paare -> UTF-8).

  Kein Verschachtelungs-Parser, kein Schema — fuer den S2-Vertrag ausreichend
  und Null-Dependency (konsistent zum bisherigen Firmware-Ansatz).
*/
#pragma once
#include <Arduino.h>

namespace rq {

// Haengt einen Codepoint als UTF-8 an `out` an.
inline void appendUtf8(String& out, uint32_t cp) {
  if (cp < 0x80) {
    out += (char)cp;
  } else if (cp < 0x800) {
    out += (char)(0xC0 | (cp >> 6));
    out += (char)(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    out += (char)(0xE0 | (cp >> 12));
    out += (char)(0x80 | ((cp >> 6) & 0x3F));
    out += (char)(0x80 | (cp & 0x3F));
  } else {
    out += (char)(0xF0 | (cp >> 18));
    out += (char)(0x80 | ((cp >> 12) & 0x3F));
    out += (char)(0x80 | ((cp >> 6) & 0x3F));
    out += (char)(0x80 | (cp & 0x3F));
  }
}

inline int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// Liest 4 Hex-Ziffern ab body[i]; -1 bei Fehler.
inline long readHex4(const String& body, size_t i) {
  if (i + 4 > body.length()) return -1;
  long v = 0;
  for (int k = 0; k < 4; k++) {
    int h = hexVal(body[i + k]);
    if (h < 0) return -1;
    v = (v << 4) | h;
  }
  return v;
}

/*
  Findet den Wert-Beginn des Top-Level-Feldes `key` (Position nach ':' und
  Whitespace); -1 wenn das Feld fehlt. Der Suchcursor ueberspringt String-
  Inhalte, sodass Vorkommen von "key" INNERHALB von Werten nicht matchen.
*/
inline int jsonValueStart(const String& body, const char* key) {
  const String needle = String("\"") + key + "\"";
  size_t i = 0;
  const size_t n = body.length();

  int keyStart = -1;
  bool inString = false;
  while (i < n) {
    char c = body[i];
    if (inString) {
      if (c == '\\') i++;            // Escape: naechstes Zeichen ueberspringen
      else if (c == '"') inString = false;
    } else if (c == '"') {
      // Beginnt hier der gesuchte Schluessel?
      if (body.startsWith(needle, i)) {
        // dahinter muss (nach Whitespace) ein ':' folgen
        size_t j = i + needle.length();
        while (j < n && (body[j] == ' ' || body[j] == '\t' || body[j] == '\n' || body[j] == '\r')) j++;
        if (j < n && body[j] == ':') { keyStart = (int)j + 1; break; }
      }
      inString = true;               // sonst: normaler String beginnt
    }
    i++;
  }
  if (keyStart < 0) return -1;

  // Whitespace vor dem Wert ueberspringen.
  size_t p = (size_t)keyStart;
  while (p < n && (body[p] == ' ' || body[p] == '\t' || body[p] == '\n' || body[p] == '\r')) p++;
  return p < n ? (int)p : -1;
}

/*
  Extrahiert das String-Feld `key` aus einem flachen JSON-Objekt.
  Rueckgabe true + dekodierter Wert in `out`; false wenn das Feld fehlt oder
  der Wert kein gueltiger JSON-String ist.
*/
inline bool jsonExtractString(const String& body, const char* key, String& out) {
  const size_t n = body.length();
  int start = jsonValueStart(body, key);
  if (start < 0 || body[(size_t)start] != '"') return false;
  size_t p = (size_t)start + 1;

  // 3) String dekodieren bis zum schliessenden '"'.
  out = "";
  while (p < n) {
    char c = body[p];
    if (c == '"') return true;       // fertig
    if (c == '\\') {
      p++;
      if (p >= n) return false;
      char e = body[p];
      switch (e) {
        case '"':  out += '"';  break;
        case '\\': out += '\\'; break;
        case '/':  out += '/';  break;
        case 'b':  out += '\b'; break;
        case 'f':  out += '\f'; break;
        case 'n':  out += '\n'; break;
        case 'r':  out += '\r'; break;
        case 't':  out += '\t'; break;
        case 'u': {
          long u = readHex4(body, p + 1);
          if (u < 0) return false;
          p += 4;
          uint32_t cp = (uint32_t)u;
          if (cp >= 0xD800 && cp <= 0xDBFF) {       // High-Surrogate -> Paar lesen
            if (p + 2 < n && body[p + 1] == '\\' && body[p + 2] == 'u') {
              long lo = readHex4(body, p + 3);
              if (lo >= 0xDC00 && lo <= 0xDFFF) {
                cp = 0x10000 + ((cp - 0xD800) << 10) + ((uint32_t)lo - 0xDC00);
                p += 6;
              } else return false;
            } else return false;
          }
          appendUtf8(out, cp);
          break;
        }
        default: return false;       // unbekanntes Escape -> ungueltig
      }
    } else {
      out += c;                      // rohe UTF-8-Bytes 1:1 uebernehmen
    }
    p++;
  }
  return false;                      // String nicht terminiert
}

/*
  Extrahiert das vorzeichenlose Ganzzahl-Feld `key` (fuer OTA: size/offset).
  Rueckgabe true + Wert in `out`; false wenn das Feld fehlt, keine reine
  Ziffernfolge ist oder uint32 ueberlaeuft. Kein Float/Exponent/Vorzeichen.
*/
inline bool jsonExtractUInt(const String& body, const char* key, uint32_t& out) {
  const size_t n = body.length();
  int start = jsonValueStart(body, key);
  if (start < 0) return false;
  size_t p = (size_t)start;
  if (body[p] < '0' || body[p] > '9') return false;
  uint64_t v = 0;
  while (p < n && body[p] >= '0' && body[p] <= '9') {
    v = v * 10 + (uint64_t)(body[p] - '0');
    if (v > 0xFFFFFFFFull) return false;   // uint32-Ueberlauf
    p++;
  }
  // dahinter darf nur Whitespace, ',' oder '}' folgen (kein "12abc"/Float).
  if (p < n) {
    char c = body[p];
    if (c != ' ' && c != '\t' && c != '\n' && c != '\r' && c != ',' && c != '}') return false;
  }
  out = (uint32_t)v;
  return true;
}

// Zaehlt Unicode-Zeichen (Codepoints) eines UTF-8-Strings (Nicht-Folgebytes).
inline uint32_t utf8Length(const String& s) {
  uint32_t count = 0;
  for (size_t i = 0; i < s.length(); i++) {
    if (((uint8_t)s[i] & 0xC0) != 0x80) count++;
  }
  return count;
}

}  // namespace rq
