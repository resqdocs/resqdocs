// cloudBackup.ts — plattform-neutraler Kern des Cloud-Backups (Slice „Android zuerst", danach iOS dahinter).
// EIN CloudBackupStore-Interface kapselt den Transport (Android: Google Drive appDataFolder; iOS: iCloud-
// Ubiquity-Container). Diese Datei ist REIN (kein Capacitor/Netz) -> node-testbar. Sie regelt die knifflige
// Multi-Device-Logik: APPEND-ONLY + GERÄTESCOPED — jedes Gerät schreibt/rotiert NUR seine EIGENEN Snapshots,
// damit Gerät A nie löscht, was Gerät B behalten will. Der „Index" wird IMMER aus der Cloud-Liste rekonstruiert
// (kein Preferences-Index, der nicht synct). Envelope-/gzip-Format identisch zum lokalen Backup.
import { planBackup, type RotationConfig, type SnapshotMeta } from './backupRotation.ts'

/** Eine Datei im Cloud-Ordner (aus der Auflistung des Anbieters). */
export interface CloudFile {
  id: string
  name: string
  modifiedTime: number
  size: number
}

/** Transport-Abstraktion (iOS iCloud / Android Drive dahinter). Envelope-JSON rein/raus; gzip macht der Store. */
export interface CloudBackupStore {
  /** verfügbar/angemeldet? (iCloud aktiv bzw. Google-Konto verbunden) */
  available(): Promise<boolean>
  put(name: string, envelopeJson: string): Promise<void>
  list(): Promise<CloudFile[]>
  /** entpacktes Envelope-JSON (null bei fehlend/korrupt) */
  get(id: string): Promise<string | null>
  remove(id: string): Promise<void>
}

const PREFIX = 'rqd-'
const SUFFIX = '.json.gz'
const HASH_LEN = 12

/** Im Dateinamen kodierte Metadaten (die Cloud-Liste liefert nur Name/Zeit/Größe, kein hash/total/deviceId). */
export interface CloudMeta {
  deviceId: string
  createdAt: number
  total: number
  hash: string
}

/** rqd-<deviceId>-<createdAtMs>-<total>-<hash12>.json.gz — deviceId ist hex (kein '-'). */
export function cloudName(m: CloudMeta): string {
  return `${PREFIX}${m.deviceId}-${m.createdAt}-${m.total}-${m.hash.slice(0, HASH_LEN)}${SUFFIX}`
}

export function parseCloudName(name: string): CloudMeta | null {
  if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) return null
  const parts = name.slice(PREFIX.length, -SUFFIX.length).split('-')
  if (parts.length !== 4) return null
  const [deviceId, ts, total, hash] = parts
  const createdAt = Number(ts)
  const tot = Number(total)
  if (!deviceId || !hash || !Number.isFinite(createdAt) || !Number.isFinite(tot)) return null
  return { deviceId, createdAt, total: tot, hash }
}

export interface CloudSyncPlan {
  upload: boolean
  skipReason?: string
  /** IDs, die NACH dem Upload gelöscht werden — IMMER nur eigene (gerätescoped). */
  pruneIds: string[]
  /** Zielname des neuen Snapshots (falls upload). */
  name: string
}

/** Plant Upload + Prune für DIESES Gerät: Dedup gegen den eigenen neuesten Stand, GFS-Rotation NUR über die
 *  eigenen Dateien (fremde Geräte-Snapshots bleiben unangetastet). Wiederverwendet die getestete planBackup. */
export function planCloudSync(
  files: CloudFile[],
  deviceId: string,
  candidate: { createdAt: number; total: number; hash: string },
  cfg?: RotationConfig,
  force = false,
): CloudSyncPlan {
  const h = candidate.hash.slice(0, HASH_LEN)
  const own: { id: string; name: string; meta: CloudMeta }[] = []
  for (const f of files) {
    const m = parseCloudName(f.name)
    if (m && m.deviceId === deviceId) own.push({ id: f.id, name: f.name, meta: m })
  }
  const existing: SnapshotMeta[] = own.map((o) => ({ name: o.name, createdAt: o.meta.createdAt, hash: o.meta.hash, total: o.meta.total }))
  const name = cloudName({ deviceId, createdAt: candidate.createdAt, total: candidate.total, hash: h })
  const plan = planBackup(existing, { name, createdAt: candidate.createdAt, hash: h, total: candidate.total }, cfg, force)
  if (!plan.write) return { upload: false, skipReason: plan.skipReason, pruneIds: [], name }
  const idByName = new Map(own.map((o) => [o.name, o.id]))
  const pruneIds = plan.prune.map((n) => idByName.get(n)).filter((x): x is string => Boolean(x))
  return { upload: true, pruneIds, name }
}

/** Verlauf über ALLE Geräte (für die Anzeige), neueste zuerst. */
export function cloudHistory(files: CloudFile[]): (CloudMeta & { id: string; name: string })[] {
  const out: (CloudMeta & { id: string; name: string })[] = []
  for (const f of files) {
    const m = parseCloudName(f.name)
    if (m) out.push({ ...m, id: f.id, name: f.name })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}
