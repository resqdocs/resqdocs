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
}

export default config
