// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 The ResQDocs project contributors
/*
  ResQDocs — S2-Bridge: die produktive Bridge-Firmware nach dem
  S2-API-Vertrag (docs/pico-api.md). Ersetzt das Slice-B-HTML-Formular durch
  eine reine JSON-HTTP-API; getippt wird weiter AUSSCHLIESSLICH ueber die
  geteilte Typer-Lib (hardware-verifizierter Pfad, Slice A/B bleiben als Rigs).

    GET  /health  -> 200 "ok"                                   (text/plain)
    GET  /status  -> 200 { name, fwVersion, apiVersion, ready, defaultOs,
                           otaSupported, typing }
    POST /type    { text, os?, delayMs? } -> 200 { typed } | 400 { error } | 503 { error:"busy" }
                                             (Limit 16384 je Request; laeuft ein Auftrag, wird angehaengt)
    GET  /type/status  -> 200 { state, done, total, delayMs, jobId, lastEnd }   (nur Zahlen)
    POST /type/pause | /type/resume | /type/cancel -> 200 { ...wie /type/status } | 409 { error:"no_job" }
    GET  /stored       -> 200 { present, name, chars, os, delayMs, savedAt, buttonHeld }  (kein Inhalt)
    GET  /stored/text  -> 200 text/plain (der abgelegte Text) | 403 { error:"button_required" } | 404
    POST /stored       { text, name?, os?, delayMs?, savedAt? } -> 200 { ok, chars } | 403 { error:"button_required" }
    POST /stored/clear {} -> 200 { ok } | 403 { error:"button_required" }
    POST /config  { ssidId }     -> 200 { ok, restartRequired } | 400 { error }
    POST /ota/begin  { size, sha256, sig } -> 200 { ok, chunkMax } | Fehler
    POST /ota/chunk  { offset, dataB64 }   -> 200 { received } | Fehler
    POST /ota/commit {}                    -> 200 { ok, rebooting } | Fehler

  SSID: "ResQDocs-<id>"; Default-<id> = 6 Hex aus der Chip-ID (eindeutig ohne
  Setup), ueberschreibbar via POST /config ODER Serial (Recovery: `id NEUEID`),
  persistiert in EEPROM (ConfigStore.h). Passwort fix/oeffentlich (S2: die <id>
  dient der Unterscheidung, nicht dem Zugriffsschutz). Kein Auth auf
  /type//config (S2); OTA ist signaturpflichtig (Ed25519, OtaUpdate.h):
  nur vom Maintainer signierte Firmware wird angewendet.

  Datenschutz (S2/S3): /type-Text kann Patientendaten enthalten -> nur im Body,
  wird NICHT geloggt, NICHT gespeichert; reine transiente Durchleitung zum Typer.
  Getippt wird zeichenweise (TypeJob.h): der Fortschritt ist abfragbar (nur Zahlen), das Tippen
  laeuft aber ohne Verbindung zu Ende.

  Knopf (BOOTSEL, ab 0.5.0): ein kurzer Druck tippt die abgelegte Vorlage (StoredTemplate.h) ohne
  Handy; ein Druck waehrend des Tippens bricht ab. Abgelegt wird nur Vorlagentext ohne Patientendaten.
  Ablegen, Entfernen UND Auslesen gehen nur mit gedruecktem Knopf.

  CORS: permissive Header, damit der Web-Dev-Browser (Vite) testen kann; die
  native App (CapacitorHttp) braucht sie nicht.

  Build: arduino-pico, Pico 2 W mit Flash-Split fuer die OTA-Staging-Partition:
  FQBN rp2040:rp2040:rpipico2w:flash=4194304_1048576 (4 MB, davon 1 MB
  LittleFS), DEFAULT USB-Stack (NICHT usbstack=tinyusb). Zusaetzlich noetig:
  arduino-cli lib install Crypto (rweather, Ed25519/SHA256). USB-HID zuerst,
  WLAN danach (Koexistenz-Seam wie Slice B: Web -> Puffer -> loop() tippt).
*/
#include <Keyboard.h>
#include <Typer.h>
#include <WiFi.h>
#include <WebServer.h>
#include "ConfigStore.h"
#include "JsonMini.h"
#include "OtaUpdate.h"
#include "TypeJob.h"
#include "ButtonPress.h"
#include "StoredTemplate.h"
#include "StoredGuard.h"

