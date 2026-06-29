#!/usr/bin/env bash
# Baut + signiert die produktive Bridge-Firmware (bridge_s2) fuer OTA — EIN Kommando, am Mac.
# Die Version kommt aus FW_VERSION in bridge_s2.ino, damit sie NIE von --version abweicht
# (genau der Footgun aus firmware/bridge/README.md: FW_VERSION == --version muss stimmen).
#
# Voraussetzungen (Mac):
#   - arduino-cli (rp2040-Core 5.6+), einmalig:  arduino-cli lib install Crypto
#   - Signing-Key ~/.resqdocs/ota-ed25519-private.pem (einmalig: node scripts/ota/keygen.mjs)
# Danach: die genannten Artefakte committen, dann per App ODER scripts/ota/upload.mjs OTA-flashen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FQBN="rp2040:rp2040:rpipico2w:flash=4194304_1048576"   # Flash-Split: Sketch 3 MB / LittleFS 1 MB (OTA)
SRC="firmware/bridge/bridge_s2"
OUT="firmware/bridge/build/bridge_s2"

VER="$(grep -oE 'FW_VERSION[[:space:]]*=[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+"' "$SRC/bridge_s2.ino" \
       | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$VER" ] || { echo "FEHLER: FW_VERSION in bridge_s2.ino nicht gefunden"; exit 1; }
command -v arduino-cli >/dev/null || { echo "FEHLER: arduino-cli nicht im PATH (Mac-Toolchain noetig)"; exit 1; }

echo ">> Bridge-Firmware v$VER bauen ($FQBN) ..."
arduino-cli compile --fqbn "$FQBN" --libraries firmware/bridge/libraries --output-dir "$OUT" "$SRC"

echo ">> BOOTSEL-.uf2 -> dist (Fallback-Flash + Konsistenz-Test) ..."
cp "$OUT/bridge_s2.ino.uf2" "firmware/bridge/dist/bridge_s2.pico2w.uf2"

echo ">> Signieren (Ed25519) -> App-Bundle + dist ..."
node scripts/ota/sign.mjs --bin "$OUT/bridge_s2.ino.bin" --version "$VER"

cat <<EOF

>> Fertig (v$VER). Jetzt committen:
   git add apps/pico-pwa/src/assets/firmware/ firmware/bridge/dist/
   git commit -m "chore(firmware): Bridge-Artefakte v$VER (OTA) bauen+signieren"
   # danach gruen:  (cd apps/pico-pwa && node --test --experimental-strip-types --experimental-sqlite src/pico/firmwareArtifacts.test.ts)

>> OTA-Flashen (Pico-WLAN ResQDocs-<id>, Pass resqdocs2026):
   App:  Einstellungen -> Geraet/Pico -> Firmware aktualisieren (Banner v$VER)
   Mac:  node scripts/ota/upload.mjs \\
           --bin firmware/bridge/dist/bridge_s2.pico2w.$VER.bin \\
           --manifest firmware/bridge/dist/bridge_s2.pico2w.$VER.manifest.json
EOF
