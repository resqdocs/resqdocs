import { ref } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'

/**
 * Hinweis beim Start (Haftung und Nutzung in EINEM Dialog, DisclaimerGate).
 *
 * Zeigt den Hinweis beim ERSTEN Öffnen der App und erneut nur, wenn sich sein TEXT geändert hat. Mechanik:
 * DISCLAIMER_TEXT_VERSION gehört zum Wortlaut in DisclaimerGate.vue. Bestätigt der Nutzer, wird genau diese
 * Textversion gespeichert. Stimmt sie beim Start nicht mit der aktuellen überein (Text geändert oder noch nie
 * bestätigt), muss erneut bestätigt werden. Ein neuer Build mit unverändertem Text fragt nicht erneut.
 * Wer den Text ändert, hebt die Textversion an; der Wächter disclaimerGate.test.ts erzwingt das.
 *
 * Früher hing die Wiedervorlage an der Build-Kennung (Version + Bauzeit). Dort steht bei bisherigen Nutzern
 * noch eine Build-Kennung, die nie einer Textversion gleicht: Sie sehen den zusammengelegten Hinweis nach dem
 * Update genau einmal.
 *
 * Persistenz über den Preferences-Adapter (App-Container, übersteht Updates), keine neue Abhängigkeit, kein
 * roher Browser-Storage. Gespeichert wird nur die bestätigte Textversion, keine Patientendaten.
 *
 * Zusätzlich lässt sich der Hinweis zum Lesen öffnen (Einstellungen → Info & Hilfe): `reading`, ohne Sperre.
 */
export const DISCLAIMER_ACK_KEY = 'disclaimer.acknowledgedBuild'

/** Version des Wortlauts in DisclaimerGate.vue. Nur anheben, wenn sich der Text ändert. */
export const DISCLAIMER_TEXT_VERSION = 'hinweis-2026-11-23'

let shared: ReturnType<typeof create> | null = null

function create() {
  // ready: Persistenz-Stand geladen. needsAck: Hinweis muss (erneut) bestätigt werden. Bewusst erst nach
  // `ready` anzeigen, damit Rückkehrer kein Aufblitzen des Hinweises sehen (lokaler Lesezugriff ist schnell).
  const ready = ref(false)
  const needsAck = ref(false)
  // Zum Lesen geöffnet (Einstellungen): derselbe Dialog mit „Schließen“ statt Bestätigen.
  const reading = ref(false)

  async function init(): Promise<void> {
    try {
      const acknowledged = await preferencesAdapter.get(DISCLAIMER_ACK_KEY)
      needsAck.value = acknowledged !== DISCLAIMER_TEXT_VERSION
    } catch {
      // Im Zweifel anzeigen: der Hinweis soll lieber einmal zu viel erscheinen.
      needsAck.value = true
    } finally {
      ready.value = true
    }
  }

  async function acknowledge(): Promise<void> {
    needsAck.value = false
    await preferencesAdapter.set(DISCLAIMER_ACK_KEY, DISCLAIMER_TEXT_VERSION)
  }

  function show(): void {
    reading.value = true
  }
  function close(): void {
    reading.value = false
  }

  void init()

  return { ready, needsAck, reading, acknowledge, show, close }
}

export function useDisclaimer() {
  if (!shared) shared = create()
  return shared
}
