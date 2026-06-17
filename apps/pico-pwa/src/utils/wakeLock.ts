// wakeLock.ts — Bildschirm während langer Operationen (z. B. 317k-Import) wachhalten.
//
// Screen Wake Lock API (Bordmittel, iOS 16.4+/Android-WebView/moderne Browser, KEIN
// Dependency). Fehlt sie oder wird sie verweigert: stiller No-Op-Fallback — dann greift
// nur der UI-Hinweis „Telefon anlassen". Reine WebView-API, kein Netz.

export interface WakeLockHandle {
  release(): Promise<void>
}

/** Fordert einen Screen-Wake-Lock an; liefert immer ein Handle (ggf. No-Op). */
export async function requestScreenWakeLock(): Promise<WakeLockHandle> {
  try {
    const sentinel = await navigator.wakeLock?.request('screen')
    if (sentinel) {
      return { release: () => sentinel.release().catch(() => {}) }
    }
  } catch {
    /* nicht verfügbar oder verweigert (z. B. App im Hintergrund) */
  }
  return { release: async () => {} }
}
