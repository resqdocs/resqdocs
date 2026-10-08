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
  plugins: {
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
