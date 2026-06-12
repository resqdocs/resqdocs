# Pico-Bridge — HTTP-API & AP-Identität (S2)

> Vertrag zwischen App (`apps/pico-pwa`, `usePicoApi`) und Bridge-Firmware (`firmware/bridge`).
> Status: **Entwurf, in Entwicklung (0.x)** — MVP/`1.0` deklariert der Maintainer.
> Der Pico bleibt ein **einfacher lokaler HTTP-Endpunkt** (kein UI-Hosting, kleine Payloads).

## AP-Identität (WLAN)

- **SSID:** `ResQDocs-<id>`. Präfix `ResQDocs-` **fix**, nur `<id>` editierbar.
- **Default-`<id>`:** **6 Zeichen Hex aus der RP2350-Board-Seriennummer**, z. B. `ResQDocs-7F3A91`
  ⇒ **out-of-the-box eindeutig, ohne Setup** (löst „mehrere identische WLANs am selben Ort").
- **`<id>` überschreibbar** (Klarname), **im Flash persistiert**. Validierung serverseitig:
  `^[A-Za-z0-9_-]{1,23}$` — keine Umlaute/Nicht-ASCII, Leerzeichen, Zeilenumbrüche, Steuerzeichen; nicht leer;
  SSID `ResQDocs-<id>` bleibt ≤ **32 Byte**. Ungültig → abgelehnt, bisherige `<id>` bleibt.
- **Passwort:** **fix, öffentlicher Standard, NICHT änderbar** (WPA2). Die `<id>` dient der **Unterscheidung**
  mehrerer Geräte — **nicht** dem Zugriffsschutz.
- **IP:** `10.10.10.1` (AP-only-Default, explizit gesetzt).

## Authentifizierung — kein Auth im MVP

- **`/type`, `/health`, `/status`, `/config` ohne Auth.** Begründung: Zugriff via WLAN (physische Nähe); die
  Bridge **tippt nur** (liest/exfiltriert nichts); Umbenennen via `/config` ist harmlos (kein Zugriffsschutz,
  keine Patientendaten). Rest-Risiko bewusst als **minimal** akzeptiert (siehe `SECURITY.md`).
- **OTA-Firmware-Updates** (`/ota/*`, #130) sind **signaturpflichtig**: die Bridge wendet nur Firmware an,
  deren SHA-256-Digest eine gültige **Ed25519-Signatur** des Maintainers trägt (Public Key in der Firmware).
  Die Signierungspflicht aus `SECURITY.md` ist damit erfüllt — ein zusätzliches API-Auth ist nicht nötig
  (Fremd-Uploads scheitern an der Verifikation; DoS durch sinnlose Uploads = akzeptiertes Restrisiko).
- **Seam:** Token-Option später in `usePicoApi` nachrüstbar, falls ein Deployment sie braucht.

## Einstellungen (eigener Settings-Bereich)

- **App-Einstellungen** (lokal, `@capacitor/preferences`): **Default-`os`**, UI-Präferenzen. Die App sendet das
  gespeicherte `os` bei jedem `POST /type`.
- **Geräte-/WLAN-Einstellungen** (Pico-Flash): die SSID-`<id>`. **Setz-Weg: `POST /config` (primär) + Serial
  (Erst-/Recovery-Weg).**

## Endpunkte

### `GET /health`
```
200  "ok"   (text/plain)
```

### `GET /status`
```
200  { "name":"ResQDocs-7F3A91", "fwVersion":"0.3.0", "apiVersion":"0.1.0",
       "ready":true, "defaultOs":"win_de", "otaSupported":true }
```
`name` = aktuelle SSID-`<id>` · `ready` = USB-HID bereit · `defaultOs` = Firmware-Fallback (kein persistenter
Modus; `os` kommt App-seitig) · `otaSupported` = LittleFS gemountet, `/ota/*` nutzbar (ab fw 0.3.0; ältere
Firmware liefert das Feld nicht → App zeigt den BOOTSEL-Hinweis).

### `POST /type`
Text als USB-HID-Tastatur ins fokussierte Feld tippen.
```
Request:  application/json  { "text":"…", "os":"win_de"|"mac_de"|"ios" }
200  { "typed": <int Zeichen> }
400  { "error":"invalid_body" | "text_too_long" }
5xx  { "error":"internal" }
```
- `os` **optional**; fehlt es, nutzt die Firmware den Fallback `win_de`. (Die App sendet es i. d. R. aus den
  App-Einstellungen.)
- **Max. Textlänge: 16384 Zeichen** pro Request (passt ein volles Protokoll inkl. Anamnese; für RP2350 winzig).
  **Überlauf:** Die App **chunkt** längere Texte in mehrere `/type`-Requests → **Gesamtlänge unbegrenzt**,
  der Pico behält eine feste Puffergrenze. `> 16384` → `400 text_too_long`.
- Tippen dauert (Per-Char-Delay) → App nutzt großzügigen `readTimeout`.

### `POST /config`
Geräte-Konfiguration setzen (aktuell: SSID-`<id>`).
```
Request:  application/json  { "ssidId":"RTW1" }
200  { "ok": true, "restartRequired": true }
400  { "error":"invalid_ssid_id" }
```
- Validierung `^[A-Za-z0-9_-]{1,23}$`; persistiert im Flash; **AP-Neustart** zum Übernehmen (Verbindung bricht
  erwartbar ab). Alternativer Setz-Weg: **Serial** (Erst-/Recovery-Konfiguration ohne App).

### OTA-Update (`/ota/begin` → `/ota/chunk`* → `/ota/commit`, #130)

Signiertes Firmware-Update über WLAN (ab fw 0.3.0). Ablauf: die App (oder `scripts/ota/upload.mjs`)
öffnet eine Session mit den Manifest-Daten, lädt das Binary in sequenziellen Base64-Chunks hoch und
stößt die Verifikation an. Die Bridge prüft **komplett vor dem Anwenden** (erst SHA-256 streamend über
die hochgeladene Datei, dann Ed25519 über den Digest gegen den eingebauten Public Key) und übergibt
erst danach an das eingebaute arduino-pico-OTA (Reboot, Bootloader flasht). Bei jedem
Verifikationsfehler bleibt die **alte Firmware aktiv**.

#### `POST /ota/begin`
```
Request:  { "size": 430152, "sha256": "<64 hex>", "sig": "<Base64, 64 Byte Ed25519>" }
200  { "ok": true, "chunkMax": 8192 }
400  { "error": "invalid_body" | "size_invalid" }      (Hard-Cap 960 KB)
507  { "error": "insufficient_storage" }               (LittleFS-Freiplatz < size)
500  { "error": "fs_error" }
```
Ersetzt implizit jede offene Alt-Session. `sha256`/`sig` stammen aus dem Manifest von `scripts/ota/sign.mjs`.

#### `POST /ota/chunk`
```
Request:  { "offset": 0, "dataB64": "..." }            (max. chunkMax Bytes dekodiert)
200  { "received": <Gesamtbytes nach diesem Chunk> }
400  { "error": "invalid_body" | "bad_base64" | "bad_offset" | "size_overflow" }
409  { "error": "no_session" }
413  { "error": "chunk_too_large" }
500  { "error": "fs_write_failed" }
```
Strikt **sequenziell**: `offset` muss der Zahl bereits empfangener Bytes entsprechen.

#### `POST /ota/commit`
```
Request:  {}
200  { "ok": true, "rebooting": true }                 (Reboot ~300 ms nach der Antwort)
409  { "error": "no_session" | "size_mismatch" }
422  { "error": "sha256_mismatch" | "signature_invalid" }   (Session verworfen, Datei gelöscht)
500  { "error": "ota_apply_failed" }
```
Nach dem Reboot pollt der Client `GET /health` (App: alle 2 s, Budget 90 s) und bestätigt den Erfolg
über `GET /status` → `fwVersion` == Manifest-Version. **Henne-Ei:** Firmware ≤ 0.2.0 hat kein OTA —
das erste Update auf 0.3.0 erfolgt einmalig manuell per BOOTSEL (siehe `firmware/bridge/README.md`).

## API-Verträge (Übersicht)
```http
GET  /health     -> 200 "ok"
GET  /status     -> 200 { name, fwVersion, apiVersion, ready, defaultOs, otaSupported }
POST /type       { text, os? }     -> 200 { typed } | 400 { error } | 5xx { error }   (Limit 16384, App chunkt)
POST /config     { ssidId }        -> 200 { ok, restartRequired } | 400 { error }
POST /ota/begin  { size, sha256, sig } -> 200 { ok, chunkMax } | 400/507/500 { error }
POST /ota/chunk  { offset, dataB64 }   -> 200 { received } | 400/409/413/500 { error }
POST /ota/commit {}                    -> 200 { ok, rebooting } | 409/422/500 { error }
```

## Fehler-, Timeout- & Reconnect-Semantik (App-Seite)

- `connectTimeout` ~5 s, `readTimeout` ~20 s (Tippen dauert). **Retry mit Exponential-Backoff** bei Netzfehlern.
- Verbindungszustand über `GET /health` sichtbar; „keine Bridge" verständlich anzeigen.
- `POST /config` → App weist auf nötigen **AP-Neustart** hin (Verbindungsabbruch ist erwartbar).
- Kommunikation **gekapselt** in `usePicoApi()` (keine direkten HTTP-Aufrufe in UI-Komponenten); via **CapacitorHttp**.

## Datenschutz

- Der `POST /type`-Body kann **Patientendaten** enthalten (zu tippender Text) → **nur im Body** (nie URL/Query),
  **kein** Logging/Cache, transient. Siehe `docs/data-flow.md`.

## Firmware-Aufgabe (Folge dieser Spec)

`firmware/bridge` (aktuell `ResQDocs-Bridge` + HTML-Formular): SSID → `ResQDocs-<id>` (6-Hex-Default aus Board-UID,
überschreibbar + Validierung + Flash-Persistenz); `POST /type` als **JSON-Body** (Limit 16384); `GET /status` +
`POST /config` ergänzen; HTML-Formular entfällt. Als eigenes Firmware-Issue geführt.

## App-Anbindung (#14-B)

Die App spricht die Bridge über eine **gekapselte Schicht** `apps/pico-pwa/src/pico/` an:
`picoClient` (reine HTTP-Logik gegen einen `HttpAdapter`) + `capacitorHttpAdapter` (einzige
`CapacitorHttp`-Stelle) + `usePicoDevice` (Composable für den Gerät/Pico-Bereich). UI-Komponenten
enthalten **keine** HTTP-Logik.

- **Umgesetzt:** `GET /health` (→ true/false), `GET /status` (→ `{name,fwVersion,apiVersion,ready,defaultOs,
  otaSupported}`, validiert), `POST /type` `{ text, os }` (→ `{ typed }`), `POST /config` (#17) sowie das
  **OTA-Update** (#130): `picoClient` (otaBegin/otaChunk/otaCommit) + `firmwareUpdate.ts` (pure
  Orchestrierung: Chunking, Progress, Reboot-Polling) + `firmwareAsset.ts` (gebündelte signierte Firmware
  als App-Asset, kein Internet-Download) + `useFirmwareUpdate` (Composable für den Gerät/Pico-Bereich).
- **Base-URL:** App-Einstellung `picoBaseUrl` (Default **`http://10.10.10.1`**, S2), im Gerät/Pico-Bereich
  editierbar; auch der Einsatz-Send (`usePicoApi`) nutzt diese eine Quelle.
- **Datenschutz:** Text nur im **Body** von `/type` (nie in URL), **kein** Payload-Logging, Fehler nur als
  HTTP-Status normalisiert; Testtext im Gerät/Pico-Bereich lebt nur im RAM (nicht persistiert).
- **Web vs. nativ:** nativ via CapacitorHttp (vermeidet CORS/Mixed-Content); im Web-Browser kann es
  CORS-/Mixed-Content-Einschränkungen geben. Cleartext-HTTP zur lokalen Bridge erfordert nativ
  Android-`network_security_config` bzw. iOS-ATS-Ausnahmen — eingerichtet **beim Hinzufügen der nativen
  Plattformen** (`npx cap add …`); solange `ios/`/`android/` fehlen, nur Doku (siehe `docs/native-smoke.md`).
