// settingsRepository.ts — SettingsRepository über einen KeyValueAdapter.
// Speichert AUSSCHLIESSLICH die bekannten AppSettings-Felder (Sanitize) — nie
// Protokolle, Bausteine oder Patientendaten. Frei von Capacitor → pur testbar.
import { DEFAULT_SETTINGS, type AppSettings, type KeyValueAdapter, type SettingsRepository } from './types.ts'
import { SCANNER_MODES, type ScannerMode } from '../medplan/scannerMode.ts'

export const SETTINGS_KEY = 'app.settings'

/** Nur die bekannten Felder übernehmen — defensiv gegen Fremddaten. */
function sanitize(s: Partial<AppSettings> | null | undefined): AppSettings {
  const t = s?.theme
  const url = s?.picoBaseUrl
  return {
    defaultOs: typeof s?.defaultOs === 'string' ? s.defaultOs : DEFAULT_SETTINGS.defaultOs,
    theme: t === 'light' || t === 'dark' || t === 'system' ? t : DEFAULT_SETTINGS.theme,
    lastSelectedProtocolId: typeof s?.lastSelectedProtocolId === 'string' ? s.lastSelectedProtocolId : null,
    defaultProtocolId: typeof s?.defaultProtocolId === 'string' ? s.defaultProtocolId : null,
    privacyNoticeAccepted: s?.privacyNoticeAccepted === true,
    // nur http(s)-URLs; sonst Default (keine Patientendaten/Secrets erlaubt).
    picoBaseUrl: typeof url === 'string' && /^https?:\/\//.test(url) ? url : DEFAULT_SETTINGS.picoBaseUrl,
    // Beide gueltigen Familien bewahren (sonst wuerde der neue Default 'resqdocs'
    // ein bewusst gespeichertes 'classic' ueberschreiben). Nur Ungueltiges -> Default.
    themeFamily: s?.themeFamily === 'classic' || s?.themeFamily === 'resqdocs'
      ? s.themeFamily : DEFAULT_SETTINGS.themeFamily,
    dismissedHints: Array.isArray(s?.dismissedHints)
      ? s.dismissedHints.filter((x): x is string => typeof x === 'string').slice(0, 200)
      : DEFAULT_SETTINGS.dismissedHints,
    headingPattern: typeof s?.headingPattern === 'string' && s.headingPattern.includes('{titel}')
      ? s.headingPattern : DEFAULT_SETTINGS.headingPattern,
    headingFill: typeof s?.headingFill === 'string' ? s.headingFill.slice(0, 1) : DEFAULT_SETTINGS.headingFill,
    headingWidth: Number.isFinite(Number(s?.headingWidth)) && Number(s?.headingWidth) > 0
      ? Math.min(200, Math.round(Number(s?.headingWidth))) : DEFAULT_SETTINGS.headingWidth,
    pznAutoCheck: s?.pznAutoCheck === true,
    scannerMode: SCANNER_MODES.includes(s?.scannerMode as ScannerMode)
      ? (s!.scannerMode as ScannerMode) : DEFAULT_SETTINGS.scannerMode,
    // TTL des temporaeren Einsatzentwurfs (#173): nur 1–5 ganze Stunden, sonst Default 3.
    caseDraftTtlHours: Number.isFinite(Number(s?.caseDraftTtlHours))
      ? Math.max(1, Math.min(5, Math.round(Number(s?.caseDraftTtlHours))))
      : DEFAULT_SETTINGS.caseDraftTtlHours,
    // Tippgeschwindigkeit (delayMs an die Bridge): nur 20–150 ms, sonst Default 60.
    typingDelayMs: Number.isFinite(Number(s?.typingDelayMs))
      ? Math.max(20, Math.min(150, Math.round(Number(s?.typingDelayMs))))
      : DEFAULT_SETTINGS.typingDelayMs,
  }
}

export function createSettingsRepository(adapter: KeyValueAdapter): SettingsRepository {
  return {
    async loadSettings() {
      const raw = await adapter.get(SETTINGS_KEY)
      if (!raw) return { ...DEFAULT_SETTINGS }
      try {
        return sanitize(JSON.parse(raw) as Partial<AppSettings>)
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    async saveSettings(settings) {
      await adapter.set(SETTINGS_KEY, JSON.stringify(sanitize(settings)))
    },
    async resetSettings() {
      await adapter.remove(SETTINGS_KEY)
    },
  }
}
