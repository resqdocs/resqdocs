// backupRotation.ts — reine Rotations-/Prune-Logik des lokalen Backups (Slice 2), OHNE FS/Capacitor -> node-testbar.
// Entscheidet allein aus Snapshot-Metadaten, ob ein neuer Snapshot geschrieben wird und welche alten gelöscht
// werden. Ziel des Maintainers: „damit nicht alles auf einmal weg ist" -> Großvater-Vater-Sohn-Staffelung PLUS
// ein harter Anti-Regressions-Guard (der reichhaltigste je gesehene Stand wird NIE gelöscht, egal wie viele
// leere/geschrumpfte Snapshots danach kommen — z. B. nach einem versehentlichen Reset).

export const BACKUP_FILE_PREFIX = 'resqdocs-backup-'
export const BACKUP_FILE_SUFFIX = '.json.gz'
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

/** Herkunft eines Snapshots — steuert Verlauf-Badge UND Rotations-Pinning. */
export type SnapshotOrigin = 'auto' | 'manual' | 'pre-restore'

export interface SnapshotCounts {
  protocols: number
  blocks: number
  snippets: number
  pzn: number
}

export interface SnapshotMeta {
  /** Dateiname im Backup-Ordner. */
  name: string
  /** Erstellzeit (Epoch ms). */
  createdAt: number
  /** Content-Hash des Envelopes (Dedup: gleicher Hash wie neuester Stand -> kein Schreiben). */
  hash: string
  /** Summe der Zähler (protocols+blocks+snippets+pzn) — Grundlage des Anti-Regressions-Guards. */
  total: number
  /** Herkunft (default 'auto'). 'pre-restore'-Stände werden vor der Rotation gepinnt. */
  origin?: SnapshotOrigin
  /** Zähler je Datentyp — für die Verlauf-Liste (spart Datei-Reads). */
  counts?: SnapshotCounts
}

export interface RotationConfig {
  recent: number
  dailyDays: number
  weeklyWeeks: number
}
// Time-Machine-Staffelung auf Vorlagengröße skaliert (letzte 10 + 30 Tage + 12 Wochen, ~50 Stände Deckel).
export const DEFAULT_ROTATION: RotationConfig = { recent: 10, dailyDays: 30, weeklyWeeks: 12 }

// Nutzerwählbare Presets (der Einstellungs-Reiter bietet diese + 'Eigene').
export const ROTATION_PRESETS = {
  sparsam: { recent: 5, dailyDays: 7, weeklyWeeks: 4 },
  standard: { recent: 10, dailyDays: 30, weeklyWeeks: 12 },
  ausfuehrlich: { recent: 15, dailyDays: 30, weeklyWeeks: 26 },
} as const satisfies Record<string, RotationConfig>

// So viele der neuesten 'pre-restore'-Sicherheitsstände bleiben rotations-immun (frei zurückspringen).
const PRE_RESTORE_PINS = 10

export interface BackupCandidate {
  name: string
  createdAt: number
  hash: string
  total: number
  origin?: SnapshotOrigin
  counts?: SnapshotCounts
}

export interface BackupPlan {
  /** neuen Snapshot schreiben? (false = inhaltsgleich zum neuesten -> kein Schreiben) */
  write: boolean
  skipReason?: string
  /** Dateinamen, die NACH dem Schreiben gelöscht werden. */
  prune: string[]
  /** Dateinamen, die behalten werden (inkl. Kandidat, wenn geschrieben). */
  keep: string[]
}

const dayIndex = (ms: number): number => Math.floor(ms / DAY_MS)
const weekIndex = (ms: number): number => Math.floor(ms / WEEK_MS)

export function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_SUFFIX)
}

/** Dateiname aus Zeitstempel (UTC, deterministisch): resqdocs-backup-YYYYMMDD-HHMMSS-mmm.json.gz.
 *  Millisekunden sind Teil des Namens -> zwei Snapshots kollidieren praktisch nie auf denselben Dateinamen
 *  (Same-Second-Fall aus dem Verify; zusätzlich verhindert das Single-Flight-Lock parallele Läufe). */
