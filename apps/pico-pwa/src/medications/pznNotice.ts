import { computed, ref } from 'vue'

/**
 * Hinweis "neue PZN-Datenbank verfuegbar" (#11-Folge), pure/testbare Logik.
 *
 * Zwei Modi - die Vite-/Singleton-Anbindung lebt in usePznNotice.ts:
 *  - STANDARD (kein Netz): lokaler Alters-Hinweis. Erscheint, wenn das lokal
 *    gecachte Woerterbuch aelter als PZN_STALE_AFTER_MS ist. Braucht KEINEN
 *    Remote-Abruf - die SECURITY.md-Zusage (Sync nutzerinitiiert, einziger
 *    Remote-Abruf neben der Bridge) bleibt unveraendert wahr.
 *  - OPT-IN (autoCheckEnabled): zusaetzlich ein gedrosselter Hintergrund-Abruf
 *    NUR der Manifest-Version (fetchRemoteVersion). Zeigt dann praezise, dass
 *    eine echte neue Version vorliegt.
 *
 * Aktualisiert wird in beiden Faellen NUR ueber den bewussten Sync (Banner-
 * Button -> lookup.syncNow()).
 */

/** Daten gelten nach dieser Spanne als "alt" -> lokaler Hinweis (ohne Netz). */
export const PZN_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/** Min. Abstand zwischen Hintergrund-Versionsabrufen (nur Opt-in), gegen Spam. */
export const PZN_CHECK_THROTTLE_MS = 60 * 60 * 1000

interface Deps {
  /** Aktueller lokaler Stand des Woerterbuchs. */
  getState: () => { version: number | null; fetchedAt: string | null }
  /** Opt-in-Schalter (reaktiv gelesen). */
  autoCheckEnabled: () => boolean
  /** Nur-Manifest-Versionsabruf; null bei Fehler/unbekannt. */
  fetchRemoteVersion: () => Promise<number | null>
  now?: () => number
}

export function createPznNotice(deps: Deps) {
  const now = deps.now ?? (() => Date.now())

  const dismissed = ref(false) // pro Sitzung; naechster App-Start zeigt erneut
  const remoteVersion = ref<number | null>(null) // bestaetigte Version (nur Opt-in)
  let lastCheck = 0
  let checking = false

  /** Alter des lokalen Caches in ms; null wenn nie synchronisiert. */
  const ageMs = computed(() => {
    const { fetchedAt } = deps.getState()
    if (!fetchedAt) return null
    const t = Date.parse(fetchedAt)
    return Number.isNaN(t) ? null : now() - t
  })

  /** Lokaler Alters-Hinweis: nur wenn schon einmal synchronisiert wurde. */
  const stale = computed(() => ageMs.value !== null && ageMs.value >= PZN_STALE_AFTER_MS)

  /** Per Manifest bestaetigte neuere Version (nur Opt-in). */
  const newerAvailable = computed(() => {
    const { version } = deps.getState()
    return remoteVersion.value !== null && version !== null && remoteVersion.value > version
  })

  const reason = computed<'newer' | 'stale' | null>(() =>
    newerAvailable.value ? 'newer' : stale.value ? 'stale' : null,
  )
  const visible = computed(() => reason.value !== null && !dismissed.value)

  /**
   * Optionaler Hintergrund-Check (fire-and-forget). Tut NICHTS ohne Opt-in.
   * Gedrosselt; Fehler werden geschluckt (darf nie stoeren - Policy).
   */
  async function maybeCheck(): Promise<void> {
    if (!deps.autoCheckEnabled()) return
    if (checking || now() - lastCheck < PZN_CHECK_THROTTLE_MS) return
    checking = true
    try {
      const v = await deps.fetchRemoteVersion()
      if (v !== null) remoteVersion.value = v
    } catch {
      // still: Hintergrund-Check darf nie stoeren (kein Logging, Policy)
    } finally {
      // Drossel auch im Fehlerfall setzen: ein temporaerer Netzfehler darf NICHT
      // sofort einen erneuten Manifest-Abruf ausloesen.
      lastCheck = now()
      checking = false
    }
  }

  function dismiss(): void {
    dismissed.value = true
  }

  /** Nach erfolgreichem Sync aufrufen: Hinweis verschwindet (Stand ist frisch). */
  function reset(): void {
    dismissed.value = false
    remoteVersion.value = null
    lastCheck = now()
  }

  return { visible, reason, stale, remoteVersion, maybeCheck, dismiss, reset }
}

export type PznNotice = ReturnType<typeof createPznNotice>
