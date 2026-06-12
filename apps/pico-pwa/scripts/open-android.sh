#!/usr/bin/env bash
# Ein-Befehl-Android-Build (#136, Pendant zu open-ios.sh):
#
#   npm run android      # aus apps/pico-pwa
#
# Schritte: deps -> Web-Build -> cap sync -> Android Studio mit android/ oeffnen.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> npm install"
npm install

echo "==> Web-Build"
npm run build

echo "==> Capacitor-Sync (android)"
npx cap sync android

echo "==> Android Studio oeffnen"
open -a "Android Studio" android || npx cap open android
echo "Fertig: Projekt in Android Studio -> Gradle-Sync abwarten und bauen."
