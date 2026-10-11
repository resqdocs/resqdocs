import { Capacitor } from '@capacitor/core'
import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from '@/pico/httpAdapter'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { APP_VERSION_URL, createAppUpdateNotice, type AppUpdateNotice, type StorePlatform } from './appUpdateNotice'

/**
 * Singleton-Anbindung des App-Update-Hinweises (Muster usePznNotice): Dialog, Einstellungen und
 * App.vue teilen denselben Zustand. Logik (testbar): appUpdateNotice.ts.
 * Abruf ueber CapacitorHttp (nativer HTTP-Layer, kein CORS); im Web wird nie geprueft.
 */
let shared: AppUpdateNotice | null = null

export function useAppUpdateNotice(): AppUpdateNotice {
  if (!shared) {
    const storage = useStorage()
    shared = createAppUpdateNotice({
      platform: () => {
        if (!Capacitor.isNativePlatform()) return null
        const p = Capacitor.getPlatform()
        return p === 'ios' || p === 'android' ? (p as StorePlatform) : null
      },
      enabled: () => storage.settings.appUpdateCheck,
      currentVersion: async () => {
        try {
          const { App } = await import('@capacitor/app')
          return (await App.getInfo()).version
        } catch {
          return null
        }
      },
      fetchLatest: async () => {
        // Neutraler User-Agent: ohne ihn schickt Android Geraetemodell + Android-Version mit, iOS die
        // Systemversion (Datenminimierung, Datenschutzerklaerung: "keine Geraetedaten").
        const res = await capacitorHttpAdapter.get(APP_VERSION_URL, {
          connectTimeout: 8000,
          readTimeout: 8000,
          headers: { 'User-Agent': 'ResQDocs' },
        })
        if (res.status < 200 || res.status >= 300) return null
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      },
      kv: preferencesAdapter,
    })
  }
  return shared
}
