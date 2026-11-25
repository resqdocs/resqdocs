// targetDevice.ts — Zielgerät aus den Einstellungen (settings.defaultOs), ohne Abhängigkeit von Capacitor.
//
// Neben den Geräten, in die die Bridge tippt (win_de, mac_de, ios), gibt es „Dieses Gerät“: Dokumentiert wird auf
// dem Gerät, auf dem auch die App läuft. Dann braucht es keine Bridge, der Protokolltext wechselt nur zwischen zwei
// Apps. Nur in diesem Fall bietet der Einsatz „Protokolltext kopieren“ an (Ausnahme von der Regel, dass der
// Protokolltext die App nur über die Bridge verlässt). Der Wert geht nie an die Bridge: Sie würde einen
// unbekannten Wert stillschweigend als Windows tippen.
import type { OsMode } from './picoTypes'

/** Wert in settings.defaultOs für „Dieses Gerät“. */
export const THIS_DEVICE = 'this_device'

const BRIDGE_OS: readonly OsMode[] = ['win_de', 'mac_de', 'ios']

/** true, wenn als Zielgerät „Dieses Gerät“ gewählt ist. */
export function isThisDevice(os: unknown): boolean {
  return os === THIS_DEVICE
}

/** Das Gerät, für das die Bridge tippt: ein bekanntes Bridge-Ziel, sonst (auch bei „Dieses Gerät“) Windows DE. */
export function bridgeOs(os: unknown): OsMode {
  return BRIDGE_OS.includes(os as OsMode) ? (os as OsMode) : 'win_de'
}
