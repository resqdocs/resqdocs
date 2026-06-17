# Android-App (Capacitor)

Die Android-App teilt sich den kompletten Web-/Logikcode mit iOS — gleiche
Capacitor-Konfiguration, gleiche `dist/`-Assets. Plattform-Projekt liegt unter
`apps/pico-pwa/android/`.

App-ID: `com.example.resqdocs` (identisch zu iOS). App-Name: `ResQDocs`.

## Plattform-Politik (verbindlich)

- **Keine Google Play Services / Firebase / Analytics / Crash-Reporter.** Es sind
  nur die vier Capacitor-Plugins eingebunden, die auch iOS nutzt: SQLite,
  Filesystem, Preferences, Share. Keines zieht GMS. Damit läuft die App auch auf
  Huawei-Geräten (AppGallery, ohne GMS).
- **Netzwerk:** Die App spricht ausschließlich (a) die lokale ResQDocs-Bridge
  (Pico) im WLAN und (b) den PZN-Datenbank-Abruf über HTTPS an. Der Cleartext-HTTP
  zur Bridge ist in `app/src/main/res/xml/network_security_config.xml` freigegeben
  (Pendant zu iOS `NSAllowsLocalNetworking`). Sonst kein Cleartext.
- **Kamera** (`android.permission.CAMERA`) nur für den Medikationsplan-Scan (BMP,
  `@zxing/browser` im WebView). `uses-feature` ist `required="false"` — Geräte
  ohne Kamera können die App nutzen, nur der Scan entfällt.

## Voraussetzungen

- **JDK 21** (z. B. Temurin/OpenJDK 21).
- **Android SDK**: Platform `android-36`, Build-Tools `36.0.0`, Platform-Tools.
  Bequem über Android Studio (Giraffe+) oder die Command-line-Tools (`sdkmanager`).
- Gradle wird vom Wrapper (`./gradlew`, Version 8.14.3) automatisch geladen.

`android/local.properties` muss auf das SDK zeigen (wird nicht eingecheckt):

```
sdk.dir=/pfad/zum/Android/sdk
```

Android Studio legt diese Datei beim ersten Öffnen selbst an.

## Bauen & Starten

Immer zuerst die Web-Assets bauen und kopieren:

```bash
cd apps/pico-pwa
npm install
npm run build
npx cap sync android      # kopiert dist/ + aktualisiert native Plugins
```

Dann entweder in Android Studio öffnen:

```bash
npx cap open android      # öffnet das Projekt in Android Studio → Run ▶

# ODER alles in einem (empfohlen, #136): install + build + sync + öffnen
npm run android
```

oder per CLI ein Debug-APK bauen:

```bash
cd android
./gradlew :app:assembleDebug
# Ergebnis: app/build/outputs/apk/debug/app-debug.apk
```

Debug-APK auf ein angeschlossenes Gerät installieren:

```bash
./gradlew :app:installDebug
# oder: adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Release / Signierung

> Ausführliche Anleitung (Android Studio Schritt für Schritt, CLI, Play Store
> inkl. Testnutzer, F-Droid): **[`android-release.md`](android-release.md)**.

1. Keystore anlegen (einmalig, **außerhalb** des Repos aufbewahren):

   ```bash
   keytool -genkey -v -keystore resqdocs-release.jks \
     -alias resqdocs -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Signing in `android/app/build.gradle` (oder per
   `~/.gradle/gradle.properties` / Android-Studio „Generate Signed Bundle/APK")
   konfigurieren. Keystore-Dateien sind in `.gitignore` vorgesehen — nicht
   einchecken.

3. Release-Artefakt bauen:

   ```bash
   ./gradlew :app:bundleRelease     # .aab für Stores
   ./gradlew :app:assembleRelease   # .apk für Direktverteilung / Sideload
   ```

## Verteilung

- **Google Play:** `.aab` hochladen. Die App nutzt kein GMS — keine zusätzlichen
  Play-Dienste nötig.
- **Huawei AppGallery:** `.apk`/`.aab` ohne GMS-Abhängigkeit — direkt nutzbar.
- **Direkt / Sideload:** signiertes `.apk` (z. B. für interne Tests, analog zu
  iOS TestFlight). Firebase App Distribution wird bewusst **nicht** genutzt
  (Policy: kein Google-SDK).

## Nach Plugin-/Asset-Änderungen

`npx cap sync android` erneut ausführen — kopiert Web-Assets und gleicht die
nativen Plugin-Abhängigkeiten ab.
