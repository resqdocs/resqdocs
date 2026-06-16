#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 The ResQDocs project contributors
# build-reproducible.sh — pfad-neutraler, reproduzierbarer Build der S2-Bridge (#6 Gate 2).
#
# Entfernt den Build-Pfad-Leak (absolute Toolchain-Pfade wie <home>/Library/
# Arduino15/... bzw. /home/<name>/.arduino15/...) aus der Binary, indem alle Quell-
# Pfade per -ffile-prefix-map auf "." abgebildet werden. Ergebnis ist über
# verschiedene Build-Verzeichnisse hinweg BIT-IDENTISCH (verifiziert: zwei Builds
# aus unterschiedlichen --build-path ergaben dieselbe sha256).
#
# NICHT enthalten: Signierung. Die signierte Auslieferung (.bin/.manifest + .uf2)
# erfolgt danach über scripts/ota/sign.mjs MIT dem privaten OTA-Key (außerhalb des
# Repos, nur beim Maintainer). Siehe firmware/bridge/README.md.
#
# Quellen: https://reproducible-builds.org/docs/build-path/
#          https://interrupt.memfault.com/blog/reproducible-firmware-builds
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FQBN="rp2040:rp2040:rpipico2w:flash=4194304_1048576"   # Pico 2 W, OTA-Flash-Split
OUT_DIR="${1:-$REPO_ROOT/firmware/bridge/build/bridge_s2}"
BUILD_PATH="${2:-$REPO_ROOT/firmware/bridge/build/_bp}"

# Arduino-Datenverzeichnis portabel ermitteln (macOS: ~/Library/Arduino15,
# Linux: ~/.arduino15) und zusammen mit dem Build-Pfad auf "." mappen.
ARDUINO_DATA="$(arduino-cli config get directories.data)"
MAP="-ffile-prefix-map=${ARDUINO_DATA}=. -ffile-prefix-map=${BUILD_PATH}=."

# Reproduzierbarkeit gegen evtl. eingebettete Zeitstempel absichern.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"

echo "arduino-cli compile (pfad-neutral) …"
arduino-cli compile --fqbn "$FQBN" \
  --libraries "$REPO_ROOT/firmware/bridge/libraries" \
  --build-path "$BUILD_PATH" \
  --build-property "compiler.c.extra_flags=$MAP" \
  --build-property "compiler.cpp.extra_flags=$MAP" \
  --build-property "compiler.S.extra_flags=$MAP" \
  --output-dir "$OUT_DIR" \
  "$REPO_ROOT/firmware/bridge/bridge_s2"

BIN="$OUT_DIR/bridge_s2.ino.bin"
echo "sha256: $(sha256sum "$BIN" | cut -d' ' -f1)"
echo "Leak-Check (muss 0 sein): $(LC_ALL=C strings "$BIN" | grep -cE '/Users|/home/|\.arduino15|Arduino15' || true)"
echo "Fertig: $BIN  -> nun signieren via scripts/ota/sign.mjs --bin $BIN --version <x.y.z>"
