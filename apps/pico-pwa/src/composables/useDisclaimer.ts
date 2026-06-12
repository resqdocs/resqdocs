import { ref } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'

/**
 * Haftungsausschluss-Gate.
 *
 * Zeigt den Hinweis beim ERSTEN Öffnen der App und nach JEDEM Update erneut.
 * Mechanik: Die zur Build-Zeit injizierte Build-Kennung (__APP_BUILD_ID__)
 * ändert sich mit jedem ausgelieferten Build. Bestätigt der Nutzer, wird genau
 * diese Kennung gespeichert. Stimmt die gespeicherte Kennung beim Start nicht
 * mit der aktuellen überein (neuer Build = Update, oder noch nie bestätigt),
 * muss erneut bestätigt werden.
 *
 * Persistenz über den Preferences-Adapter (App-Container, übersteht Updates) —
 * keine neue Abhängigkeit, kein roher Browser-Storage. Es werden KEINE
 * Patientendaten gespeichert, nur die bestätigte Build-Kennung.
 */
export const DISCLAIMER_ACK_KEY = 'disclaimer.acknowledgedBuild'

const CURRENT_BUILD_ID = __APP_BUILD_ID__

let shared: ReturnType<typeof create> | null = null

function create() {
  // ready: Persistenz-Stand geladen. needsAck: Hinweis muss (erneut) bestätigt
  // werden. Bewusst erst nach `ready` anzeigen, damit Rückkehrer kein Aufblitzen
  // des Gates sehen (lokaler Preferences-Lesezugriff ist schnell).
  const ready = ref(false)
  const needsAck = ref(false)

  async function init(): Promise<void> {
    try {
      const acknowledged = await preferencesAdapter.get(DISCLAIMER_ACK_KEY)
      needsAck.value = acknowledged !== CURRENT_BUILD_ID
    } catch {
      // Im Zweifel anzeigen — der Hinweis soll lieber einmal zu viel erscheinen.
      needsAck.value = true
    } finally {
      ready.value = true
    }
  }

  async function acknowledge(): Promise<void> {
    needsAck.value = false
    await preferencesAdapter.set(DISCLAIMER_ACK_KEY, CURRENT_BUILD_ID)
  }

  void init()

  return { ready, needsAck, acknowledge }
}

export function useDisclaimer() {
  if (!shared) shared = create()
  return shared
}