using namespace rq;

static const char* FW_VERSION  = "0.5.1";  // 0.5.1: Knopf-Text wird vor dem Speichern und Tippen geprüft
static const char* API_VERSION = "0.3.0";  // 0.3.0: abgelegte Vorlage + Knopf (additiv); 0.2.0: Tipp-Fortschritt
static const char* AP_PREFIX   = "ResQDocs-";
static const char* AP_PASS     = "resqdocs2026";  // fix/oeffentlich (S2)
static const uint32_t TYPE_MAX_CHARS = 16384;     // S2: pro Request; App chunkt

WebServer server(80);

static String ssidId;            // aktuelle <id> (EEPROM bzw. Chip-Default)
static bool   ready = false;     // USB-HID initialisiert

// Web -> Typer (Koexistenz-Seam): Handler nimmt an, loop() tippt zeichenweise (TypeJob.h).
static TypeJob typeJob;
// Knopf + abgelegte Vorlage (Angaben im RAM, Text bleibt im Dateisystem).
static ButtonPress button;
static StoredInfo storedInfo;
static uint32_t lastButtonPoll = 0;
static const uint32_t BUTTON_POLL_MS = 25;  // BOOTSEL lesen sperrt kurz die Interrupts -> nicht in jeder Runde
static bool restartAp = false;   // /config: AP nach der Antwort neu starten
static bool otaReboot = false;   // /ota/commit: Reboot nach der Antwort
static bool otaAvailable = false;  // LittleFS gemountet (Flash-Split vorhanden)

static String fullSsid() { return String(AP_PREFIX) + ssidId; }

