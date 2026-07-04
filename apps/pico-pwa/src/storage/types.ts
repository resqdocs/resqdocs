// storage/types.ts — Verträge der gekapselten Storage-/Repository-Schicht (DR-0004).
//
// UI und Creator-Session kennen NUR diese Interfaces — nicht, ob die Daten aus
// Memory, Capacitor Preferences oder (später, #13-F2) SQLite kommen.
//
// Datenschutz (S3 / DR-0004): NUR neutrale Daten. Keine Patientendaten, keine
// Einsatzdaten, kein caseState im Storage.
import type { Protocol, Block } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { ScannerMode } from '../medplan/scannerMode.ts'

export type Theme = 'system' | 'light' | 'dark'

/** Kleine, flache App-Einstellungen → Capacitor Preferences. KEINE Patientendaten. */
export interface AppSettings {
  defaultOs: string
  theme: Theme
  lastSelectedProtocolId: string | null
  /** Persönliches Standard-Protokoll: im Einsatz beim App-Start vorausgewählt. null = erstes. */
  defaultProtocolId: string | null
  privacyNoticeAccepted: boolean
  /** Basis-URL der lokalen Pico-Bridge (S2-Default 10.10.10.1). Keine Patientendaten/Secrets. */
  picoBaseUrl: string
  /** Theme-Familie (#78): 'classic' = bisherige daisyUI-Themes, 'resqdocs' = Logofarben. */
  themeFamily: 'classic' | 'resqdocs'
  /** Gesehene/verstandene Erklär-Hinweise (#72), ids. */
  dismissedHints: string[]
  /** Überschriftenmuster der Ausgabe (#68): '{titel}'-Platzhalter. */
  headingPattern: string
  /** Füllzeichen der Kopfzeile (1 Zeichen; leer = keine Auffüllung). */
  headingFill: string
  /** Zielbreite der Kopfzeile. */
  headingWidth: number
  /**
   * Opt-in: im Hintergrund (gedrosselt) pruefen, ob eine neue Version des
   * PZN-Woerterbuchs vorliegt. Aus = nur lokaler Alters-Hinweis ohne Netzabruf.
   * Default false (Netzwerk-Policy: kein automatisches Phone-Home ohne Zustimmung).
   */
  pznAutoCheck: boolean
  /**
   * Scanner-Strategie fuer den BMP-Data-Matrix-Scan (#170). Zentrale Quelle;
   * der Kamera-Schnellumschalter aendert genau diese Einstellung. Default
   * 'webview_standard' (schlanker ZXing-JS-WebView-Scanner; bewusste Erststart-
   * Voreinstellung fuer iOS wie Android).
   */
  scannerMode: ScannerMode
  /**
   * TTL des temporaeren Einsatzentwurfs (#173) in STUNDEN. Sliding-Idle: ein
   * laufender Entwurf wird nach so vielen Stunden Inaktivitaet automatisch
   * lokal geloescht. Bereich 1–5 h, Default 3 h.
   */
  caseDraftTtlHours: number
  /**
   * Tippgeschwindigkeit der Pico-Bridge: Verzoegerung in MILLISEKUNDEN pro Zeichen,
   * als delayMs an die Bridge geschickt. Kleiner = schneller. Bereich 20–150 ms,
   * Default 60 (= bisheriger fester Firmware-Wert; ohne Zustimmung wird nichts schneller).
   */
  typingDelayMs: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultOs: 'win_de',
  theme: 'system',
  lastSelectedProtocolId: null,
  defaultProtocolId: null,
  privacyNoticeAccepted: false,
  picoBaseUrl: 'http://10.10.10.1',
  // Default-Design: ResQDocs-Logofarben; Erscheinung folgt dem System (theme: 'system').
  themeFamily: 'resqdocs',
  dismissedHints: [],
  headingPattern: '# {titel} ',
  headingFill: '=',
  headingWidth: 60,
  pznAutoCheck: false,
  scannerMode: 'webview_standard',
  caseDraftTtlHours: 3,
  typingDelayMs: 60,
}

/** Neutraler, wiederverwendbarer Block (z. B. „Mitfahrtverweigerung"). KEINE Patientendaten. */
export interface LibraryBlock {
  id: string
  title: string
  block: Block
  createdAt: string
  updatedAt: string
}

/** Neutraler Textbaustein. KEINE Patientendaten. */
export interface LibrarySnippet {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

/** Strukturierte, neutrale Bibliotheksdaten (SQLite nativ / Memory im Web-Dev). */
export interface LibraryState {
  protocols: Protocol[]
  blocks: LibraryBlock[]
  snippets: LibrarySnippet[]
}

/** Minimaler Key-Value-Adapter - Vertrag lebt im Kern (@resqdocs/protocol-core/adapters), hier re-exportiert. */
export type { KeyValueAdapter } from '@resqdocs/protocol-core/adapters'

export interface SettingsRepository {
  loadSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  resetSettings(): Promise<void>
}

export interface LibraryRepository {
  loadProtocols(): Promise<Protocol[]>
  saveProtocol(protocol: Protocol): Promise<void>
  deleteProtocol(protocolId: string): Promise<void>

  loadBlocks(): Promise<LibraryBlock[]>
  saveBlock(block: LibraryBlock): Promise<void>
  deleteBlock(blockId: string): Promise<void>

  loadSnippets(): Promise<LibrarySnippet[]>
  saveSnippet(snippet: LibrarySnippet): Promise<void>
  deleteSnippet(snippetId: string): Promise<void>

  /** Löscht ALLE Library-Inhalte (Protokolle, Blöcke, Snippets) — NICHT die Settings. */
  resetLibrary(): Promise<void>
}
