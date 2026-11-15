#!/usr/bin/env bash
# Host-Test der Knopf-Auswertung (ButtonPress.h) ohne Hardware. Braucht nur g++ (C++17).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
g++ -std=c++17 -Wall -Wextra -I "$HERE/../typejob/stub" -I "$HERE/../../bridge/bridge_s2" "$HERE/button_test.cpp" -o "$OUT/button_test"
"$OUT/button_test"
