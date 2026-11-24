// bridgeWifiJoin.ts — reine Logik hinter „Mit Bridge-WLAN verbinden“ (testbar, ohne Capacitor).
//
// Das native Plugin (bridgeWifi.ts) bittet das System, das Handy mit dem WLAN der Bridge zu verbinden.
// Hier wird nur zugeordnet: Was hat das System geantwortet, und ist die Bridge danach wirklich erreichbar?
// „Verbunden“ heißt erst, wenn die Bridge antwortet; die Antwort des Systems allein reicht dafür nicht
// (iOS meldet auch dann Erfolg, wenn kein passendes WLAN in Reichweite war).

/** Das WLAN jeder Bridge heißt „ResQDocs-<ID>“. Die ID kennt die App erst nach der ersten Verbindung. */
export const BRIDGE_WIFI_PREFIX = 'ResQDocs-'
/** Für alle Bridges gleich und bewusst öffentlich (steht auch in der Anleitung). Kein Einsatzinhalt. */
export const BRIDGE_WIFI_PASSWORD = 'resqdocs2026'

export type BridgeWifiResult =
  | { status: 'connected' }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }

export interface NativeJoinReply {
  status?: string
  detail?: string
}
export interface NativeWifiStatus {
  supported?: boolean
  held?: boolean
}
export interface BridgeWifiNative {
  join(options: { ssidPrefix: string; passphrase: string }): Promise<NativeJoinReply>
  leave(): Promise<void>
  status(): Promise<NativeWifiStatus>
}

export interface JoinDeps {
  /** Capacitor.getPlatform(): 'ios' | 'android' | 'web' */
  platform: string
  native: BridgeWifiNative
  /** Erreichbarkeit der Bridge prüfen (useBridgeConnection.check). */
  check: (force: boolean) => Promise<boolean>
  wait: (ms: number) => Promise<void>
  now: () => number
}

/** Nach dem Beitritt braucht das Handy einen Moment für seine Adresse: so lange wird die Bridge gefragt. */
export const JOIN_WAIT_MS = 8000
export const JOIN_CHECK_PAUSE_MS = 800

export const MSG_WIFI_OFF = 'WLAN ist aus. Bitte einschalten.'
export const MSG_NO_BRIDGE = 'Die Bridge antwortet nicht. Steckt sie im Zielgerät?'
export const MSG_FAILED = 'Hat nicht geklappt. Bitte von Hand verbinden.'
/** iOS findet kein WLAN mit dem Namensanfang und meldet dann nur „unknown“ (am Gerät beobachtet, ohne Bridge). */
export const MSG_NO_WIFI_FOUND = 'Kein Bridge-WLAN gefunden. Steckt die Bridge im Zielgerät?'

export function isNativePlatform(platform: string): boolean {
  return platform === 'ios' || platform === 'android'
}

/** Capacitor meldet ein fehlendes Plugin mit dem Code UNIMPLEMENTED (ältere App-Hülle, Browser). */
function isUnimplemented(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'UNIMPLEMENTED'
}

/** Fehlertext für die Anzeige; der kurze Systemcode in Klammern hilft bei der Fehlersuche am Gerät. */
export function failedMessage(detail?: string): string {
  const code = (detail ?? '').trim().slice(0, 40)
  return code ? `${MSG_FAILED} (${code})` : MSG_FAILED
}

async function bridgeAnswers(deps: JoinDeps): Promise<boolean> {
  const start = deps.now()
  for (;;) {
    if (await deps.check(true)) return true
    if (deps.now() - start >= JOIN_WAIT_MS) return false
    await deps.wait(JOIN_CHECK_PAUSE_MS)
  }
}

/** Beitritt anstoßen und das Ergebnis zuordnen. Wirft nicht. */
export async function joinBridgeWifiWith(deps: JoinDeps): Promise<BridgeWifiResult> {
  if (!isNativePlatform(deps.platform)) return { status: 'unsupported' }
  let reply: NativeJoinReply
  try {
    reply = await deps.native.join({ ssidPrefix: BRIDGE_WIFI_PREFIX, passphrase: BRIDGE_WIFI_PASSWORD })
  } catch (error) {
    return isUnimplemented(error) ? { status: 'unsupported' } : { status: 'error', message: MSG_FAILED }
  }
  switch (reply?.status) {
    case 'unsupported':
      return { status: 'unsupported' }
    case 'cancelled':
      return { status: 'cancelled' }
    case 'wifiOff':
      return { status: 'error', message: MSG_WIFI_OFF }
    case 'connected': // Android: das Netz steht
    case 'applied': // iOS: Konfiguration angenommen, das Netz steht vielleicht
      return (await bridgeAnswers(deps)) ? { status: 'connected' } : { status: 'error', message: MSG_NO_BRIDGE }
    default:
      // iOS sucht bei einem Namensanfang erst nach einem passenden Netz. Findet es keins, kommt ohne Rückfrage
      // der Fehler „unknown“: Das ist der Normalfall „Bridge nicht eingesteckt“ und bekommt einen klaren Satz.
      if (deps.platform === 'ios' && reply?.status === 'failed' && reply.detail === 'unknown') return { status: 'error', message: MSG_NO_WIFI_FOUND }
      return { status: 'error', message: failedMessage(reply?.detail) }
  }
}

/** Kann dieses Gerät direkt beitreten, und hält die App gerade das Bridge-WLAN? Wirft nicht. */
export async function wifiStatusWith(platform: string, native: BridgeWifiNative): Promise<Required<NativeWifiStatus>> {
  if (!isNativePlatform(platform)) return { supported: false, held: false }
  try {
    const s = await native.status()
    return { supported: s?.supported === true, held: s?.held === true }
  } catch {
    return { supported: false, held: false }
  }
}
