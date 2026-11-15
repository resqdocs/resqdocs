// picoClient.ts — gekapselte Pico-HTTP-Logik (S2). Spricht NUR über den
// HttpAdapter → gegen einen Fake-Adapter testbar, ohne echte Netzwerkaufrufe.
//
// Datenschutz: Text ausschließlich im Body von POST /type (nie in der URL);
// Fehler werden auf den HTTP-Status normalisiert — KEIN Payload-Logging.
import type { HttpAdapter, OtaBeginResult, OtaManifest, PicoClient, PicoConfigResult, PicoStatus, StoredTextInfo, TypingStatus } from './picoTypes'

const CONNECT_TIMEOUT = 5000
const READ_TIMEOUT = 20000 // Tippen dauert (Per-Char-Delay) → großzügig (S2)
// ACHTUNG CapacitorHttp-iOS (HttpRequestHandler.swift): das Plugin nimmt `connectTimeout ?? readTimeout`
// als EINZIGES timeoutInterval - ist connectTimeout gesetzt, wird readTimeout IGNORIERT. Ein Aufruf mit
// connectTimeout:5000 + readTimeout:20000 lief auf iOS also real mit 5 s statt 20 s. Fuer das Tippen
// (bei niedrigem Akku drosselt iOS Funk/CPU auch ohne Energiesparmodus -> traeger erster Kontakt)
// braucht der Sendeweg das volle Budget. Darum als connectTimeout DAS gedachte Read-Budget uebergeben.
const TYPE_TIMEOUT = READ_TIMEOUT
const HEALTH_TIMEOUT = 3000
// Fortschrittsabfrage: kurz, damit ein verlassenes WLAN schnell als „keine Verbindung" erkannt wird.
const TYPE_STATUS_TIMEOUT = 2500
// Bridge meldet 503 busy, wenn ihre Warteschlange voll ist (sehr lange Texte in mehreren Teilen):
// warten und denselben Teil erneut schicken. 400 Versuche x 1,5 s = 10 Minuten.
export const TYPE_BUSY_RETRY_MS = 1500
export const TYPE_BUSY_MAX_RETRIES = 400
const OTA_CHUNK_TIMEOUT = 10000 // LittleFS-Schreiben pro Chunk
const OTA_COMMIT_TIMEOUT = 30000 // SHA-256 + Ed25519 über ~400 KB auf dem Pico

/** Fallback, falls /ota/begin kein chunkMax liefert (Firmware-Default). */
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
  const typing = parseTyping(r.typing)
  if (typing) status.typing = typing
  if (!status.name || !status.apiVersion) throw new Error('Status unvollständig')
  return status
}

/** Die Bridge verlangt den gedrueckten Knopf (403 button_required): Text ablegen, holen oder entfernen. */
export class ButtonRequiredError extends Error {
  constructor() {
    super('Knopf an der Bridge gedrückt halten')
    this.name = 'ButtonRequiredError'
  }
}

/** Die Bridge lehnt den Text ab (422 not_allowed): Steuerzeichen oder Befehlsmuster. */
export class TextNotAllowedError extends Error {
  readonly reason: 'control' | 'command'
  constructor(reason: 'control' | 'command') {
    super(
      reason === 'control'
        ? 'Die Bridge lehnt den Text ab: Er enthält ein Steuerzeichen. Erlaubt sind nur Schrift und Zeilenumbrüche.'
        : 'Die Bridge lehnt den Text ab: Befehle, Programmaufrufe und Internetadressen tippt der Knopf nicht.',
    )
    this.name = 'TextNotAllowedError'
    this.reason = reason
  }
}