static void startAp() {
  // AP-Gateway fest auf 10.10.10.1 (/24). Der Pico macht ein eigenes WLAN auf,
  // das Handy ist darin isoliert — Subnetz frei waehlbar, hier bewusst distinkt.
  // WICHTIG: mode(WIFI_AP) MUSS vor softAPConfig() stehen — der Core
  // speichert _apIP nur im AP-Modus (WiFiClass.h:143), sonst landet die IP im
  // Station-Pfad und beginAP() nutzt den Default 192.168.4.1.
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(IPAddress(10, 10, 10, 1), IPAddress(10, 10, 10, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(fullSsid().c_str(), AP_PASS);
}

// --- HTTP-Helfer ---------------------------------------------------------------

static void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void sendJson(int code, const String& json) {
  addCors();
  server.send(code, "application/json", json);
}

static void handleOptions() {  // CORS-Preflight (Browser-POST mit JSON)
  addCors();
  server.send(204, "text/plain", "");
}

// --- Endpunkte (S2) -------------------------------------------------------------

static void handleHealth() {
  addCors();
  server.send(200, "text/plain", "ok");
}

static void handleStatus() {
  String json = String("{\"name\":\"") + fullSsid() +
                "\",\"fwVersion\":\"" + FW_VERSION +
                "\",\"apiVersion\":\"" + API_VERSION +
                "\",\"ready\":" + (ready ? "true" : "false") +
                ",\"defaultOs\":\"win_de\",\"otaSupported\":" +
                (otaAvailable ? "true" : "false") +
                ",\"typing\":" + typeJob.json() + "}";
  sendJson(200, json);
}

static OsMode osFromString(const String& os) {
  if (os == "mac_de") return OsMode::MAC_DE;
  if (os == "ios")    return OsMode::IOS;
  return OsMode::WIN_DE;  // S2-Fallback
}

static void handleType() {
  const String body = server.arg("plain");
  String text;
  if (!jsonExtractString(body, "text", text)) {
    sendJson(400, "{\"error\":\"invalid_body\"}");
    return;
  }
  const uint32_t chars = utf8Length(text);
  if (chars > TYPE_MAX_CHARS) {
    sendJson(400, "{\"error\":\"text_too_long\"}");
    return;
  }
  String os;  // optional; fehlt -> win_de (S2)
  const OsMode mode = jsonExtractString(body, "os", os) ? osFromString(os) : OsMode::WIN_DE;

  // delayMs optional (Tippgeschwindigkeit, ms/Zeichen): fehlt -> 60 (abwaertskompatibel),
  // defensiv auf 5–150 begrenzt (bis 0.3.4: 20). Die Feinabstimmung macht die App; 5 ms ist nur die
  // technische Untergrenze, damit dafuer keine neue Firmware noetig ist.
  uint32_t delayMs = 60, parsedDelay = 0;
  if (jsonExtractUInt(body, "delayMs", parsedDelay)) {
    delayMs = parsedDelay < 5 ? 5 : (parsedDelay > 150 ? 150 : parsedDelay);
  }
  // KEIN Logging des Inhalts (kann Patientendaten enthalten). Laeuft schon ein Auftrag, wird der Text
  // angehaengt: so schicken auch aeltere Apps lange Texte weiter in mehreren Teilen. Kein Platz -> 503.
  if (!typeJob.accept(text, chars, (uint16_t)delayMs)) {
    sendJson(503, "{\"error\":\"busy\"}");
    return;
  }
  typerSetMode(mode);
  sendJson(200, String("{\"typed\":") + chars + "}");
}

// Fortschritt und Steuerung des laufenden Auftrags. Antworten enthalten nur Zahlen/Zustand.
static void handleTypeStatus() { sendJson(200, typeJob.json()); }

static void handleTypePause() {
  if (!typeJob.pause()) { sendJson(409, "{\"error\":\"no_job\"}"); return; }
  sendJson(200, typeJob.json());
}

static void handleTypeResume() {
  if (!typeJob.resume()) { sendJson(409, "{\"error\":\"no_job\"}"); return; }
  sendJson(200, typeJob.json());
}

static void handleTypeCancel() {
  if (!typeJob.cancel()) { sendJson(409, "{\"error\":\"no_job\"}"); return; }
  sendJson(200, typeJob.json());
}

// --- Abgelegte Vorlage (StoredTemplate.h) ----------------------------------------------------

// Angaben neu lesen und den abgelegten Text pruefen (StoredGuard.h). Ein Text, der die Pruefung nicht
// besteht (z. B. von einer Firmware vor der Pruefung abgelegt), bleibt liegen, wird aber nie getippt.
static bool storedBlocked = false;
static void storedRefresh() {
  storedInfo = storedRead();
  storedBlocked = false;
  if (!storedInfo.present) return;
  const String text = storedLoad();  // KEIN Logging des Inhalts
  storedBlocked = storedGuardCheck(text.c_str(), text.length()) != GuardVerdict::OK;
}

static void handleStoredGet() { sendJson(200, storedJson(storedInfo, button.held(), storedBlocked)); }

// Text zum Bearbeiten in der App holen - nur mit gedruecktem Knopf, als text/plain (kein JSON-Escaping).
static void handleStoredText() {
  if (!button.held()) { sendJson(403, "{\"error\":\"button_required\"}"); return; }
  if (!storedInfo.present) { sendJson(404, "{\"error\":\"not_found\"}"); return; }
  const String text = storedLoad();  // KEIN Logging des Inhalts
  button.suppress();                 // dieses Halten war die Bestaetigung, kein Tipp-Druck
  addCors();
  server.send(200, "text/plain; charset=utf-8", text);
}

// Ablegen. Der gedrueckte Knopf beweist, dass man den Stick in der Hand hat.
static void handleStoredPut() {
  if (!otaAvailable) { sendJson(500, "{\"error\":\"fs_error\"}"); return; }
  if (typeJob.active()) { sendJson(409, "{\"error\":\"busy\"}"); return; }
  if (!button.held()) { sendJson(403, "{\"error\":\"button_required\"}"); return; }
  const String body = server.arg("plain");
  String text;
  if (!jsonExtractString(body, "text", text) || text.length() == 0) {
    sendJson(400, "{\"error\":\"invalid_body\"}");
    return;
  }
  StoredInfo info;
  info.chars = utf8Length(text);
  if (info.chars > TYPE_MAX_CHARS) { sendJson(400, "{\"error\":\"text_too_long\"}"); return; }
  // Kein Befehl, kein Steuerzeichen: der Knopf tippt nur Text. Antwort nennt nur die Art, nie Inhalt.
  const GuardVerdict verdict = storedGuardCheck(text.c_str(), text.length());
  if (verdict != GuardVerdict::OK) {
    sendJson(422, String("{\"error\":\"not_allowed\",\"reason\":\"") + guardReason(verdict) + "\"}");
    return;
  }
  String name, os;
  if (jsonExtractString(body, "name", name)) info.name = storedCleanName(name);
  if (jsonExtractString(body, "os", os) && storedOsValid(os)) info.os = os;
  uint32_t n = 0;
  if (jsonExtractUInt(body, "delayMs", n)) info.delayMs = (uint16_t)(n < 5 ? 5 : (n > 150 ? 150 : n));
  if (jsonExtractUInt(body, "savedAt", n)) info.savedAt = n;
  if (!storedSave(text, info)) {
    storedRefresh();
    sendJson(507, "{\"error\":\"insufficient_storage\"}");
    return;
  }
  storedRefresh();
  button.suppress();  // dieses Halten war die Bestaetigung, kein Tipp-Druck
  sendJson(200, String("{\"ok\":true,\"chars\":") + storedInfo.chars + "}");
}

static void handleStoredClear() {
  if (!otaAvailable) { sendJson(500, "{\"error\":\"fs_error\"}"); return; }
  if (!button.held()) { sendJson(403, "{\"error\":\"button_required\"}"); return; }
  storedClear();
  storedInfo = StoredInfo();
  storedBlocked = false;
  button.suppress();
  sendJson(200, "{\"ok\":true}");
}

// Kurzer Knopfdruck: laufendes Tippen abbrechen, sonst die abgelegte Vorlage tippen.
static void onButtonPress() {
  if (typeJob.active()) { typeJob.cancel(); return; }
  if (otaSession.active) return;      // waehrend ein Firmware-Update hochgeladen wird, nicht tippen
  if (!storedInfo.present || storedBlocked) return;
  const String text = storedLoad();  // KEIN Logging des Inhalts
  if (text.length() == 0) return;
  // Vor jedem Tippen erneut pruefen - nicht dem Stand vom Start vertrauen.
  if (storedGuardCheck(text.c_str(), text.length()) != GuardVerdict::OK) { storedBlocked = true; return; }
  if (!typeJob.accept(text, storedInfo.chars, storedInfo.delayMs)) return;
  typerSetMode(osFromString(storedInfo.os));
}

static void handleConfig() {
  // Der AP-Neustart wuerde einen laufenden Auftrag von der App abschneiden.
  if (typeJob.active()) { sendJson(409, "{\"error\":\"busy\"}"); return; }
  const String body = server.arg("plain");
  String id;
  if (!jsonExtractString(body, "ssidId", id) || !ssidIdValid(id)) {
    sendJson(400, "{\"error\":\"invalid_ssid_id\"}");
    return;
  }
  if (!saveSsidId(id)) {
    sendJson(500, "{\"error\":\"internal\"}");
    return;
  }
  ssidId = id;
  restartAp = true;     // nach der Antwort (Verbindungsabbruch ist erwartbar, S2)
  sendJson(200, "{\"ok\":true,\"restartRequired\":true}");
}

static void handleNotFound() {
  if (server.method() == HTTP_OPTIONS) { handleOptions(); return; }
  sendJson(404, "{\"error\":\"not_found\"}");
}

// --- OTA (Logik in OtaUpdate.h) ---------------------------------------------------

static void handleOtaBegin() {
  // Kein Firmware-Update, waehrend getippt wird (Flash-Schreiben und Neustart mitten im Auftrag).
  if (typeJob.active()) { sendJson(409, "{\"error\":\"busy\"}"); return; }
  if (!otaAvailable) {
    sendJson(500, "{\"error\":\"fs_error\"}");
    return;
  }
  const String body = server.arg("plain");
  uint32_t size = 0;
  String shaHex, sigB64;
  if (!jsonExtractUInt(body, "size", size) ||
      !jsonExtractString(body, "sha256", shaHex) ||
      !jsonExtractString(body, "sig", sigB64)) {
    sendJson(400, "{\"error\":\"invalid_body\"}");
    return;
  }
  switch (otaBegin(size, shaHex, sigB64)) {
    case OtaResult::OK:
      sendJson(200, String("{\"ok\":true,\"chunkMax\":") + OTA_CHUNK_MAX + "}");
      break;
    case OtaResult::SIZE_INVALID: sendJson(400, "{\"error\":\"size_invalid\"}"); break;
    case OtaResult::INVALID:      sendJson(400, "{\"error\":\"invalid_body\"}"); break;
    case OtaResult::NO_SPACE:     sendJson(507, "{\"error\":\"insufficient_storage\"}"); break;
    default:                      sendJson(500, "{\"error\":\"fs_error\"}"); break;
  }
}

static void handleOtaChunk() {
  const String body = server.arg("plain");
  uint32_t offset = 0;
  String dataB64;
  if (!jsonExtractUInt(body, "offset", offset) ||
      !jsonExtractString(body, "dataB64", dataB64)) {
    sendJson(400, "{\"error\":\"invalid_body\"}");
    return;
  }
  uint32_t received = 0;
  switch (otaChunk(offset, dataB64, received)) {
    case OtaResult::OK:
      sendJson(200, String("{\"received\":") + received + "}");
      break;
    case OtaResult::NO_SESSION:      sendJson(409, "{\"error\":\"no_session\"}"); break;
    case OtaResult::BAD_OFFSET:      sendJson(400, "{\"error\":\"bad_offset\"}"); break;
    case OtaResult::BAD_BASE64:      sendJson(400, "{\"error\":\"bad_base64\"}"); break;
    case OtaResult::SIZE_OVERFLOW:   sendJson(400, "{\"error\":\"size_overflow\"}"); break;
    case OtaResult::CHUNK_TOO_LARGE: sendJson(413, "{\"error\":\"chunk_too_large\"}"); break;
    default:                         sendJson(500, "{\"error\":\"fs_write_failed\"}"); break;
  }
}

static void handleOtaCommit() {
  switch (otaCommit()) {
    case OtaResult::OK:
      otaReboot = true;  // nach der Antwort (loop()); Bootloader flasht beim Boot
      sendJson(200, "{\"ok\":true,\"rebooting\":true}");
      break;
    case OtaResult::NO_SESSION:      sendJson(409, "{\"error\":\"no_session\"}"); break;
    case OtaResult::SIZE_MISMATCH:   sendJson(409, "{\"error\":\"size_mismatch\"}"); break;
    case OtaResult::SHA256_MISMATCH: sendJson(422, "{\"error\":\"sha256_mismatch\"}"); break;
    case OtaResult::SIG_INVALID:     sendJson(422, "{\"error\":\"signature_invalid\"}"); break;
    default:                         sendJson(500, "{\"error\":\"ota_apply_failed\"}"); break;
  }
}

// --- Serial-Recovery (S2: Erst-/Recovery-Weg ohne App) ---------------------------

static void handleSerialLine(const String& line) {
  if (line == "id?") {
    Serial.print("id: ");
    Serial.println(ssidId);
  } else if (line.startsWith("id ")) {
    String id = line.substring(3);
    id.trim();
    if (!ssidIdValid(id)) {
      Serial.println("FEHLER: ungueltige id (erlaubt: [A-Za-z0-9_-]{1,23})");
      return;
    }
    if (!saveSsidId(id)) {
      Serial.println("FEHLER: persistieren fehlgeschlagen");
      return;
    }
    ssidId = id;
    restartAp = true;
    Serial.print("ok, neue SSID: ");
    Serial.println(fullSsid());
  } else if (line.length()) {
    Serial.println("Befehle: id?  |  id NEUEID");
  }
}

static void pollSerial() {
  static String line;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      line.trim();
      handleSerialLine(line);
      line = "";
    } else if (line.length() < 64) {
      line += c;
    }
  }
}

