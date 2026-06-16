// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  Typer.cpp — UTF-8 -> German-layout USB-HID keystrokes.

  Routing per codepoint:
    1. ASCII (< 0x80)        -> Keyboard.write(): the bundled de_DE layout maps
       it, including the AltGr specials @ \ { } [ ] | ~. Two ASCII chars are
       dead keys on a German layout (^ and `) and the layout marks them 0x00;
       those are special-cased here as dead-key + space.
    2. Non-ASCII direct      -> WIN_DE_DIRECT: ä ö ü Ä Ö Ü ß € § ° µ etc., typed
       as keycode + modifier (the +136 offset sends a raw HID usage code; the
       same convention the bundled Keyboard_de_DE.h KEY_*_UMLAUT macros use).
    3. Dead-key accents      -> WIN_DE_DEAD: é è ê à â î ô û á í ó ú via a dead
       accent key (´ ` ^) followed by the base letter.
    4. Anything unmapped     -> a visible "[?]" marker (e.g. ç ñ, which a German
       layout cannot produce directly — exactly the data Issue #1 wants).

  OS modes: WIN_DE is fully implemented. MAC_DE / IOS currently ALIAS win_de so
  the user can capture "win_de behaviour on Mac/iPad" — the delta from that is
  what we use to build the real mac_de / ios tables later. The seam is the
  table-selection in tablesForMode().
*/
#include "Typer.h"
#include "TestString.h"
#include <Keyboard.h>

namespace rq {

// Modifier flags for our tables (not the same as the HID modifier bytes).
static const uint8_t M_NONE  = 0x00;
static const uint8_t M_SHIFT = 0x01;
static const uint8_t M_ALTGR = 0x02;

// HID usage codes for the German dead keys (right of P / right of Ü / left of 1).
static const uint8_t KC_ACUTE      = 0x2E;  // ´ (dead);  Shift -> ` (dead grave)
static const uint8_t KC_CIRCUMFLEX = 0x35;  // ^ (dead);  Shift -> °

struct Direct { uint32_t cp; uint8_t key; uint8_t mods; };
struct Dead   { uint32_t cp; uint8_t deadKey; uint8_t deadMods; char base; };

// --- win_de: non-ASCII characters reachable with one key (+ modifier) ---------
static const Direct WIN_DE_DIRECT[] = {
    {0x00E4, 0x34, M_NONE },  // ä
    {0x00F6, 0x33, M_NONE },  // ö
    {0x00FC, 0x2F, M_NONE },  // ü
    {0x00C4, 0x34, M_SHIFT},  // Ä
    {0x00D6, 0x33, M_SHIFT},  // Ö
    {0x00DC, 0x2F, M_SHIFT},  // Ü
    {0x00DF, 0x2D, M_NONE },  // ß
    {0x20AC, 0x08, M_ALTGR},  // € (AltGr+E)
    {0x00A7, 0x20, M_SHIFT},  // § (Shift+3)
    {0x00B0, 0x35, M_SHIFT},  // ° (Shift+^)
    {0x00B5, 0x10, M_ALTGR},  // µ (AltGr+M)
    {0x00B4, 0x2E, M_NONE },  // ´ standalone acute (dead; host emits on next key)
};
static const size_t WIN_DE_DIRECT_N = sizeof(WIN_DE_DIRECT) / sizeof(WIN_DE_DIRECT[0]);

// --- win_de: accented letters via dead key + base letter ----------------------
static const Dead WIN_DE_DEAD[] = {
    {0x00E9, KC_ACUTE,      M_NONE,  'e'},  // é
    {0x00E8, KC_ACUTE,      M_SHIFT, 'e'},  // è  (Shift+´ = grave)
    {0x00EA, KC_CIRCUMFLEX, M_NONE,  'e'},  // ê
    {0x00E0, KC_ACUTE,      M_SHIFT, 'a'},  // à
    {0x00E2, KC_CIRCUMFLEX, M_NONE,  'a'},  // â
    {0x00EE, KC_CIRCUMFLEX, M_NONE,  'i'},  // î
    {0x00F4, KC_CIRCUMFLEX, M_NONE,  'o'},  // ô
    {0x00FB, KC_CIRCUMFLEX, M_NONE,  'u'},  // û
    {0x00E1, KC_ACUTE,      M_NONE,  'a'},  // á
    {0x00ED, KC_ACUTE,      M_NONE,  'i'},  // í
    {0x00F3, KC_ACUTE,      M_NONE,  'o'},  // ó
    {0x00FA, KC_ACUTE,      M_NONE,  'u'},  // ú
    // ç (cedilla) and ñ (tilde) are NOT reachable on a German layout -> [?].
};
static const size_t WIN_DE_DEAD_N = sizeof(WIN_DE_DEAD) / sizeof(WIN_DE_DEAD[0]);

// --- ios (Apple-Deutsch): override ASCII chars whose Option-layer differs from
//     Windows-AltGr. Confirmed on iPad (NIDA test photo): { } | via Opt+8/9/7,
//     key 0x35 = < / >. The rest are Apple-standard, verified by the next iPad
//     capture. `°` and `^` are NOT here yet (their key moved off 0x35) — the
//     Slice-A probe locates them; until then they fall through to win_de. ----
static const Direct IOS_DIRECT[] = {
    {0x0040, 0x0f, M_ALTGR        },  // @  Option+L         (Apple-std, verify)
    {0x005B, 0x22, M_ALTGR        },  // [  Option+5         (Apple-std, verify)
    {0x005D, 0x23, M_ALTGR        },  // ]  Option+6         (Apple-std, verify)
    {0x007B, 0x25, M_ALTGR        },  // {  Option+8         (confirmed)
    {0x007D, 0x26, M_ALTGR        },  // }  Option+9         (confirmed)
    {0x007C, 0x24, M_ALTGR        },  // |  Option+7         (confirmed)
    {0x005C, 0x24, M_ALTGR|M_SHIFT},  // \  Shift+Option+7   (Apple-std, verify)
    {0x003C, 0x35, M_NONE         },  // <  key 0x35         (confirmed)
    {0x003E, 0x35, M_SHIFT        },  // >  Shift+0x35       (confirmed)
    {0x00B0, 0x64, M_SHIFT        },  // °  Shift+0x64 = echtes Grad (0x2e gab ˚ U+02DA)
};
static const size_t IOS_DIRECT_N = sizeof(IOS_DIRECT) / sizeof(IOS_DIRECT[0]);

static const Dead IOS_DEAD[] = {
    {0x007E, 0x11, M_ALTGR, ' '},  // ~  Option+N (dead) + space  (Apple-std, verify)
    {0x005E, 0x64, M_NONE,  ' '},  // ^  circumflex dead (0x64) + space   (probe k64)
    {0x00EA, 0x64, M_NONE,  'e'},  // ê  circumflex + e
    {0x00E2, 0x64, M_NONE,  'a'},  // â
    {0x00EE, 0x64, M_NONE,  'i'},  // î
    {0x00F4, 0x64, M_NONE,  'o'},  // ô
    {0x00FB, 0x64, M_NONE,  'u'},  // û
};
static const size_t IOS_DEAD_N = sizeof(IOS_DEAD) / sizeof(IOS_DEAD[0]);

static OsMode g_mode = OsMode::WIN_DE;

// Seam for per-OS tables. mac_de / ios alias win_de until their tables exist.
static void tablesForMode(OsMode /*mode*/,
                          const Direct** direct, size_t* directN,
                          const Dead** dead, size_t* deadN) {
  *direct = WIN_DE_DIRECT; *directN = WIN_DE_DIRECT_N;
  *dead   = WIN_DE_DEAD;   *deadN   = WIN_DE_DEAD_N;
}

// Press optional modifiers, then a raw HID usage code, then release everything.
static void rawCombo(uint8_t keycode, uint8_t mods) {
  if (mods & M_SHIFT) Keyboard.press(KEY_LEFT_SHIFT);
  if (mods & M_ALTGR) Keyboard.press(KEY_RIGHT_ALT);
  Keyboard.press((uint8_t)(136 + keycode));  // +136 => raw keycode, not ASCII map
  Keyboard.releaseAll();
}

static void typeMarker() {
  Keyboard.write('[');
  Keyboard.write('?');
  Keyboard.write(']');
}

void typerBegin(OsMode mode) {
  g_mode = mode;
  Keyboard.begin(KeyboardLayout_de_DE);
}

void typerSetMode(OsMode mode) { g_mode = mode; }
OsMode typerMode() { return g_mode; }

bool typeCodepoint(uint32_t cp) {
  const Direct* direct; size_t directN;
  const Dead* dead; size_t deadN;
  tablesForMode(g_mode, &direct, &directN, &dead, &deadN);

  // ios: chars whose Apple Option-layer differs from win_de AltGr are remapped
  // here first; everything else falls through to the shared win_de logic below.
  if (g_mode == OsMode::IOS) {
    for (size_t i = 0; i < IOS_DIRECT_N; i++) {
      if (IOS_DIRECT[i].cp == cp) { rawCombo(IOS_DIRECT[i].key, IOS_DIRECT[i].mods); return true; }
    }
    for (size_t i = 0; i < IOS_DEAD_N; i++) {
      if (IOS_DEAD[i].cp == cp) {
        rawCombo(IOS_DEAD[i].deadKey, IOS_DEAD[i].deadMods);
        Keyboard.write((uint8_t)IOS_DEAD[i].base);
        return true;
      }
    }
  }

  if (cp < 0x80) {
    // The two German dead keys are 0x00 in the layout; produce a literal glyph
    // with dead-key + space.
    if (cp == 0x5E) { rawCombo(KC_CIRCUMFLEX, M_NONE);  Keyboard.write(' '); return true; }  // ^
    if (cp == 0x60) { rawCombo(KC_ACUTE,      M_SHIFT); Keyboard.write(' '); return true; }  // `
    Keyboard.write((uint8_t)cp);
    return true;
  }

  for (size_t i = 0; i < directN; i++) {
    if (direct[i].cp == cp) { rawCombo(direct[i].key, direct[i].mods); return true; }
  }
  for (size_t i = 0; i < deadN; i++) {
    if (dead[i].cp == cp) {
      rawCombo(dead[i].deadKey, dead[i].deadMods);
      Keyboard.write((uint8_t)dead[i].base);
      return true;
    }
  }

  typeMarker();
  return false;
}

void typeRawKey(uint8_t hidKeycode, bool shift, bool altgr) {
  uint8_t mods = (uint8_t)((shift ? M_SHIFT : 0) | (altgr ? M_ALTGR : 0));
  rawCombo(hidKeycode, mods);
}

void typeUtf8(const char* utf8, uint16_t perCharDelayMs) {
  const uint8_t* p = (const uint8_t*)utf8;
  while (*p) {
    uint8_t b = *p++;
    uint32_t cp;
    int extra;
    if (b < 0x80)            { cp = b;          extra = 0; }
    else if ((b & 0xE0) == 0xC0) { cp = b & 0x1F; extra = 1; }
    else if ((b & 0xF0) == 0xE0) { cp = b & 0x0F; extra = 2; }
    else if ((b & 0xF8) == 0xF0) { cp = b & 0x07; extra = 3; }
    else continue;  // invalid lead byte — skip

    bool ok = true;
    for (int i = 0; i < extra; i++) {
      if ((*p & 0xC0) != 0x80) { ok = false; break; }  // truncated sequence
      cp = (cp << 6) | (*p++ & 0x3F);
    }
    if (!ok) continue;

    typeCodepoint(cp);
    if (perCharDelayMs) delay(perCharDelayMs);
  }
}

}  // namespace rq
