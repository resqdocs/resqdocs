#!/usr/bin/env bash
# Ein-Befehl-iOS-Build (#136, bug-106-sicher): macht ALLE Schritte in der
# richtigen Reihenfolge und oeffnet garantiert die .xcworkspace - nie das
# .xcodeproj (Root Cause von "Unable to resolve module dependency: Capacitor").
#
#   npm run ios          # aus apps/pico-pwa
#
# Schritte: deps -> Web-Build -> cap sync -> pod install -> Xcode beenden
# (sonst stellt es ggf. das falsche Projektfenster wieder her) -> DerivedData
# der App raeumen (Reste eines xcodeproj-Fehlbuilds) -> Workspace oeffnen.
set -euo pipefail
cd "$(dirname "$0")/.."

# Build-Guard (Vorfall 1.2.1): bricht HART ab, wenn Web-Version (package.json) != nativer Store-Version.
echo "==> Versions-Konsistenz prüfen"
node scripts/check-version-consistency.mjs

echo "==> npm install"
npm install

echo "==> Web-Build"
npm run build

echo "==> Capacitor-Sync (ios)"
npx cap sync ios

echo "==> CocoaPods"
( cd ios/App && pod install )

echo "==> Xcode neu starten (Workspace, nie das .xcodeproj)"
osascript -e 'tell application "Xcode" to quit' 2>/dev/null || true
sleep 2
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/App-"*

open ios/App/App.xcworkspace
echo "Fertig: Xcode ist mit App.xcworkspace offen -> Schema 'App' waehlen und bauen."
