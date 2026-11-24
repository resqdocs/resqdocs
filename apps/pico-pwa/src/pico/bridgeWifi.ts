// bridgeWifi.ts — „Mit Bridge-WLAN verbinden“: das Handy tritt dem WLAN der Bridge direkt aus der App bei.
//
// Eigenes Mini-Plugin ResQBridgeWifi (android/.../BridgeWifiPlugin.kt, ios/App/App/BridgeWifiPlugin.swift),
// kein Fremdpaket: Die geprüften Capacitor-Plugins verlangen alle die Standortberechtigung, dieser Weg nicht.
//   iOS:     das System fragt einmal nach und merkt sich das Netz (NEHotspotConfiguration, Präfix „ResQDocs-“).
//   Android: ab Android 10 zeigt das System die passenden Netze zur Auswahl (WifiNetworkSpecifier). Das Netz
//            gehört dann nur dieser App. Solange sie es hält, läuft ihr ganzer Netzverkehr darüber, und das
//            Bridge-WLAN hat kein Internet. „Bridge-WLAN trennen“ (leave) gibt es wieder frei, sonst das
//            Ende der App oder das Verschwinden des Netzes.
// Im Browser und auf älteren Geräten gibt es den Weg nicht: „unsupported“, die Oberfläche zeigt dann nur
// „Von Hand verbinden“. Die Zuordnung der Ergebnisse steht in bridgeWifiJoin.ts (rein, getestet).
import { ref } from 'vue'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useBridgeConnection } from './useBridgeConnection'
import { joinBridgeWifiWith, wifiStatusWith, type BridgeWifiNative, type BridgeWifiResult } from './bridgeWifiJoin'

interface ResQBridgeWifiPlugin extends BridgeWifiNative {
  addListener(event: 'change', listener: (state: { held: boolean }) => void): Promise<PluginListenerHandle>
}

const ResQBridgeWifi = registerPlugin<ResQBridgeWifiPlugin>('ResQBridgeWifi')
const platform = Capacitor.getPlatform()

// Modul-State (Singleton): Dialog im Einsatz und Einstellungen → Bridge zeigen denselben Stand.
/** Kann dieses Gerät direkt beitreten? null = noch nicht gefragt. */
const supported = ref<boolean | null>(null)
/** Die App hält das Bridge-WLAN (Android: gebunden, iOS: als bekanntes Netz gemerkt). */
const held = ref(false)
const joining = ref(false)
let listening = false

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function refresh(): Promise<void> {
  const s = await wifiStatusWith(platform, ResQBridgeWifi)
  supported.value = s.supported
  held.value = s.held
}

function listen(): void {
  if (listening || !Capacitor.isNativePlatform()) return
  listening = true
  // Android meldet, wenn die Bindung entsteht oder wegfällt (Bridge abgezogen, außer Reichweite).
  void ResQBridgeWifi.addListener('change', (state) => {
    held.value = state.held === true
  }).catch(() => {
    listening = false
  })
}

export function useBridgeWifi() {
  const { check } = useBridgeConnection()

  /** Beitritt anstoßen. Danach wird sofort geprüft, ob die Bridge antwortet. Wirft nicht. */
  async function joinBridgeWifi(): Promise<BridgeWifiResult> {
    if (joining.value) return { status: 'cancelled' }
    joining.value = true
    try {
      listen()
      const result = await joinBridgeWifiWith({ platform, native: ResQBridgeWifi, check, wait, now: Date.now })
      await refresh()
      return result
    } finally {
      joining.value = false
    }
  }

  /** Bridge-WLAN wieder freigeben; die Anzeige der Verbindung zieht sofort nach. Wirft nicht. */
  async function leaveBridgeWifi(): Promise<void> {
    try {
      await ResQBridgeWifi.leave()
    } catch {
      /* nur nativ verfügbar */
    }
    await refresh()
    await check(true)
  }

  if (supported.value === null) void refresh()
  listen()

  return { supported, held, joining, joinBridgeWifi, leaveBridgeWifi }
}
