// pznUrlImportHttp.ts - der Abruf fuer den PZN-Import von einer Adresse.
//
// App: Download als Datei in den Cache (Filesystem.downloadFile), danach liest die WebView die Datei. NICHT ueber
// CapacitorHttp: das wertet application/json selbst aus (die App bekaeme ein Objekt statt der Bytes) und haelt
// grosse Antworten komplett im Java-Speicher (Absturzgefahr bei grossen Bibliotheken). downloadFile ist im
// Filesystem-Plugin als veraltet markiert, aber vorhanden; der Ersatz waere eine neue Abhaengigkeit.
// Web: fetch (dort gilt CORS des Servers).
import { Capacitor, CapacitorCookies } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import {
  httpStatusMessage,
  MAX_IMPORT_BYTES,
  PznUrlImportError,
  TOO_LARGE_MESSAGE,
  type ImportHttpGet,
} from './pznUrlImport.ts'

// iOS nimmt `connectTimeout ?? readTimeout` als EINZIGES Timeout (Ruhezeit zwischen Datenpaketen, keine
// Gesamtdauer), siehe picoClient.ts. Grosse Dateien laufen also durch, solange Daten fliessen.
const TIMEOUT_MS = 60_000

// Feste Werte ueberschreiben die Vorgaben der nativen HTTP-Schicht: sonst gingen Geraetemodell und Systemversion
// (User-Agent) sowie die Geraetesprache (Accept-Language) mit. Datenschutzerklaerung Nr. 7.8.
const NEUTRAL_HEADERS = { 'User-Agent': 'ResQDocs', 'Accept-Language': 'de' }

export const pznImportHttpGet: ImportHttpGet = async (url) => {
  if (!Capacitor.isNativePlatform()) {
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new PznUrlImportError(httpStatusMessage(res.status))
    return new Uint8Array(await res.arrayBuffer())
  }
  const path = `pzn-import-${Date.now()}.tmp`
  try {
    await Filesystem.downloadFile({
      url,
      path,
      directory: Directory.Cache,
      headers: NEUTRAL_HEADERS,
      connectTimeout: TIMEOUT_MS,
      readTimeout: TIMEOUT_MS,
    })
    // Groesse pruefen, BEVOR die Datei in den Speicher der WebView kommt.
    const { size } = await Filesystem.stat({ path, directory: Directory.Cache })
    if (size > MAX_IMPORT_BYTES) throw new PznUrlImportError(TOO_LARGE_MESSAGE)
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
    const res = await fetch(Capacitor.convertFileSrc(uri))
    return new Uint8Array(await res.arrayBuffer())
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {})
    // Cookies des Servers nicht aufheben, sonst gingen sie beim naechsten Abruf als Kennung mit. Die App selbst
    // nutzt keine Cookies.
    await CapacitorCookies.clearAllCookies().catch(() => {})
  }
}
