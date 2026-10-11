import { computed, ref } from 'vue'
import type { KeyValueAdapter } from '../storage/types.ts'

/**
 * Hinweis "neue App-Version im Store", pure/testbare Logik. Die Capacitor-Anbindung lebt in
 * useAppUpdateNotice.ts.
 *
 * Quelle ist eine kleine statische Datei auf resqdocs.app ({ "ios": "1.7.1", "android": "1.7.1" }).
 * Sie wird erst angehoben, wenn die Version im jeweiligen Store nachweislich live ist; eine
 * gestaffelte Freigabe (iOS spaeter als Android) stoert deshalb nicht.
 *
 * Netzwerk-Policy (SECURITY.md): ein Abruf bei jedem Oeffnen der App (Start und Rueckkehr in den
 * Vordergrund, Maintainer-Entscheid), nur diese Datei, keine Kennung, keine Nutzdaten. Default an,
 * abschaltbar (settings.appUpdateCheck). Fehler werden still geschluckt - der Hinweis darf nie stoeren.
 */

export const APP_VERSION_URL = 'https://resqdocs.app/app-version.json'

/** Preferences-Schluessel fuer den letzten erfolgreichen Abruf (Zeitpunkt + gemeldete Version). */
export const APP_UPDATE_CACHE_KEY = 'app.updateCheck'

/** Preferences-Schluessel fuer „nicht mehr anzeigen bis zur naechsten Version" (die uebersprungene Version). */
export const APP_UPDATE_SKIP_KEY = 'app.updateSkippedVersion'

export type StorePlatform = 'ios' | 'android'

export const STORE_URLS: Record<StorePlatform, string> = {
  ios: 'https://apps.apple.com/app/your-app-store-id',
  android: 'https://play.google.com/store/apps/details?id=com.example.resqdocs',
}

/** "1.7.1" -> [1, 7, 1]; alles andere (Vorabversionen, Muell) -> null. */
export function parseVersion(v: unknown): number[] | null {
  if (typeof v !== 'string' || !/^\d+(\.\d+){0,3}$/.test(v)) return null
  return v.split('.').map(Number)
}

/**
 * true, wenn `latest` numerisch groesser als `current` ist ("1.10.0" > "1.9.3"). Die installierte
 * Version darf ein Suffix tragen (Test-Builds: "1.7.0-debug", "1.7.1-r8test"), die Store-Version nicht.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(/^\d+(\.\d+){0,3}/.exec(current)?.[0])
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/** Version der eigenen Plattform aus der Server-Antwort; ungueltig -> null. */
export function pickVersion(data: unknown, platform: StorePlatform): string | null {
  if (!data || typeof data !== 'object') return null
  const v = (data as Record<string, unknown>)[platform]
  return parseVersion(v) ? (v as string) : null
}

interface Cache {
  checkedAt: number
  latest: string | null
}

interface Deps {
  /** 'ios' | 'android' in der nativen App, null im Web (dort nie pruefen). */
  platform: () => StorePlatform | null
  /** Schalter aus den Einstellungen (reaktiv gelesen). */
  enabled: () => boolean
  /** Installierte App-Version (nativ: App.getInfo().version); null bei Fehler. */
  currentVersion: () => Promise<string | null>
  /** Abruf der Versionsdatei, bereits als JSON-Objekt; darf werfen. */
  fetchLatest: () => Promise<unknown>
  kv: KeyValueAdapter
  now?: () => number
}

export function createAppUpdateNotice(deps: Deps) {
  const now = deps.now ?? (() => Date.now())

  const current = ref<string | null>(null)
  const latest = ref<string | null>(null) // zuletzt gemeldete Store-Version der eigenen Plattform
  const dismissed = ref(false) // „Später": pro Sitzung; der naechste App-Start zeigt erneut
  const skipped = ref<string | null>(null) // „nicht mehr anzeigen": bis eine neuere Version erscheint (persistiert)
  let checking = false

  const visible = computed(
    () =>
      deps.enabled() &&
      !dismissed.value &&
      latest.value !== null &&
      current.value !== null &&
      isNewer(latest.value, current.value) &&
      (skipped.value === null || isNewer(latest.value, skipped.value)),
  )

  const platform = computed(() => deps.platform())
  const storeUrl = computed(() => (platform.value ? STORE_URLS[platform.value] : null))

  async function readCache(): Promise<Cache | null> {
    try {
      const raw = await deps.kv.get(APP_UPDATE_CACHE_KEY)
      if (!raw) return null
      const c = JSON.parse(raw) as Partial<Cache>
      if (typeof c.checkedAt !== 'number') return null
      return { checkedAt: c.checkedAt, latest: parseVersion(c.latest) ? (c.latest as string) : null }
    } catch {
      return null
    }
  }

  /**
   * Beim App-Start und bei jeder Rueckkehr in den Vordergrund aufrufen (fire-and-forget). Zeigt sofort
   * den zuletzt bekannten Stand (auch offline) und ruft dann die Datei ab. Laeuft schon ein Abruf,
   * passiert nichts.
   */
  async function maybeCheck(): Promise<void> {
    const p = deps.platform()
    if (!p || !deps.enabled() || checking) return
    checking = true
    try {
      current.value ??= await deps.currentVersion()
      // Vor dem Stand aus dem Speicher lesen, sonst blitzt eine uebersprungene Version kurz auf.
      try {
        const s = await deps.kv.get(APP_UPDATE_SKIP_KEY)
        skipped.value = parseVersion(s) ? s : null
      } catch {
        // still
      }
      const cached = await readCache()
      if (cached?.latest) latest.value ??= cached.latest

      let fresh: string | null = null
      try {
        fresh = pickVersion(await deps.fetchLatest(), p)
      } catch {
        // still: Netzfehler/Offline duerfen nie stoeren; der letzte bekannte Stand bleibt
      }
      if (!fresh) return
      latest.value = fresh
      const next: Cache = { checkedAt: now(), latest: fresh }
      await deps.kv.set(APP_UPDATE_CACHE_KEY, JSON.stringify(next))
    } catch {
      // still (Policy)
    } finally {
      checking = false
    }
  }

  /** Schliessen. `untilNextVersion`: die angezeigte Version merken und erst bei einer neueren wieder zeigen. */
  async function dismiss(untilNextVersion = false): Promise<void> {
    dismissed.value = true
    if (!untilNextVersion || !latest.value) return
    skipped.value = latest.value
    try {
      await deps.kv.set(APP_UPDATE_SKIP_KEY, latest.value)
    } catch {
      // still: dann gilt es wenigstens fuer diese Sitzung
    }
  }

  return { visible, current, latest, platform, storeUrl, maybeCheck, dismiss }
}

export type AppUpdateNotice = ReturnType<typeof createAppUpdateNotice>
