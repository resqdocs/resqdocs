# Android-Release: signieren, Play Store, F-Droid

Schritt-für-Schritt-Anleitung für ein **signiertes Release** der Android-App und
die Veröffentlichung im **Google Play Store** (inkl. Testnutzer) und bei
**F-Droid**. Bauen/Entwickeln im Alltag steht in [`android.md`](android.md);
diese Datei deckt nur das *Veröffentlichen* ab.

> Kein Ersatz für rechtliche Beratung. Pflichtangaben (Impressum/Datenschutz)
> separat prüfen.

## Voraussetzungen (Stand: bereits erfüllt)

- **Lizenz:** `LICENSE` = GPLv3 → erfüllt F-Droids FOSS-Pflicht.
- **Keine proprietären Abhängigkeiten:** Der Release-Dependency-Tree
  (`./gradlew :app:dependencies`) enthält **kein Firebase / play-services / GMS**
  (nur FOSS-Libs gson, Tink, guava). Der typische Capacitor→F-Droid-Blocker
  (firebase-messaging / play-services-location) greift hier **nicht**, weil keine
  Push-/Geolocation-Plugins genutzt werden.
- **Datenschutz-URL:** `https://resqdocs.app/datenschutz` (für Play „Data safety"
  + Store-Eintrag) und `https://resqdocs.app/impressum`.
- **App-ID:** `app.resqdocs`. Build-Tooling: JDK 21, Android SDK (Platform/
  Build-Tools 36), Gradle-Wrapper 8.14.3.

## Versionierung

In `apps/pico-pwa/android/app/build.gradle` → `defaultConfig`:
- `versionCode` — **ganze Zahl, muss bei JEDEM Play-Upload steigen** (1, 2, 3 …).
- `versionName` — sichtbarer Name (z. B. „1.0", „1.1").

Für den ersten Upload genügt `versionCode 1`. Danach vor jedem Release erhöhen.

## Signier-Konzept (kurz)

- **Play verlangt ein AAB** (`.aab`); APKs werden für den Store nicht mehr
  akzeptiert, und AABs erfordern **Play App Signing**.
- **Zwei-Schlüssel-Modell:** Du hältst lokal den **Upload-Key** (im Keystore) und
  signierst damit. Google re-signiert mit dem von Google verwahrten
  **App-Signing-Key**. Upload-Key verloren ⇒ über Google-Support zurücksetzbar —
  trotzdem Keystore + Passwörter **sichern**.
- **F-Droid/Sideload:** **`.apk`**, mit deinem eigenen Key signiert.

Keystore-Dateien (`*.jks`, `*.keystore`, `keystore.properties`) sind in
`apps/pico-pwa/android/.gitignore` ausgeschlossen — **niemals einchecken**.

---

## Weg A — Android Studio (GUI)

1. **Projekt aktuell machen & öffnen** (Terminal):
   ```bash
   cd ~/ResQDocs && git checkout dev && git pull && \
   cd apps/pico-pwa && npm install && npm run build && \
   npx cap sync android && npx cap open android
   ```
   `npm run build` + `npx cap sync android` **vor** dem Öffnen — sonst landet ein
   veralteter/leerer Web-Stand im Release. Auf „Gradle sync finished" warten.

2. **Version** in `app/build.gradle` setzen (s. o.), ggf. „Sync Now".

3. Menü **Build → Generate Signed App Bundle / APK…**
   - Play Store: **Android App Bundle** → **Next**
   - (F-Droid/Sideload später nochmal mit **APK**)

4. **Keystore anlegen** (nur beim allerersten Mal): „Key store path" → **Create
   new…**
   - **Key store path:** außerhalb des Repos, z. B. `~/keys/resqdocs-upload.jks`
   - **Password** + Confirm
   - **Alias:** `resqdocs-upload`, **Key Password** (darf gleich sein)
   - **Validity (years):** **30**
   - **Certificate:** Name, Organization = „your-organization",
     Ort, Bundesland, **Country Code = DE**
   - **OK** → **Next**

5. Build-Variante **release** → **Finish**. Ergebnis:
   `apps/pico-pwa/android/app/release/app-release.aab`.

## Weg B — CLI (reproduzierbar, optional)

Einmalig `keystore.properties` neben `app/` anlegen (oder im `~/.gradle/`), **nicht
einchecken**:
```properties
storeFile=your-keystore-path/upload.jks
storePassword=DEIN_KEYSTORE_PASSWORT
keyAlias=resqdocs-upload
keyPassword=DEIN_KEY_PASSWORT
```
Keystore per `keytool` erzeugen (Alternative zum GUI-Dialog):
```bash
keytool -genkey -v -keystore ~/keys/resqdocs-upload.jks \
  -alias resqdocs-upload -keyalg RSA -keysize 2048 -validity 10950
```
In `app/build.gradle` einen geschützten `signingConfig` ergänzen (greift nur, wenn
`keystore.properties` existiert):
```gradle
// oben, vor android { }
def keystoreProps = new Properties()
def keystoreFile = rootProject.file("keystore.properties")
if (keystoreFile.exists()) { keystoreProps.load(new FileInputStream(keystoreFile)) }

android {
  signingConfigs {
    release {
      if (keystoreFile.exists()) {
        storeFile file(keystoreProps['storeFile'])
        storePassword keystoreProps['storePassword']
        keyAlias keystoreProps['keyAlias']
        keyPassword keystoreProps['keyPassword']
      }
    }
  }
  buildTypes {
    release {
      if (keystoreFile.exists()) { signingConfig signingConfigs.release }
      // … bestehende minifyEnabled/proguard-Zeilen bleiben
    }
  }
}
```
Bauen:
```bash
cd apps/pico-pwa && npm run build && npx cap sync android && cd android
./gradlew bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab  (Play)
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk     (F-Droid/Sideload)
```

