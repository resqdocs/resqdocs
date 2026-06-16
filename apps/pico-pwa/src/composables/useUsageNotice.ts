import { ref } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'

/**
 * „Hinweis zur Nutzung" — allgemeiner Nutzungs-/Haftungshinweis.
 *
 * Erscheint EINMALIG beim ersten App-Start (bis bestätigt) und ist danach jederzeit
 * erneut aufrufbar (Einstellungen → Info & Hilfe). Bewusst getrennt vom build-
 * gebundenen Haftungs-Gate (useDisclaimer, erscheint nach jedem Update erneut):
 * dieser Hinweis wird nur einmal bestätigt.
 *
 * Persistenz über den Preferences-Adapter (eigener Key, kein roher Browser-Storage,
 * keine neue Abhängigkeit) — es werden KEINE Patientendaten gespeichert, nur ein Flag.
 */
export const USAGE_NOTICE_KEY = 'usage.noticeAccepted'

let shared: ReturnType<typeof create> | null = null

function create() {
  const ready = ref(false)
  const accepted = ref(false)
  const visible = ref(false)

  async function init(): Promise<void> {
    try {
      accepted.value = (await preferencesAdapter.get(USAGE_NOTICE_KEY)) === 'true'
    } catch {
      accepted.value = false
    } finally {
      ready.value = true
    }
  }

  /** Beim Start aufrufen: zeigt den Hinweis, falls noch nie bestätigt. */
  function checkFirstStart(): void {
    if (ready.value && !accepted.value) visible.value = true
  }

  /** Erneut anzeigen (Einstellungen → „Hinweis zur Nutzung"). */
  function show(): void {
    visible.value = true
  }

  /** „Verstanden": Hinweis schließen und dauerhaft als bestätigt merken. */
  async function acknowledge(): Promise<void> {
    visible.value = false
    accepted.value = true
    await preferencesAdapter.set(USAGE_NOTICE_KEY, 'true')
  }

  void init()

  return { ready, accepted, visible, checkFirstStart, show, acknowledge }
}

export function useUsageNotice() {
  if (!shared) shared = create()
  return shared
}
