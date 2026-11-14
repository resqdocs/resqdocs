#!/usr/bin/env bash
# Host-Test der Tipp-Auftragslogik (TypeJob.h) ohne Hardware. Braucht nur g++ (C++17).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
g++ -std=c++17 -Wall -Wextra -I "$HERE/stub" -I "$HERE/../../bridge/bridge_s2" "$HERE/typejob_test.cpp" -o "$OUT/typejob_test"
"$OUT/typejob_test"
