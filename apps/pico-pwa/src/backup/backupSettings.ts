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
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  rate: 'daily',
  preset: 'standard',
  custom: { ...ROTATION_PRESETS.standard },
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
  return s.preset === 'eigene' ? s.custom : ROTATION_PRESETS[s.preset]
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
    }
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS }
  }
}

export async function saveBackupSettings(s: BackupSettings): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(s) })
}
