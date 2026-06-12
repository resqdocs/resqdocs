/*
  ResQDocs — Slice B: live bridge. WLAN-AP + web form -> types received text
  via the SAME Typer module as Slice A (no typing logic duplicated here).

  Flow: phone joins the "ResQDocs-Bridge" AP, opens http://192.168.4.1/,
  composes text (umlauts/snippets), submits -> the bridge types the whole block
  as a USB-HID keyboard into the focused field on NIDA / iPad.

  Block-POST first (robust). A live char-by-char WebSocket path (/ws) is a later
  add-on; the block path stays the fallback.

  Build: arduino-pico, Pico 2 W, DEFAULT USB stack (the bundled Keyboard lib is
  incompatible with usbstack=tinyusb). USB-HID + WLAN coexistence on one RP2350
  is the #2 risk — bring WiFi up only AFTER the keyboard is initialised, and
  route web -> typer through a buffer drained in loop() (the seam that lets the
  typing move to core 1 / loop1() later if coexistence misbehaves).
*/
#include <Keyboard.h>
#include <Typer.h>
#include <WiFi.h>
#include <WebServer.h>
#include "WebForm.h"

using namespace rq;

static const char* AP_SSID = "ResQDocs-Bridge";
static const char* AP_PASS = "resqdocs2026";  // >=8 chars for WPA2

WebServer server(80);

// Web -> typer hand-off buffer (the decoupling seam). The web handler only
// fills this; loop() drains it so a long typeUtf8() never runs inside the
// request handler.
static String  pendingText;
static volatile bool hasPending = false;

static void applyOsArg() {
  if (!server.hasArg("os")) return;
  String o = server.arg("os");
  if (o == "win") typerSetMode(OsMode::WIN_DE);
  else if (o == "mac") typerSetMode(OsMode::MAC_DE);
  else if (o == "ios") typerSetMode(OsMode::IOS);
}

static void handleRoot() {
  server.send(200, "text/html; charset=utf-8", RESQ_FORM_HTML);
}

static void handleType() {
  applyOsArg();
  pendingText = server.arg("text");  // UTF-8 bytes, URL-decoded by the server
  hasPending = true;
  String body = "<!doctype html><meta charset=utf-8>"
                "<p>Getippt: " + String(pendingText.length()) +
                " Bytes (Modus " + osModeName(typerMode()) + ").</p>"
                "<a href=\"/\">&larr; zurück</a>";
  server.send(200, "text/html; charset=utf-8", body);
}

static void handleHealth() {
  server.send(200, "text/plain", "ok");
}

void setup() {
  Serial.begin(115200);

  // 1) USB-HID keyboard first, so HID is known-good before WiFi touches the bus.
  typerBegin(OsMode::WIN_DE);
  delay(1500);

  // 2) WLAN access point. Pin the IP explicitly (the core default is 192.168.4.1,
  //    confirmed on hardware) so the URL is deterministic and matches the docs.
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID, AP_PASS);

  // 3) Routes.
  server.on("/", HTTP_GET, handleRoot);
  server.on("/type", HTTP_POST, handleType);
  server.on("/health", HTTP_GET, handleHealth);
  server.begin();

  Serial.print("AP up: ");
  Serial.print(AP_SSID);
  Serial.print("  http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();

  if (hasPending) {
    hasPending = false;
    typeUtf8(pendingText.c_str());
  }
}
