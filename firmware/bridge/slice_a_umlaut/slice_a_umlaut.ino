/*
  ResQDocs — Slice A: USB-HID umlaut / special-char typer (no networking).

  Purpose: de-risk Issue #1 on real hardware. The Pico enumerates as a USB
  keyboard and types the canonical Issue #1 test string into whatever text field
  has focus on the target (NIDA / iPad / Win / macOS), so the user can see
  exactly which characters survive per target.

  Build: arduino-pico, DEFAULT USB stack (NOT usbstack=tinyusb — the bundled
  Keyboard library is incompatible with Adafruit TinyUSB). See sketch.yaml.

  Triggers (no extra wiring needed):
    1. Auto: types once, ~5 s after boot (time to focus the target field).
    2. Serial: any byte over USB-CDC re-types. 'w'/'m'/'i' switch the OS mode
       (win_de / mac_de / ios) and re-type — lets you test iPad/Mac without a
       recompile.
    3. BOOTSEL button: press to re-type.
*/
#include <Keyboard.h>
#include <Typer.h>
#include <TestString.h>

using namespace rq;

static OsMode mode = OsMode::WIN_DE;
static bool   typedOnce = false;

// Cycle order for the BOOTSEL button: win_de -> ios -> mac_de -> win_de.
// ios is one press away from the default so the iPad is quick to reach.
static OsMode nextMode(OsMode m) {
  switch (m) {
    case OsMode::WIN_DE: return OsMode::IOS;
    case OsMode::IOS:    return OsMode::MAC_DE;
    default:             return OsMode::WIN_DE;
  }
}

static void typeAll() {
  char header[64];
  snprintf(header, sizeof(header), "ResQDocs SliceA OS=%s lib=de_DE+ext", osModeName(mode));
  typeUtf8(header);
  typeUtf8("\n");
  for (size_t i = 0; i < TEST_LINES_COUNT; i++) {
    typeUtf8(TEST_LINES[i]);
    typeUtf8("\n");
  }
}

void setup() {
  Serial.begin(115200);
  typerBegin(mode);
}

void loop() {
  // 1) one automatic pass shortly after boot
  if (!typedOnce && millis() > 5000) {
    typeAll();
    typedOnce = true;
  }

  // 2) serial: mode switch and/or re-type
  if (Serial.available()) {
    int c = Serial.read();
    if (c == 'w') mode = OsMode::WIN_DE;
    else if (c == 'm') mode = OsMode::MAC_DE;
    else if (c == 'i') mode = OsMode::IOS;
    typerSetMode(mode);
    typeAll();
  }

  // 3) BOOTSEL button: cycle OS mode (win_de -> ios -> mac_de) and re-type.
  //    Lets you switch to ios on the iPad without a serial connection; the
  //    header line shows the active mode. Wait for release (debounce).
  if (BOOTSEL) {
    mode = nextMode(mode);
    typerSetMode(mode);
    typeAll();
    while (BOOTSEL) delay(10);
  }
}
