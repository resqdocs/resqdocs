// backupSettings.ts — Nutzer-Einstellungen des lokalen Backups (Preferences). Aufbewahrungs-Preset + Rate.
import { Preferences } from '@capacitor/preferences'
import { ROTATION_PRESETS, type RotationConfig } from './backupRotation.ts'

export type RetentionPreset = 'sparsam' | 'standard' | 'ausfuehrlich' | 'eigene'
export type BackupRate = 'daily' | 'weekly' | 'manual'

export interface BackupSettings {
  /** Automatik-Frequenz. 'manual' = keine automatischen Backups (nur „Jetzt sichern"). */
  rate: BackupRate
  preset: RetentionPreset
  /** nur relevant, wenn preset==='eigene'. */
  custom: RotationConfig
  /** „Alte Sicherungen loeschen" eingeschaltet? Standard aus. */
  maxAgeEnabled: boolean
  /** Frist in Tagen (frei waehlbar in MAX_AGE_MIN..MAX_AGE_MAX). Bleibt beim Ausschalten erhalten. */
  maxAgeDays: number
}

/** Rahmen fuer die frei waehlbare Frist: mindestens eine Woche, hoechstens zwei Jahre. */
export const MAX_AGE_MIN = 7
export const MAX_AGE_MAX = 730
export const MAX_AGE_DEFAULT = 90

/** Frist auf eine ganze Zahl im erlaubten Rahmen bringen; Unbrauchbares -> Standard. */
export function clampMaxAge(n: unknown): number {
  // Leere Eingabe ist keine 0 (Number('') === 0 wuerde sonst auf die schaerfste Frist springen).
  if (typeof n === 'string' && n.trim() === '') return MAX_AGE_DEFAULT
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return MAX_AGE_DEFAULT
  return Math.min(MAX_AGE_MAX, Math.max(MAX_AGE_MIN, Math.round(v)))
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  rate: 'daily',
  preset: 'standard',
  custom: { ...ROTATION_PRESETS.standard },
  maxAgeEnabled: false,
  maxAgeDays: MAX_AGE_DEFAULT,
}

const KEY = 'resqdocs.backup.settings'

/** Automatische Backups aktiv? (manueller Trigger geht immer.) */
export function autoEnabled(s: BackupSettings): boolean {
  return s.rate !== 'manual'
}

/** Mindestabstand der Automatik in ms (daily/weekly). null = keine Automatik. */
export function rateIntervalMs(s: BackupSettings): number | null {
  if (s.rate === 'daily') return 86_400_000
  if (s.rate === 'weekly') return 7 * 86_400_000
  return null
}

/** Aufbewahrungs-Config, die aus den Einstellungen an planBackup/runBackup geht. */
export function rotationFor(s: BackupSettings): RotationConfig {
  const base = s.preset === 'eigene' ? s.custom : ROTATION_PRESETS[s.preset]
  return { recent: base.recent, dailyDays: base.dailyDays, weeklyWeeks: base.weeklyWeeks, maxAgeDays: s.maxAgeEnabled ? clampMaxAge(s.maxAgeDays) : null }
}

export async function loadBackupSettings(): Promise<BackupSettings> {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return { ...DEFAULT_BACKUP_SETTINGS }
    const parsed = JSON.parse(value) as Partial<BackupSettings>
    return {
      rate: parsed.rate ?? DEFAULT_BACKUP_SETTINGS.rate,
      preset: parsed.preset ?? DEFAULT_BACKUP_SETTINGS.preset,
      custom: parsed.custom ?? { ...ROTATION_PRESETS.standard },
      maxAgeEnabled: parsed.maxAgeEnabled === true,
      maxAgeDays: parsed.maxAgeDays == null ? MAX_AGE_DEFAULT : clampMaxAge(parsed.maxAgeDays),
    }
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export async function saveBackupSettings(s: BackupSettings): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(s) })
}