export function snapshotName(createdAt: number): string {
  const d = new Date(createdAt)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${p(d.getUTCMilliseconds(), 3)}`
  return `${BACKUP_FILE_PREFIX}${ts}${BACKUP_FILE_SUFFIX}`
}

/** Großvater-Vater-Sohn: neueste `recent` + je neuester pro Tag (bis `dailyDays`) + pro Woche (bis `weeklyWeeks`).
 *  `snaps` MUSS neueste-zuerst sortiert sein (Map fängt so den neuesten je Tag/Woche). */
function gfsKeep(snaps: SnapshotMeta[], cfg: RotationConfig): Set<string> {
  const keep = new Set<string>()
  for (const s of snaps.slice(0, cfg.recent)) keep.add(s.name)
  const days = new Map<number, string>()
  for (const s of snaps) {
    const d = dayIndex(s.createdAt)
    if (!days.has(d)) days.set(d, s.name)
  }
  for (const n of [...days.values()].slice(0, cfg.dailyDays)) keep.add(n)
  const weeks = new Map<number, string>()
  for (const s of snaps) {
    const w = weekIndex(s.createdAt)
    if (!weeks.has(w)) weeks.set(w, s.name)
  }
  for (const n of [...weeks.values()].slice(0, cfg.weeklyWeeks)) keep.add(n)
  return keep
}

/** Reichhaltigster Snapshot (höchstes total; bei Gleichstand der neuere). null bei leerer Liste. */
function richest(snaps: SnapshotMeta[]): SnapshotMeta | null {
  let best: SnapshotMeta | null = null
  for (const s of snaps) {
    if (!best || s.total > best.total || (s.total === best.total && s.createdAt > best.createdAt)) best = s
  }
  return best
}

/** Plant Schreiben + Prune. `existing` = vorhandene Snapshots; `candidate` = der neue Stand. */
export function planBackup(
  existing: SnapshotMeta[],
  candidate: BackupCandidate,
  cfg: RotationConfig = DEFAULT_ROTATION,
  force = false,
): BackupPlan {
  const sortedExisting = [...existing].sort((a, b) => b.createdAt - a.createdAt)

  // Dedup: inhaltsgleich zum neuesten Stand -> nicht schreiben (spart Flash-Verschleiß). force überspringt das
  // (Sicherheits-Snapshot vor einem Restore MUSS existieren, damit man garantiert zurückspringen kann).
  if (!force && sortedExisting.length > 0 && sortedExisting[0].hash === candidate.hash) {
    return { write: false, skipReason: 'unverändert', prune: [], keep: sortedExisting.map((s) => s.name) }
  }

  const all: SnapshotMeta[] = [
    {
      name: candidate.name,
      createdAt: candidate.createdAt,
      hash: candidate.hash,
      total: candidate.total,
      origin: candidate.origin,
      counts: candidate.counts,
    },
    ...sortedExisting,
  ].sort((a, b) => b.createdAt - a.createdAt)

  const keep = gfsKeep(all, cfg)
  // Anti-Regressions-Guard: der reichhaltigste je gesehene Stand bleibt IMMER (schützt gegen: neuer leerer/
  // geschrumpfter Snapshot nach Reset/Korruption verdrängt über die Zeit alle guten Kopien).
  const best = richest(all)
  if (best) keep.add(best.name)
  // Pre-Restore-Pinning: die neuesten Sicherheitsstände (vor einer Wiederherstellung angelegt) bleiben
  // rotations-immun -> „frei zwischen Ständen springen" ohne dass der Rückweg wegrotiert (git-ORIG_HEAD-Prinzip).
  for (const s of all.filter((x) => x.origin === 'pre-restore').slice(0, PRE_RESTORE_PINS)) keep.add(s.name)
  keep.add(candidate.name) // der neue Stand wird immer behalten

  const prune = all.filter((s) => !keep.has(s.name)).map((s) => s.name)
  return { write: true, prune, keep: [...keep] }
}
