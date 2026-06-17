// fileTransfer.ts — Helfer für Datei-Download/-Teilen, Clipboard und Datei-Lesen.
//
// Bewusst die EINZIGE Stelle mit Browser-/Capacitor-APIs für den Protokoll-
// Import/-Export. Pure Session-/Validierungslogik bleibt frei davon
// (creatorSession.ts). Protokolle sind neutrale Vorlagen (data-flow.md);
// native Plugins arbeiten lokal, kein Netz.
import { Capacitor } from '@capacitor/core'
import { bytesToBase64 } from './gzip'

/**
 * Teilt JSON über den nativen System-Dialog (#76): temporäre Datei im
 * Cache-Verzeichnis schreiben, iOS-/Android-Share-Sheet öffnen ("In Dateien
 * sichern", AirDrop, …), Temp-Datei danach aufräumen. Im Web (kein nativer
 * Layer) Fallback auf den Blob-Download.
 */
export async function shareJson(filename: string, json: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    downloadJson(filename, json)
    return
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
  try {
    // file:// teilen MUSS ueber `files` laufen (nicht `url` - das ist fuer Web-Links).
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Protokoll exportieren' })
  } finally {
    // verzoegert aufraeumen: iOS liest die Datei ggf. noch beim Teilen.
    setTimeout(() => { void Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {}) }, 10000)
  }
}

/** Lädt JSON als Datei herunter (Web-Blob). Wirft, wenn DOM/Blob nicht verfügbar. */
export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Kopiert Text in die Zwischenablage. Gibt false zurück, wenn nicht möglich. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Liest eine ausgewählte Datei als Text. */
export function readTextFile(file: File): Promise<string> {
  return file.text()
}

/** Liest eine ausgewählte Datei als Bytes (für gezippte Backups). */
export async function readBinaryFile(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * Teilt Binärdaten (z. B. gezipptes Backup) über den nativen Share-Dialog; im Web
 * Fallback auf Blob-Download. Capacitor Filesystem schreibt Binärdaten base64 (ohne
 * `encoding`-Angabe).
 */
export async function shareBinary(
  filename: string,
  bytes: Uint8Array,
  mime = 'application/gzip',
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([bytes as BlobPart], { type: mime })
    const url = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
    return
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  await Filesystem.writeFile({ path: filename, data: bytesToBase64(bytes), directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Exportieren' })
  } finally {
    setTimeout(() => { void Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {}) }, 10000)
  }
}