---

## Google Play Store

1. **Play-Console-Konto** (einmalig 25 $). App anlegen (Name, Sprache, kostenlos).
2. **Store-Eintrag**: Beschreibung, Grafiken, Kategorie; **Datenschutz-URL** =
   `https://resqdocs.app/datenschutz`.
3. **Data-safety-Formular** (Pflicht, **auch wenn nichts erhoben wird**):
   „keine Daten erhoben/geteilt" deklarieren — erscheint sichtbar im Store.
4. **Content-Rating**, Zielgruppe, App-Inhalte ausfüllen.
5. **AAB hochladen** (Testing- oder Production-Track). Beim ersten Upload in
   **Play App Signing** aufnehmen lassen (bestätigen).

### Testnutzer (wichtig für neue Konten)

- Tracks: **Internal** (schnell, bis 100 Tester) · **Closed** · **Open**.
- ⚠️ **Neue persönliche Konten** (erstellt nach 13.11.2023): vor dem
  Produktions-Zugang ein **Closed Test mit mind. 12 Testern**, die **14
  zusammenhängende Tage opted-in** sind (war 20, seit 11.12.2024 = 12).
  Organisations-Konten sind ausgenommen.
- **Tester einladen:** Track → „Testers" → E-Mail-Liste **oder** Google-Group
  (`name@googlegroups.com`) → speichern. **Opt-in-Link** kopieren und teilen.
- **Jeder Tester muss** den Link öffnen, sich anmelden und **„Become a tester"**
  klicken — sonst zählt er nicht und sieht die App nicht.
- Feedback-Kanal (E-Mail/URL) im Track hinterlegen.

---

## F-Droid

**Voraussetzungen — bei diesem Projekt erfüllt:** öffentliches Quell-Repo, FOSS-
Lizenz (GPLv3), nur FOSS-Abhängigkeiten (kein GMS, s. o.). F-Droid verteilt
**APK**, nicht AAB.

**Verbleibende Hürde:** F-Droid **baut selbst reproduzierbar aus dem Quellcode** —
der npm/JS-Build (Vite) muss auf deren Buildserver laufen. Das ist der knifflige
Teil bei Capacitor-Apps.

Zwei Wege:

1. **Offizielles F-Droid-Repo** (mehr Aufwand, größere Reichweite):
   - Metadaten-YAML aus Template (`templates/build-gradle.yml`) erstellen, Build-
     Rezept (npm-`prebuild` + Gradle) eintragen.
   - Lokal prüfen: `fdroid readmeta`, `fdroid lint`, `fdroid build -v -l app.resqdocs`.
   - **Merge-Request** im `fdroiddata`-GitLab; nach Merge 24–48 h bis sichtbar.

2. **Eigenes F-Droid-Repo** (einfachster Start):
   - Signierte `.apk` selbst hosten (z. B. via **Repomaker** oder `fdroid server`).
   - Umgeht die Reproducible-Build-Review; Nutzer fügen deine Repo-URL in den
     F-Droid-Client ein.

---

## Checkliste pro Release

- [ ] `versionCode` erhöht (für Play), `versionName` gesetzt
- [ ] `npm run build && npx cap sync android` ausgeführt
- [ ] AAB (Play) bzw. APK (F-Droid) signiert gebaut
- [ ] Play: Data-safety/Datenschutz-URL aktuell, Release im passenden Track
- [ ] Keystore + Passwörter gesichert (Backup)

## Quellen

- Sign your app — <https://developer.android.com/studio/publish/app-signing>
- Use Play App Signing — <https://support.google.com/googleplay/android-developer/answer/9842756>
- Data safety section — <https://support.google.com/googleplay/android-developer/answer/10787469>
- Testanforderungen neue persönliche Konten (12 Tester/14 Tage) — <https://support.google.com/googleplay/android-developer/answer/14151465>
- Open/Closed/Internal-Test einrichten — <https://support.google.com/googleplay/android-developer/answer/9845334>
- F-Droid Inclusion How-To — <https://f-droid.org/docs/Inclusion_How-To/>
- F-Droid Reproducible Builds — <https://f-droid.org/docs/Reproducible_Builds/>
- F-Droid Build Metadata Reference — <https://f-droid.org/docs/Build_Metadata_Reference/>
- Capacitor/F-Droid (GMS-Transitivdeps) — <https://github.com/ionic-team/capacitor/discussions/3443>
