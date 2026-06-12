# firmware/bridge — arduino-pico Bridge-Firmware

Bridge-Firmware (USB-HID-Typer) auf dem Pico 2 W: zwei Test-Slices, die
produktive S2-Bridge (`bridge_s2/`, Issue #14) und ein geteiltes Typer-Modul.
Entwickelt im Linux-Container (nur Build/Compile-Check), **geflasht und auf
echter Hardware getestet am Mac** (Pico → NIDA via USB-A, Pico → iPad via USB-C).

## Aufbau

```
libraries/Typer/        geteilte Tipp-Engine (UTF-8 -> de_DE-Keystrokes)
  src/OsMode.h          win_de / mac_de / ios (Seam; mac/ios aliasen aktuell win_de)
  src/TestString.h      kanonischer Issue-#1-Teststring (UTF-8, mit Encoding-Guard)
  src/Typer.{h,cpp}     Routing: ASCII -> de_DE-Layout; Sonderzeichen -> eigene Tabelle
slice_a_umlaut/         Slice A: Umlaut-Typer standalone (kein WLAN), 3 Trigger
slice_b_bridge/         Slice B: WLAN-AP + Web-Form -> tippt empfangenen Text
bridge_s2/              PRODUKTIV: S2-Bridge — REST-API (docs/pico-api.md), #14
  bridge_s2.ino         GET /health|/status, POST /type|/config|/ota/*, Serial-Recovery
  ConfigStore.h         SSID-<id>: Chip-ID-Default, EEPROM-persistiert, validiert
  JsonMini.h            dependency-freier JSON-Extraktor (String + UInt) + UTF-8-Zaehler
  OtaUpdate.h           OTA-Session + Verifikation (SHA-256 + Ed25519), #130
  OtaPublicKey.h        Ed25519-Public-Key (von scripts/ota/keygen.mjs generiert)
build/                  .uf2/.bin-Output (compile-check)
dist/                   versionierte .uf2 (BOOTSEL) + signierte .bin/.manifest (OTA)
```

## Stack — was tatsächlich verwendet wird (korrigiert ggü. Plan)

Beim Implementieren auf echte Lib-Quellen geprüft; drei Plan-Annahmen mussten korrigiert werden:

| Komponente | Status | Befund |
|---|---|---|
| **arduino-pico Core** `rp2040:rp2040` **5.6.0** | ✅ genutzt | hat Pico-2-W-Board `rpipico2w`, picotool gebündelt |
| **core-gebündelte `Keyboard` 1.0.3 / `HID_Keyboard` 1.0.4** | ✅ genutzt | liefert `KeyboardLayout_de_DE` + `Keyboard_de_DE.h` (KEY_*_UMLAUT-Makros) |
| **`KeyboardLayout_de_DE`** | ⚠️ nur ASCII | Layout ist **ASCII-only** (deckt aber AltGr `@ \ { } [ ] \| ~` ab). Umlaute/€/§/°/µ/Akzente **nicht** drin → eigene Unicode-Tabelle in `Typer.cpp` |
| **cervoise/KeyboardWithLayout** | ❌ verworfen | nur EN/FR; Include-Guard `KEYBOARD_h` + `KeyReport`/`KEY_*` **kollidieren** mit `Keyboard.h` → nicht koexistenzfähig |
| **JohnWasser/Arduino_KeyboardUTF8** | ❌ nicht nötig | bräuchte eine vollständige Sprachtabelle als Parameter; eigene schlanke Erweiterung im Typer ist weniger Code |
| **USB-Stack** | ⚠️ **Default, NICHT tinyusb** | core-`Keyboard.h`: `#error Keyboard is not compatible with Adafruit TinyUSB`. FQBN OHNE `:usbstack=tinyusb` |

Verworfene Klone liegen unter `/tmp/resq-unused-libs/` (nicht im Repo).

## Build (Container, kann nicht flashen)

```bash
export PATH="$HOME/.local/bin:$PATH"   # arduino-cli

# Slice A — Pico 2 W
arduino-cli compile --fqbn rp2040:rp2040:rpipico2w \
  --libraries firmware/bridge/libraries \
  --output-dir firmware/bridge/build/slice_a firmware/bridge/slice_a_umlaut

# Slice B — Pico 2 W
arduino-cli compile --fqbn rp2040:rp2040:rpipico2w \
  --libraries firmware/bridge/libraries \
  --output-dir firmware/bridge/build/slice_b firmware/bridge/slice_b_bridge

# S2-Bridge (produktiv) — Pico 2 W. WICHTIG ab 0.3.0: Flash-Split fuer die
# OTA-Staging-Partition (Sketch 3 MB / LittleFS 1 MB) + Crypto-Lib (einmalig):
arduino-cli lib install Crypto    # rweather, Ed25519/SHA256 (MIT)
arduino-cli compile --fqbn rp2040:rp2040:rpipico2w:flash=4194304_1048576 \
  --libraries firmware/bridge/libraries \
  --output-dir firmware/bridge/build/bridge_s2 firmware/bridge/bridge_s2

# Pico 1 (RP2040) Fallback für Slice A: --fqbn rp2040:rp2040:rpipico
```

Ergebnis z. B. `build/slice_a/slice_a_umlaut.ino.uf2`. Die `.uf2` geht per
Datei-Transfer an den Mac. Fuer bridge_s2 entsteht zusaetzlich
`bridge_s2.ino.bin` — das ist das **OTA-Format** (die `.uf2` bleibt der
BOOTSEL-Weg).

## Flash (Mac)

BOOTSEL gedrückt halten + USB einstecken → Laufwerk `RPI-RP2` mountet → `.uf2`
drauf ziehen → Pico rebootet als USB-HID-Tastatur. Serial-Monitor optional
(`arduino-cli monitor -p <port>`), 115200 Baud.

## OTA-Release-Workflow (#130)

Update ueber WLAN, signiert (Ed25519 ueber den SHA-256-Digest). Details:
`docs/pico-api.md` (Endpoints), `SECURITY.md` (Signatur-Modell).

```bash
# 0) EINMALIG: Schluesselpaar erzeugen (privater Key landet ausserhalb des
#    Repos, ~/.resqdocs/; OtaPublicKey.h wird ueberschrieben -> committen!)
node scripts/ota/keygen.mjs

# 1) Bauen (FQBN mit Flash-Split, s. o.) -> build/bridge_s2/bridge_s2.ino.bin

# 2) Signieren + Release ablegen: schreibt dist/bridge_s2.pico2w.<v>.bin
#    + .manifest.json UND apps/pico-pwa/src/assets/firmware/ (App-Bundle).
node scripts/ota/sign.mjs \
  --bin firmware/bridge/build/bridge_s2/bridge_s2.ino.bin --version 0.3.0

# 3a) Update aus der App: Einstellungen -> Geraet/Pico -> Firmware aktualisieren
# 3b) Update ohne App (Dev/Test, Mac im Bridge-WLAN):
node scripts/ota/upload.mjs \
  --bin firmware/bridge/dist/bridge_s2.pico2w.0.3.0.bin \
  --manifest firmware/bridge/dist/bridge_s2.pico2w.0.3.0.manifest.json
```

**Henne-Ei:** Firmware ≤ 0.2.0 hat kein OTA — das **erste** Update auf 0.3.0
erfolgt einmalig manuell per BOOTSEL (`.uf2`). Danach geht alles ueber WLAN.
**Fallback bleibt immer BOOTSEL** (kein A/B-Rollback): schlaegt ein Update vor
dem Reboot fehl, bleibt die alte Firmware aktiv; nur ein Stromausfall exakt
waehrend des Bootloader-Flashens erfordert den manuellen Weg.

Versionsnummer pflegen: `FW_VERSION` in `bridge_s2.ino` UND `--version` beim
Signieren muessen uebereinstimmen — die App bestaetigt den Erfolg ueber den
`/status`-Abgleich mit der Manifest-Version.

## Bedienung

**Slice A** — Pico ans Ziel, Textfeld fokussieren, ~5 s warten → tippt Header +
Teststring einmal. Re-Trigger: beliebiges Serial-Byte **oder** BOOTSEL.
OS-Umschalten ohne Recompile: Serial `w` (win_de) / `m` (mac_de) / `i` (ios).

**Slice B** — Pico ans Ziel (NIDA/iPad), Handy ins WLAN `ResQDocs-Bridge`
(Pass `resqdocs2026`), Browser `http://10.10.10.1/`, Text + Ziel-OS wählen,
„In Zielgerät tippen" → Bridge tippt den Block ins fokussierte Feld.

**S2-Bridge (`bridge_s2/`)** — produktive Firmware ohne Web-Form: WLAN-AP
`ResQDocs-<id>` (Pass `resqdocs2026`), REST-API nach `docs/pico-api.md`
(`GET /health`, `GET /status`, `POST /type` mit JSON `{text, os?}`,
`POST /config` mit `{ssidId}` → EEPROM → AP-Neustart, `POST /ota/*` für
signierte Firmware-Updates, #130). Kein Logging des `/type`-Inhalts.
`<id>`-Recovery über Serial: `id?` zeigt sie, `id NEUEID` setzt sie.
Client ist die PWA (`apps/pico-pwa`).

## Offene Risiken (auf Hardware zu klären)

1. **iPad-Sonderzeichen** — kein volles QWERTZ-HW-Layout; `ios`-Tabelle existiert
   noch nicht (aliast win_de). Delta aus dem Test = Bauplan für die ios-Keymap.
2. ~~**USB-HID + WLAN gleichzeitig** auf einem RP2350~~ ✅ **VERIFIZIERT
   [2026-06-10]** mit der S2-Bridge (siehe unten): AP + HTTP-Server + HID-Tippen
   laufen gleichzeitig. Seam (WLAN erst nach `typerBegin()`, Web→Typer über
   Puffer in `loop()`) hat gereicht; CH9329-Fallback obsolet.
3. **mac_de-Sonderzeichen** (Option-Ebene ≠ Win-AltGr) — eigene Tabelle nötig.

## win_de-Ergebnisse — VERIFIZIERT auf NIDA 5.2.5.5451 [2026-06-08]

Slice A am echten NIDA getippt (Feld „Anamnese / Einsatzauftrag"): **voller Pass** außer `ç`/`ñ`.

- ✅ ASCII inkl. `@ \ { } [ ] | ~`, Umlaute `ä ö ü Ä Ö Ü ß`, `€ § ° µ` — alle korrekt.
- ✅ Deadkey-Akzente `é è ê à â î ô û á í ó ú` — alle korrekt.
- ⚠️ `ç` und `ñ` → `[?]` (auf DE-Layout nicht direkt erzeugbar) — bewusster, ehrlicher
  Gap, kein Bug. **Bewusst NICHT nachgerüstet** [User-Entscheidung 2026-06-08]: für
  Einsatzdaten irrelevant (stehen nicht mal auf der Tastatur). Später ggf. im Composer
  sanfter Fallback auf den Grundbuchstaben — kein Alt-Code-Pfad in der Firmware.

## ios-Ergebnisse — VERIFIZIERT auf iPad [2026-06-08]

`ios`-Modus tippt **vollständig korrekt** (außer `ç`/`ñ` → `{?}`, wie gewollt): Umlaute,
echtes `°`, alle AltGr-Zeichen `@ € { } [ ] \ ~ | µ`, Akut/Grave **und** Zirkumflex
`é è ê à â î ô û á í ó ú`.

**Root Cause iPad (belegt):** iPadOS erkennt die generische HID-Tastatur als **ANSI statt
ISO** → `^°` und `<>` gegenüber PC-ISO **vertauscht**, Option-Ebene ≠ Win-AltGr. `ios`-Keymap
(`Typer.cpp`, `IOS_DIRECT`/`IOS_DEAD`): AltGr→Apple-Option; `^`/`°` auf ISO-Taste `0x64`
(`^`=plain Deadkey, `°`=Shift); `<`/`>` auf `0x35`; Zirkumflex über `0x64`-Deadtaste.
Quellen: iPad-Probe (Gerätewahrheit) + Apple Community thread 8454265 + Apple Support 102743.

## S2-Bridge — VERIFIZIERT auf Hardware [2026-06-10]

`bridge_s2` (fw 0.2.0) geflasht; Tipp-Ziel war der **Mac selbst** (Terminal,
`os: ios`), kein NIDA/iPad. NIDA (win_de) und iPad (ios) sind über die identische
Typer-Lib bereits durch Slice A/B verifiziert; S2-spezifisch zu beweisen war die
Koexistenz, und die steht:

- ✅ **USB-HID + WLAN-Koexistenz bewiesen:** AP `ResQDocs-F80EA8` (Chip-ID-Default
  funktioniert), `/health` → `ok`, `/status` → korrektes JSON, `POST /type` tippt
  bei aktivem WLAN.
- ✅ `{"text":"Test äöüß §42 — über NIDA","os":"ios"}` → `{"typed":25}` (UTF-8-Zähler
  korrekt); Umlaute + `§` korrekt getippt.
- ⚠️ `—` (Gedankenstrich, U+2014) → `{?}`: **by design**, nicht in der Keymap,
  gleiche Kategorie wie `ç`/`ñ`. `{?}` ist der ios-Fallback-Marker, win_de zeigt
  `[?]`. In keiner echten Protokoll-Payload enthalten (geprüft: `protocols/*.json`,
  saniscript-Referenzen). Hinweis: Tipp-Ziel Mac ist kein verifiziertes Profil
  (`mac_de` aliast win_de); kleine Abweichungen dort sind erwartbar und kein Bug.

Offen: `mac_de` (optional).