/** Angaben zum abgelegten Text streng pruefen; Unerwartetes → null. */
export function parseStoredInfo(data: unknown): StoredTextInfo | null {
  let o: unknown = data
  if (typeof data === 'string') {
    try {
      o = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  if (typeof r.present !== 'boolean') return null
  const nat = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
  return {
    present: r.present,
    name: typeof r.name === 'string' ? r.name : '',
    chars: nat(r.chars),
    os: typeof r.os === 'string' ? r.os : 'win_de',
    delayMs: nat(r.delayMs),
    savedAt: nat(r.savedAt),
    buttonHeld: r.buttonHeld === true,
    blocked: r.blocked === true,
  }
}

/** Tipp-Fortschritt streng pruefen; alles Unerwartete → null (wie „Firmware kennt es nicht"). */
export function parseTyping(data: unknown): TypingStatus | null {
  let o: unknown = data
  if (typeof data === 'string') {
    try {
      o = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const nat = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
  const done = nat(r.done)
  const total = nat(r.total)
  const delayMs = nat(r.delayMs)
  const jobId = nat(r.jobId)
  if (done === null || total === null || delayMs === null || jobId === null) return null
  if (r.state !== 'idle' && r.state !== 'typing' && r.state !== 'paused') return null
  if (r.lastEnd !== 'none' && r.lastEnd !== 'done' && r.lastEnd !== 'cancelled') return null
  return { state: r.state, done: Math.min(done, total), total, delayMs, jobId, lastEnd: r.lastEnd }
}

function parseBody(data: unknown): Record<string, unknown> | null {
  return (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown> | null
}

/** baseUrl als Wert oder Getter (für live aktualisierbare Einstellung). `sleep` ist fuer Tests ersetzbar. */
export function createPicoClient(
  http: HttpAdapter,
  baseUrl: string | (() => string),
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): PicoClient {
  const base = (): string => (typeof baseUrl === 'function' ? baseUrl() : baseUrl).replace(/\/+$/, '')
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

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
    async typeText({ text, os, delayMs }) {
      // Text NUR im Body — nie in der URL. Über der Firmware-Grenze chunkt die
      // App in sequenzielle Requests (Spec S2: Gesamtlänge unbegrenzt).
      // delayMs nur mitschicken, wenn gesetzt (sonst Firmware-Default 60 → rückwärtskompatibel).
      const extra = typeof delayMs === 'number' ? { delayMs } : {}
      let typedTotal = 0
      for (const chunk of chunkByCodePoints(text, TYPE_CHUNK_LIMIT)) {
        const send = () => http.post(`${base()}/type`, { text: chunk, os, ...extra }, { connectTimeout: TYPE_TIMEOUT, readTimeout: TYPE_TIMEOUT })
        let res = await send()
        // Ab Firmware 0.4.0 tippt die Bridge weiter, waehrend sie den naechsten Teil annimmt. Ist ihre
        // Warteschlange voll, antwortet sie 503 busy: warten, denselben Teil erneut schicken.
        for (let tries = 0; res.status === 503 && tries < TYPE_BUSY_MAX_RETRIES; tries++) {
          await sleep(TYPE_BUSY_RETRY_MS)
          res = await send()
        }
        if (!isOk(res.status)) {
          const partial = typedTotal > 0 ? `, ${typedTotal} Zeichen bereits getippt` : ''
          throw new Error(`Senden fehlgeschlagen (HTTP ${res.status}${partial})`)
        }
        const typed = Number((res.data as Record<string, unknown> | null)?.typed ?? 0)
        typedTotal += Number.isFinite(typed) ? typed : 0
      }
      return { typed: typedTotal }
    },
    async typeStatus() {
      const res = await http.get(`${base()}/type/status`, { connectTimeout: TYPE_STATUS_TIMEOUT, readTimeout: TYPE_STATUS_TIMEOUT })
      if (res.status === 404) return null // Firmware vor 0.4.0
      if (!isOk(res.status)) throw new Error(`Fortschritt nicht abrufbar (HTTP ${res.status})`)
      return parseTyping(res.data)
    },
    async typeControl(action) {
      const res = await http.post(`${base()}/type/${action}`, {}, { connectTimeout: TYPE_STATUS_TIMEOUT, readTimeout: TYPE_STATUS_TIMEOUT })
      if (res.status === 404 || res.status === 409) return null // aeltere Firmware bzw. kein laufender Auftrag
      if (!isOk(res.status)) throw new Error(`Steuerung fehlgeschlagen (HTTP ${res.status})`)
      return parseTyping(res.data)
    },
    // --- Text fuer den Knopf (Firmware ab 0.5.0). Der Text geht nur im Body bzw. als Antwort,
    // nie in die URL, und wird nicht geloggt.
    async storedInfo() {
      const res = await http.get(`${base()}/stored`, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT })
      if (res.status === 404) return null // Firmware vor 0.5.0
      if (!isOk(res.status)) throw new Error(`Abfrage fehlgeschlagen (HTTP ${res.status})`)
      return parseStoredInfo(res.data)
    },
    async storedText() {
      const res = await http.get(`${base()}/stored/text`, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT, responseType: 'text' })
      if (res.status === 403) throw new ButtonRequiredError()
      if (res.status === 404) return ''
      if (!isOk(res.status)) throw new Error(`Laden fehlgeschlagen (HTTP ${res.status})`)
      return typeof res.data === 'string' ? res.data : ''
    },
    async storeText({ text, os, delayMs, savedAt, name }) {
      if (Array.from(text).length > TYPE_CHUNK_LIMIT) throw new Error(`Der Text ist zu lang (höchstens ${TYPE_CHUNK_LIMIT} Zeichen)`)
      const body = { text, os, delayMs, savedAt, ...(name ? { name } : {}) }
      const res = await http.post(`${base()}/stored`, body, { connectTimeout: TYPE_TIMEOUT, readTimeout: TYPE_TIMEOUT })
      if (res.status === 403) throw new ButtonRequiredError()
      if (res.status === 409) throw new Error('Die Bridge tippt gerade. Bitte warten und erneut speichern.')
      if (res.status === 422) throw new TextNotAllowedError(parseBody(res.data)?.reason === 'control' ? 'control' : 'command')
      if (!isOk(res.status)) throw new Error(`Speichern fehlgeschlagen (HTTP ${res.status})`)
      const chars = Number(parseBody(res.data)?.chars ?? 0)
      return { chars: Number.isFinite(chars) ? chars : 0 }
    },
    async clearStored() {
      const res = await http.post(`${base()}/stored/clear`, {}, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT })
      if (res.status === 403) throw new ButtonRequiredError()
      if (!isOk(res.status)) throw new Error(`Entfernen fehlgeschlagen (HTTP ${res.status})`)
    },
    async setConfig({ ssidId }): Promise<PicoConfigResult> {
      // Vorvalidierung: ungültige ID erzeugt KEINEN Request (Server bleibt maßgeblich).
      if (!isValidSsidId(ssidId)) throw new Error('Ungültige Bridge-ID (erlaubt: A-Z a-z 0-9 _ -, max. 23 Zeichen)')
      const res = await http.post(`${base()}/config`, { ssidId }, { connectTimeout: CONNECT_TIMEOUT, readTimeout: CONNECT_TIMEOUT })
      if (!isOk(res.status)) throw new Error(`Konfiguration fehlgeschlagen (HTTP ${res.status})`)
      const o = parseBody(res.data)
      return { ok: o?.ok === true, restartRequired: o?.restartRequired === true }
    },

    // --- OTA: Firmware-Upload. Fehler nur als HTTP-Status + Fehlercode
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
