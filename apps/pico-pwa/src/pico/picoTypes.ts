// picoTypes.ts — Verträge der gekapselten Pico-Kommunikationsschicht (S2).
//
// Datenschutz (S2/S3): Text nur im Body, nie in URL/Logs/Cache; kein Auth im MVP;
// keine Patientendaten persistent. Siehe docs/pico-api.md.

export type OsMode = 'win_de' | 'mac_de' | 'ios'

/** GET /status (S2; otaSupported ab Firmware 0.3.0). */
export interface PicoStatus {
  name: string
  fwVersion: string
  apiVersion: string
  ready: boolean
  defaultOs: string
  /** true ab 0.3.0 mit gemountetem LittleFS; undefined bei aelterer Firmware. */
  otaSupported?: boolean
  /** Tipp-Fortschritt (ab Firmware 0.4.0); undefined bei aelterer Firmware. */
  typing?: TypingStatus
}

/**
 * Fortschritt des Tipp-Auftrags auf der Bridge (GET /type/status, ab Firmware 0.4.0).
 * Enthaelt NUR Zahlen und Zustand, nie Text.
 */
export interface TypingStatus {
  state: 'idle' | 'typing' | 'paused'
  /** getippte Zeichen des Auftrags */
  done: number
  /** Zeichen des Auftrags insgesamt */
  total: number
  delayMs: number
  /** zaehlt je neuem Auftrag hoch */
  jobId: number
  /** wie der letzte Auftrag endete */
  lastEnd: 'none' | 'done' | 'cancelled'
}

export type TypingControl = 'pause' | 'resume' | 'cancel'

/**
 * Angaben zum Text, der auf der Bridge abgelegt ist und auf Knopfdruck getippt wird (GET /stored, ab
 * Firmware 0.5.0). Kein Inhalt - den gibt es nur mit gedruecktem Knopf (GET /stored/text).
 */
export interface StoredTextInfo {
  present: boolean
  name: string
  chars: number
  os: string
  delayMs: number
  /** Unix-Sekunden, 0 = unbekannt */
  savedAt: number
  /** true, wenn der Knopf an der Bridge gerade gedrueckt ist */
  buttonHeld: boolean
  /** true, wenn der abgelegte Text die Pruefung der Bridge nicht besteht und deshalb nicht getippt wird */
  blocked: boolean
}

/** Signiertes Firmware-Manifest (scripts/ota/sign.mjs). */
export interface OtaManifest {
  version: string
  size: number
  sha256: string
  sigB64: string
}

/** POST /ota/begin: Antwort der Bridge. */
export interface OtaBeginResult {
  ok: boolean
  /** Maximale Chunk-Groesse in Bytes (roh, vor Base64). */
  chunkMax: number
}

/** POST /config (S2): Antwort der Bridge. */
export interface PicoConfigResult {
  ok: boolean
  restartRequired: boolean
}

export interface PicoClient {
  /** GET /health → true bei erreichbar. */
  health(): Promise<boolean>
  /** GET /status → geparster Status (wirft bei ungültiger Antwort). */
  status(): Promise<PicoStatus>
  /** POST /type { text, os, delayMs? } → Anzahl getippter Zeichen. Text NUR im Body.
   * delayMs optional (Tippgeschwindigkeit, ms/Zeichen); fehlt → Firmware-Default 60. */
  typeText(input: { text: string; os: string; delayMs?: number }): Promise<{ typed: number }>
  /** GET /type/status → Fortschritt. null = die Firmware kennt den Endpunkt nicht (vor 0.4.0). Wirft bei Netzfehler. */
  typeStatus(): Promise<TypingStatus | null>
  /** POST /type/pause|resume|cancel → neuer Zustand. null = kein laufender Auftrag oder aeltere Firmware. */
  typeControl(action: TypingControl): Promise<TypingStatus | null>
  /** GET /stored → Angaben zum abgelegten Text. null = die Firmware kennt es nicht (vor 0.5.0). */
  storedInfo(): Promise<StoredTextInfo | null>
  /** GET /stored/text → der abgelegte Text ('' = nichts abgelegt). Wirft ButtonRequiredError ohne gedrueckten Knopf. */
  storedText(): Promise<string>
  /** POST /stored → Text ablegen. Wirft ButtonRequiredError ohne gedrueckten Knopf, TextNotAllowedError bei abgelehntem Inhalt. */
  storeText(input: { text: string; os: string; delayMs: number; savedAt: number; name?: string }): Promise<{ chars: number }>
  /** POST /stored/clear → abgelegten Text entfernen. Wirft ButtonRequiredError ohne gedrueckten Knopf. */
  clearStored(): Promise<void>
  /** POST /config { ssidId } → { ok, restartRequired }. Wirft bei ungültiger ID OHNE Request. */
  setConfig(input: { ssidId: string }): Promise<PicoConfigResult>
  /** POST /ota/begin { size, sha256, sig } → { ok, chunkMax }. */
  otaBegin(manifest: OtaManifest): Promise<OtaBeginResult>
  /** POST /ota/chunk { offset, dataB64 } → empfangene Gesamtbytes. */
  otaChunk(input: { offset: number; dataB64: string }): Promise<{ received: number }>
  /** POST /ota/commit {} → { rebooting } nach erfolgreicher Verifikation. */
  otaCommit(): Promise<{ rebooting: boolean }>
}

// --- HTTP-Adapter (abstrahiert; echte Impl. = CapacitorHttp, Fake = Tests) ---

export interface HttpResponse {
  status: number
  data: unknown
}

export interface HttpRequestOptions {
  headers?: Record<string, string>
  connectTimeout?: number
  readTimeout?: number
  /**
   * Erzwingt das Antwortformat. 'json' (Default) parst automatisch; 'text'
   * liefert den ROHTEXT unveraendert - noetig, wenn ueber die exakten Bytes
   * eine Pruefsumme (SHA256) gebildet werden muss (Supply-Chain).
   */
  responseType?: 'json' | 'text'
}

export interface HttpAdapter {
  get(url: string, opts?: HttpRequestOptions): Promise<HttpResponse>
  post(url: string, body: unknown, opts?: HttpRequestOptions): Promise<HttpResponse>
}
