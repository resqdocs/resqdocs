import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.resqdocs',
  appName: 'ResQDocs',
  webDir: 'dist',
  // Die App spricht den lokalen Pico über CapacitorHttp (nativer HTTP-Layer) an.
  // Cleartext-HTTP zur lokalen Bridge erfordert gezielte Plattformausnahmen,
  // ausschliesslich für den lokalen Pico-Kontext:
  //   - Android: Cleartext für den lokalen Host (network_security_config).
  //   - iOS: App-Transport-Security-Ausnahme für den lokalen Host.
  // Diese werden beim Hinzufuegen der nativen Plattformen (npx cap add ...)
  // eingerichtet und dokumentiert.
  ios: {
    // Die WebView selbst scrollt nie: gescrollt wird nur im Bereich des Tabs (App-Hülle). Mit dem Keyboard-Plugin
    // nimmt iOS damit auch jede Verschiebung der Seite beim Fokus in ein Feld sofort zurück; Kopfzeile und
    // Tab-Leiste bleiben stehen. Festgehalten in src/shell/tastatur.test.ts.
    scrollEnabled: false,
    // Keine Link-Vorschau der WebView bei langem Druck auf einen Link nach außen (Capacitor lässt sie sonst an).
    // Die Seite schaltet das Callout schon per CSS ab; so ist es auch auf nativer Seite aus.
    allowsLinkPreview: false,
  },
  android: {
    // Grund der WebView durchsichtig: Bis die Seite ihr erstes Bild zeichnet, sieht man den Hintergrund des
    // Fensters, und der hat die Farbe der App, hell wie dunkel (appChrome in res/values(-night)/colors.xml,
    // zur Laufzeit AppChromePlugin). Ohne diese Angabe ist die WebView weiß und blitzt im dunklen Thema nach dem
    // Startbild auf. Schreibweise #RRGGBBAA. iOS setzt die Farbe im nativen Code (AppDelegate.swift,
    // SplashBackground), weil eine WebView dort nicht durchsichtig ist.
    backgroundColor: '#00000000',
  },
  plugins: {
    // Bildschirmtastatur (@capacitor/keyboard). iOS: 'native' verkleinert die WebView um die Tastatur, wie Android
    // es von sich aus tut; damit gilt auf beiden dasselbe Modell (Layout endet über der Tastatur). Die Leiste ↑ ↓ ✓
    // über der Tastatur blendet das Plugin auf iOS von sich aus aus (Maintainer-Entscheidung, keine Einstellung nötig).
    // Android: Das Verkleinern übernimmt Capacitor (SystemBars); resizeOnFullScreen bleibt bewusst ungesetzt,
    // Capacitor warnt davor, es neben SystemBars zu verwenden. Das Plugin liefert dort nur die Ereignisse.
    Keyboard: {
      resize: 'native',
    },
    // Social Login dient nur der Google-Drive-Sicherung auf Android (iOS sichert über iCloud
    // und bindet das Plugin nicht ein). Ohne diese Liste bündelt das Plugin ALLE Anbieter,
    // unter anderem das Facebook-SDK. Der Plugin-Hook setzt sie bei `npx cap sync` in den
    // nativen Build um; abgeschaltete Anbieter sind auch zur Laufzeit gesperrt.
    // Festgehalten in src/backup/socialLoginScope.test.ts.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
  },
}

export default config
