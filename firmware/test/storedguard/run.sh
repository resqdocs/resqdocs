#!/usr/bin/env bash
# Host-Test der Pruefung des Knopf-Textes (StoredGuard.h) ohne Hardware. Braucht nur g++ (C++17).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
g++ -std=c++17 -Wall -Wextra -I "$HERE/../../bridge/bridge_s2" "$HERE/storedguard_test.cpp" -o "$OUT/storedguard_test"
"$OUT/storedguard_test" "$HERE/vectors.tsv"
