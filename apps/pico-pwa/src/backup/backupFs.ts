// backupFs.ts — Capacitor-FS-Adapter des Backups (BackupStore + Lesen/Löschen). NUR nativ sinnvoll.
// Snapshots als gzip-Dateien app-privat: Android Directory.Data, iOS Directory.Library (NICHT Cache — das
// OS darf Cache jederzeit leeren). Index in Preferences. Schreiben ist temp-write-then-rename, damit ein
// halb geschriebenes Backup nie als gültiger Stand sichtbar wird.
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { gzipString, decodeMaybeGzip, bytesToBase64Async } from '../utils/gzip.ts'
import type { BackupStore } from './backupService.ts'
import type { SnapshotMeta } from './backupRotation.ts'

const SUBDIR = 'backups'
const INDEX_KEY = 'resqdocs.backup.index'

/** App-privates, persistentes Verzeichnis je Plattform. */
function dir(): Directory {
  return Capacitor.getPlatform() === 'ios' ? Directory.Library : Directory.Data
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface BackupFileStore extends BackupStore {
  /** Entpackter Envelope-JSON eines Snapshots (null bei fehlend/korrupt). */
  readSnapshot(name: string): Promise<string | null>
  /** Alle Snapshots + Index löschen. */
  clearAll(): Promise<void>
}

export function createCapacitorBackupStore(): BackupFileStore {
  const path = (name: string) => `${SUBDIR}/${name}`

  const listIndex = async (): Promise<SnapshotMeta[]> => {
    try {
      const { value } = await Preferences.get({ key: INDEX_KEY })
      if (!value) return []
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as SnapshotMeta[]) : []
    } catch {
      return []
    }
  }

  return {
    listIndex,
    async putIndex(metas) {
      await Preferences.set({ key: INDEX_KEY, value: JSON.stringify(metas) })
    },
    async writeSnapshot(name, envelopeJson, onProgress) {
      const b64 = await bytesToBase64Async(await gzipString(envelopeJson), onProgress)
      const tmp = `${path(name)}.tmp`
      // Etwaige verwaiste .tmp vorher entfernen (aus einem früher abgebrochenen Lauf) — sonst könnte ein
      // rename fehlschlagen/inkonsistent sein. temp -> rename: nie eine halb geschriebene Datei sichtbar machen.
      await Filesystem.deleteFile({ path: tmp, directory: dir() }).catch(() => {})
      await Filesystem.writeFile({ path: tmp, data: b64, directory: dir(), recursive: true })
      await Filesystem.rename({ from: tmp, to: path(name), directory: dir() })
    },
    async deleteSnapshot(name) {
      await Filesystem.deleteFile({ path: path(name), directory: dir() }).catch(() => {})
    },
    async readSnapshot(name) {
      try {
        const { data } = await Filesystem.readFile({ path: path(name), directory: dir() })
        if (typeof data !== 'string') return null // nativ liefert base64-String (kein Blob)
        return await decodeMaybeGzip(base64ToBytes(data))
      } catch {
        return null
      }
    },
    async clearAll() {
      for (const m of await listIndex()) {
        await Filesystem.deleteFile({ path: path(m.name), directory: dir() }).catch(() => {})
      }
      await Preferences.remove({ key: INDEX_KEY })
    },
  }
}
