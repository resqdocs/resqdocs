// useAppVersion.ts — App-Version + native Build-Nummer für die dezente Anzeige in den
// Einstellungen. Quelle ist plattformabhängig:
//  - NATIV (iOS/Android): @capacitor/app App.getInfo() liefert die ECHTEN Store-Werte
//    (iOS CFBundleShortVersionString/CFBundleVersion, Android versionName/versionCode) →
//    Anzeige „<version> (<build>)", z. B. „0.2.0 (6)". Das ist der natürliche Unterscheider
//    zwischen Test- und Store-Builds derselben Version.
//  - WEB (kein nativer Layer, Dev/Preview): App.getInfo() existiert nicht → Fallback auf die
//    Build-Zeit-Kennung __APP_BUILD_ID__ ("x.y.z+<ISO>"), davon NUR die Version (ohne Build-Nr).
//
// Lädt asynchron; `display` aktualisiert sich reaktiv, sobald getInfo zurückkehrt. Wirft nie
// (kein leeres Feld, kein Crash) — bei jedem Fehler bleibt die Fallback-Version stehen.
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'

export function useAppVersion() {
  const fallbackVersion = __APP_BUILD_ID__.split('+')[0] // "0.1.2" aus "0.1.2+<ISO>"
  const version = ref(fallbackVersion)
  const build = ref<string | null>(null)
  const display = ref(fallbackVersion)

  async function load(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return // Web: nur die Fallback-Version, kein nativer Aufruf
    try {
      const { App } = await import('@capacitor/app')
      const info = await App.getInfo()
      version.value = info.version
      build.value = info.build
      display.value = info.build ? `${info.version} (${info.build})` : info.version
    } catch {
      // getInfo nicht verfügbar (Plugin/Plattform) → Fallback-Version bleibt bestehen.
    }
  }
  void load()

  return { version, build, display }
}
