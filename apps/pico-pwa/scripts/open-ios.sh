#!/usr/bin/env bash
# Ein-Befehl-iOS-Build (robust): macht ALLE Schritte in der
# richtigen Reihenfolge und oeffnet garantiert die .xcworkspace - nie das
# .xcodeproj (Root Cause von "Unable to resolve module dependency: Capacitor").
#
#   npm run ios          # aus apps/pico-pwa, stabiles Xcode
#   npm run ios:beta     # dasselbe mit Xcode-beta
#   XCODE_APP=Xcode-beta npm run ios                      # gleichwertig
#   XCODE_APP=/Applications/Xcode_16.4.app npm run ios    # beliebige Installation
#
# XCODE_APP waehlt die Toolchain KOMPLETT, nicht nur die App zum Oeffnen: ueber
# DEVELOPER_DIR laufen auch `cap sync` und `pod install` gegen dieselbe Xcode-
# Version. Ohne das loest CocoaPods gegen die stabile Toolchain auf, waehrend
# man anschliessend in der Beta baut - genau die Sorte Misch-Zustand, aus der
# der Fehler "Unable to resolve module Capacitor" entstanden ist.
#
# Schritte: Toolchain waehlen -> deps -> Web-Build -> cap sync -> pod install ->
# Xcode beenden (sonst stellt es ggf. das falsche Projektfenster wieder her) ->
# DerivedData der App raeumen (Reste eines xcodeproj-Fehlbuilds) -> Workspace oeffnen.
set -euo pipefail
cd "$(dirname "$0")/.."

# ---- Toolchain waehlen -------------------------------------------------------
XCODE_APP="${XCODE_APP:-Xcode}"
case "$XCODE_APP" in
  /*) APP_PATH="$XCODE_APP" ;;                      # absoluter Pfad
  *)  APP_PATH="/Applications/${XCODE_APP%.app}.app" ;;
esac

if [ ! -d "$APP_PATH" ]; then
  echo "✗ Xcode nicht gefunden: $APP_PATH" >&2
  echo "  Installierte Xcode-Versionen:" >&2
  ls -d /Applications/Xcode*.app 2>/dev/null | sed 's/^/    /' >&2 || echo "    (keine)" >&2
  echo "  Auswahl ueber XCODE_APP, z. B.: XCODE_APP=Xcode-beta npm run ios" >&2
  exit 1
fi

export DEVELOPER_DIR="$APP_PATH/Contents/Developer"
if [ ! -d "$DEVELOPER_DIR" ]; then
  echo "✗ Kein Developer-Verzeichnis in $APP_PATH - ist das wirklich ein Xcode?" >&2
  exit 1
fi

echo "==> Toolchain: $APP_PATH"
xcodebuild -version 2>/dev/null | sed 's/^/    /' || {
  echo "✗ xcodebuild aus $DEVELOPER_DIR nicht lauffaehig." >&2
  echo "  Bei einer frisch installierten Beta einmal starten und die Lizenz bestaetigen:" >&2
  echo "    sudo \"$DEVELOPER_DIR/usr/bin/xcodebuild\" -license accept" >&2
  exit 1
}

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
# BEIDE Varianten beenden: haelt die andere Installation das Projekt offen, gewinnt beim
# Oeffnen sonst deren Fenster-Wiederherstellung - und man baut unbemerkt in der falschen Xcode.
osascript -e 'tell application "Xcode" to quit' 2>/dev/null || true
osascript -e 'tell application "Xcode-beta" to quit' 2>/dev/null || true
sleep 2
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/App-"*

open -a "$APP_PATH" ios/App/App.xcworkspace
echo "Fertig: $(basename "$APP_PATH" .app) ist mit App.xcworkspace offen -> Schema 'App' waehlen und bauen."
