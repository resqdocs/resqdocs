import { useStorage } from '@/storage/useStorage'
import { capacitorHttpAdapter } from '@/pico/httpAdapter'
import { createPicoClient } from '@/pico/picoClient'
import type { OsMode } from '@/pico/picoTypes'

/**
 * Einsatz-Send an die Pico-Bridge. Dünner Wrapper um die gekapselte Pico-Schicht
 * (`@/pico/picoClient`) — eine HTTP-Implementierung, eine konfigurierbare
 * Base-URL (App-Einstellung `picoBaseUrl`, S2-Default 10.10.10.1). UI-Komponenten
 * greifen nur über dieses Composable zu; keine Patientendaten in URL/Logs.
 */
export type { OsMode }

export interface PicoApiOptions {
  /** Base-URL überschreiben; sonst die App-Einstellung `picoBaseUrl`. */
  host?: string
}

export function usePicoApi(options: PicoApiOptions = {}) {
  const storage = useStorage()
  const baseUrl = (): string => options.host ?? storage.settings.picoBaseUrl
  const client = createPicoClient(capacitorHttpAdapter, baseUrl)

  /** Sendet den Text an die Bridge (USB-HID). Text nur transient im Body.
   * delayMs = Tippgeschwindigkeit (ms/Zeichen) aus den Einstellungen; fehlt → Firmware-Default. */
  async function typeText(text: string, os: OsMode = 'win_de', delayMs?: number): Promise<void> {
    await client.typeText({ text, os, delayMs })
  }

  /** Prüft die Erreichbarkeit der Bridge (für die Verbindungsanzeige). */
  async function isReachable(): Promise<boolean> {
    return client.health()
  }

  return { typeText, isReachable }
}
