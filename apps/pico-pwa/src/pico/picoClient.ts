// picoClient.ts — gekapselte Pico-HTTP-Logik (S2). Spricht NUR über den
// HttpAdapter → gegen einen Fake-Adapter testbar, ohne echte Netzwerkaufrufe.
//
// Datenschutz: Text ausschließlich im Body von POST /type (nie in der URL);
// Fehler werden auf den HTTP-Status normalisiert — KEIN Payload-Logging.
import type { HttpAdapter, OtaBeginResult, OtaManifest, PicoClient, PicoConfigResult, PicoStatus } from './picoTypes'

const CONNECT_TIMEOUT = 5000
const READ_TIMEOUT = 20000 // Tippen dauert (Per-Char-Delay) → großzügig (S2)
const HEALTH_TIMEOUT = 3000
const OTA_CHUNK_TIMEOUT = 10000 // LittleFS-Schreiben pro Chunk
const OTA_COMMIT_TIMEOUT = 30000 // SHA-256 + Ed25519 über ~400 KB auf dem Pico

/** Fallback, falls /ota/begin kein chunkMax liefert (Firmware-Default, #130). */
export const OTA_CHUNK_FALLBACK = 8192

/** Firmware-Puffergrenze pro /type-Request (docs/pico-api.md). Darüber chunkt die App. */
export const TYPE_CHUNK_LIMIT = 16384

/**
 * Code-point-sichere Chunks mit je maximal `limit` Zeichen. Die Firmware zählt
 * UTF-8-Zeichen (Code-Points), nicht UTF-16-Einheiten - Array.from iteriert
 * per Code-Point und zerreißt damit keine Surrogate-Paare (Emoji etc.).
 */
function chunkByCodePoints(text: string, limit: number): string[] {
  const cps = Array.from(text)
  if (cps.length <= limit) return [text]
  const chunks: string[] = []
  for (let i = 0; i < cps.length; i += limit) chunks.push(cps.slice(i, i + limit).join(''))
  return chunks
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300
}

/** Spiegelt die serverseitige Validierung der Firmware (ConfigStore): ^[A-Za-z0-9_-]{1,23}$ */
export function isValidSsidId(ssidId: string): boolean {
  return /^[A-Za-z0-9_-]{1,23}$/.test(ssidId)
}

function parseStatus(data: unknown): PicoStatus {
  const o = typeof data === 'string' ? JSON.parse(data) : data
  if (!o || typeof o !== 'object') throw new Error('Ungültige Status-Antwort')
  const r = o as Record<string, unknown>
  const status: PicoStatus = {
    name: String(r.name ?? ''),
    fwVersion: String(r.fwVersion ?? ''),
    apiVersion: String(r.apiVersion ?? ''),
    ready: r.ready === true,
    defaultOs: String(r.defaultOs ?? ''),
  }
  // Nur setzen, wenn die Firmware das Feld kennt (alte 0.2.0 → undefined = BOOTSEL-Hinweis).
  if (typeof r.otaSupported === 'boolean') status.otaSupported = r.otaSupported
  if (!status.name || !status.apiVersion) throw new Error('Status unvollständig')
  return status
}

function parseBody(data: unknown): Record<string, unknown> | null {
  return (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown> | null
}

/** baseUrl als Wert oder Getter (für live aktualisierbare Einstellung). */
export function createPicoClient(http: HttpAdapter, baseUrl: string | (() => string)): PicoClient {
  const base = (): string => (typeof baseUrl === 'function' ? baseUrl() : baseUrl).replace(/\/+$/, '')

  return {
    async health() {
      try {
        const res = await http.get(`${base()}/health`, { connectTimeout: HEALTH_TIMEOUT, readTimeout: HEALTH_TIMEOUT })
        return isOk(res.status)
      } catch {
        return false // Netzfehler → nicht erreichbar (kein Logging)
      }
    },
    async status() {
      const res = await http.get(`${base()}/status`, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Status fehlgeschlagen (HTTP ${res.status})`)
      return parseStatus(res.data)
    },
    async typeText({ text, os }) {
      // Text NUR im Body — nie in der URL. Über der Firmware-Grenze chunkt die
      // App in sequenzielle Requests (Spec S2: Gesamtlänge unbegrenzt).
      let typedTotal = 0
      for (const chunk of chunkByCodePoints(text, TYPE_CHUNK_LIMIT)) {
        const res = await http.post(`${base()}/type`, { text: chunk, os }, { connectTimeout: CONNECT_TIMEOUT, readTimeout: READ_TIMEOUT })
        if (!isOk(res.status)) {
          const partial = typedTotal > 0 ? `, ${typedTotal} Zeichen bereits getippt` : ''
          throw new Error(`Senden fehlgeschlagen (HTTP ${res.status}${partial})`)
        }
        const typed = Number((res.data as Record<string, unknown> | null)?.typed ?? 0)
        typedTotal += Number.isFinite(typed) ? typed : 0
      }
      return { typed: typedTotal }
    },
    async setConfig({ ssidId }): Promise<PicoConfigResult> {
      // Vorvalidierung: ungültige ID erzeugt KEINEN Request (Server bleibt maßgeblich).
      if (!isValidSsidId(ssidId)) throw new Error('Ungültige Geräte-ID (erlaubt: A-Z a-z 0-9 _ -, max. 23 Zeichen)')
      const res = await http.post(`${base()}/config`, { ssidId }, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Konfiguration fehlgeschlagen (HTTP ${res.status})`)
      const o = parseBody(res.data)
      return { ok: o?.ok === true, restartRequired: o?.restartRequired === true }
    },

    // --- OTA (#130): Firmware-Upload. Fehler nur als HTTP-Status + Fehlercode
    // der Bridge (kein Payload in Meldungen; das Binary ist unkritisch, aber
    // die Policy bleibt einheitlich).
    async otaBegin(manifest: OtaManifest): Promise<OtaBeginResult> {
      const body = { size: manifest.size, sha256: manifest.sha256, sig: manifest.sigB64 }
      const res = await http.post(`${base()}/ota/begin`, body, { connectTimeout: CONNECT_TIMEOUT, readTimeout: OTA_CHUNK_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Update-Start fehlgeschlagen (HTTP ${res.status})`)
      const o = parseBody(res.data)
      const chunkMax = Number(o?.chunkMax)
      return { ok: o?.ok === true, chunkMax: Number.isFinite(chunkMax) && chunkMax > 0 ? chunkMax : OTA_CHUNK_FALLBACK }
    },
    async otaChunk({ offset, dataB64 }): Promise<{ received: number }> {
      const res = await http.post(`${base()}/ota/chunk`, { offset, dataB64 }, { connectTimeout: CONNECT_TIMEOUT, readTimeout: OTA_CHUNK_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Update-Upload fehlgeschlagen (HTTP ${res.status})`)
      const received = Number(parseBody(res.data)?.received)
      return { received: Number.isFinite(received) ? received : 0 }
    },
    async otaCommit(): Promise<{ rebooting: boolean }> {
      // Verifikation (SHA-256 + Ed25519) läuft auf dem Pico → großzügiger Timeout.
      const res = await http.post(`${base()}/ota/commit`, {}, { connectTimeout: CONNECT_TIMEOUT, readTimeout: OTA_COMMIT_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Update abgelehnt (HTTP ${res.status})`)
      return { rebooting: parseBody(res.data)?.rebooting === true }
    },
  }
}
