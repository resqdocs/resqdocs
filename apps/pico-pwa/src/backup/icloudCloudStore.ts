// icloudCloudStore.ts — CloudBackupStore-Implementierung für iOS über den iCloud-Ubiquity-Container.
// Gegenstück zu driveCloudStore.ts (Android). Der native ICloudBackup-Plugin legt gzip-Bloebs in einen
// versteckten Ordner NEBEN Documents/ ab -> synct über die eigenen Apple-Geräte des Nutzers, bleibt in der
// Files-App unsichtbar. KEIN OAuth, KEIN Profil, KEIN Consent — „angemeldet" heißt: iCloud/Ubiquity verfügbar.
// ACHTUNG: nur am iOS-Gerät mit aktivem iCloud verifizierbar, nicht im Container.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { gzipString, decodeMaybeGzip, bytesToBase64Async } from '../utils/gzip.ts'
import type { CloudBackupStore, CloudFile } from './cloudBackup.ts'

interface ICloudBackupPlugin {
  available(): Promise<{ available: boolean; reason?: string }>
  put(o: { name: string; dataBase64: string }): Promise<void>
  list(): Promise<{ files: { id: string; name: string; modifiedTime: number; size: number }[] }>
  get(o: { id: string }): Promise<{ dataBase64: string | null }>
  remove(o: { id: string }): Promise<void>
}
const ICloud = registerPlugin<ICloudBackupPlugin>('ICloudBackup')

/** Wie DriveCloudStore: CloudBackupStore + signIn/signOut. Auf iOS OHNE OAuth (signIn == available). */
export interface ICloudCloudStore extends CloudBackupStore {
  signIn(): Promise<boolean>
  signOut(): Promise<void>
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Übersetzt den nativen Diagnose-Grund in eine für den Nutzer verständliche Meldung.
function reasonMessage(reason?: string): string {
  switch (reason) {
    case 'no-icloud-account':
      return 'iCloud nicht verfügbar — in den iOS-Einstellungen bei iCloud anmelden und iCloud Drive aktivieren.'
    case 'container-nil':
      return 'iCloud-Konto erkannt, aber der App-Ordner ist noch nicht bereit — kurz warten und erneut versuchen (ggf. iCloud-Speicher prüfen).'
    default:
      return `iCloud nicht verfügbar (${reason ?? 'unbekannt'}).`
  }
}

export function createICloudCloudStore(): ICloudCloudStore {
  const probe = async (): Promise<{ available: boolean; reason: string }> => {
    if (!Capacitor.isNativePlatform()) return { available: false, reason: 'not-native' }
    try {
      const r = await ICloud.available()
      return { available: r.available, reason: r.reason ?? (r.available ? 'ok' : 'container-nil') }
    } catch (e) {
      // Reject NICHT still verschlucken — sonst käme am Gerät nie eine brauchbare Ursache an.
      return { available: false, reason: `plugin-error: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return {
    // Für Statusanzeige: nur boolean, wirft nie.
    available: async () => (await probe()).available,
    // iOS: „anmelden" == iCloud/Ubiquity verfügbar. Kein Login/Profil. Bei Nichtverfügbarkeit MIT klarer Ursache
    // werfen, damit enableCloud() sie in lastMessage sichtbar macht (statt stummen Zurückspringens).
    signIn: async () => {
      const p = await probe()
      if (!p.available) throw new Error(reasonMessage(p.reason))
      return true
    },
    async signOut() {
      /* iCloud-An/Abmeldung ist Systemsache (iOS-Einstellungen) — kein App-seitiges Logout, keine Datenlöschung. */
    },
    async put(name, envelopeJson) {
      const b64 = await bytesToBase64Async(await gzipString(envelopeJson)) // wie Drive: TS gzippt, nativ schreibt roh
      await ICloud.put({ name, dataBase64: b64 })
    },
    async list(): Promise<CloudFile[]> {
      const { files } = await ICloud.list()
      return files.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size }))
    },
    async get(id) {
      const { dataBase64 } = await ICloud.get({ id })
      if (!dataBase64) return null
      return decodeMaybeGzip(base64ToBytes(dataBase64)) // deckt roh/1x/2x gzip ab (wie Drive.get)
    },
    async remove(id) {
      await ICloud.remove({ id })
    },
  }
}
