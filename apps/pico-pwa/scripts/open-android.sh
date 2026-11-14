#!/usr/bin/env bash
# Ein-Befehl-Android-Build (Pendant zu open-ios.sh):
#
#   npm run android      # aus apps/pico-pwa
#
# Schritte: deps (npm ci) -> Web-Build -> cap sync -> Android Studio mit android/ oeffnen.
set -euo pipefail
cd "$(dirname "$0")/.."

# Build-Guard (Vorfall 1.2.1): bricht HART ab, wenn Web-Version (package.json) != nativer Store-Version.
echo "==> Versions-Konsistenz prüfen"
node scripts/check-version-consistency.mjs

# npm ci statt npm install: installiert exakt nach Lockfile und schreibt es nie um. Ein npm install
# mit aelterem npm (< 12) hat die Lockfile bei jedem Build veraendert und Branch-Wechsel blockiert.
NPM_MAJOR="$(npm -v | cut -d. -f1)"
if [ "$NPM_MAJOR" -lt 12 ]; then
  echo "✗ npm $(npm -v) gefunden, das Projekt braucht npm 12 oder neuer (package.json: engines)." >&2
  echo "  Aktualisieren: npm install -g npm@latest" >&2
  exit 1
fi
echo "==> npm ci"
npm ci

echo "==> Web-Build"
npm run build

echo "==> Capacitor-Sync (android)"
npx cap sync android

echo "==> Android Studio oeffnen"
open -a "Android Studio" android || npx cap open android
echo "Fertig: Projekt in Android Studio -> Gradle-Sync abwarten und bauen."