// --- Setup / Loop -----------------------------------------------------------------

void setup() {
  Serial.begin(115200);

  // 1) USB-HID zuerst (known-good, Koexistenz-Risiko #2), dann erst WLAN.
  typerBegin(OsMode::WIN_DE);
  delay(1500);
  ready = true;

  // 2) Persistierte <id> laden (Default: 6 Hex aus Chip-ID) und AP starten.
  configBegin();
  ssidId = loadSsidId();
  startAp();

  // 2b) OTA-Staging vorbereiten (LittleFS mounten, Reste wegputzen).
  otaAvailable = otaSetup();
  if (!otaAvailable) {
    Serial.println("WARNUNG: LittleFS nicht verfuegbar - OTA inaktiv (Flash-Split pruefen)");
  } else {
    storedRefresh();  // abgelegte Vorlage (nur Angaben) samt Pruefung
  }

  // 3) S2-Routen (kein HTML-Formular mehr).
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/type", HTTP_POST, handleType);
  server.on("/type/status", HTTP_GET, handleTypeStatus);
  server.on("/type/pause", HTTP_POST, handleTypePause);
  server.on("/type/resume", HTTP_POST, handleTypeResume);
  server.on("/type/cancel", HTTP_POST, handleTypeCancel);
  server.on("/stored", HTTP_GET, handleStoredGet);
  server.on("/stored/text", HTTP_GET, handleStoredText);
  server.on("/stored", HTTP_POST, handleStoredPut);
  server.on("/stored/clear", HTTP_POST, handleStoredClear);
  server.on("/config", HTTP_POST, handleConfig);
  server.on("/ota/begin", HTTP_POST, handleOtaBegin);
  server.on("/ota/chunk", HTTP_POST, handleOtaChunk);
  server.on("/ota/commit", HTTP_POST, handleOtaCommit);
  server.on("/type", HTTP_OPTIONS, handleOptions);
  server.on("/type/pause", HTTP_OPTIONS, handleOptions);
  server.on("/type/resume", HTTP_OPTIONS, handleOptions);
  server.on("/type/cancel", HTTP_OPTIONS, handleOptions);
  server.on("/stored", HTTP_OPTIONS, handleOptions);
  server.on("/stored/clear", HTTP_OPTIONS, handleOptions);
  server.on("/config", HTTP_OPTIONS, handleOptions);
  server.on("/ota/begin", HTTP_OPTIONS, handleOptions);
  server.on("/ota/chunk", HTTP_OPTIONS, handleOptions);
  server.on("/ota/commit", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);
  server.begin();

  Serial.print("S2-Bridge bereit: ");
  Serial.print(fullSsid());
  Serial.print("  http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
  pollSerial();

  if (otaReboot) {
    otaReboot = false;
    delay(300);            // Antwort sicher raus, dann uebernimmt der Bootloader
    Serial.println("OTA: verifiziert, rebooting ...");
    rp2040.reboot();
  }

  if (restartAp) {
    restartAp = false;
    delay(100);            // Antwort sicher raus
    WiFi.softAPdisconnect(true);
    delay(100);
    startAp();
    Serial.print("AP neu gestartet: ");
    Serial.println(fullSsid());
  }

  // Knopf abfragen (entprellt). Ein kurzer Druck tippt die abgelegte Vorlage bzw. bricht das Tippen ab.
  const uint32_t nowMs = millis();
  if ((uint32_t)(nowMs - lastButtonPoll) >= BUTTON_POLL_MS) {
    lastButtonPoll = nowMs;
    if (button.tick(BOOTSEL, nowMs)) onButtonPress();
  }

  typeJob.tick();  // hoechstens ein Zeichen, dann wieder der Webserver
}
