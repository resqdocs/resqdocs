// pznUrlImport.ts - PZN-Bibliothek von einer Adresse laden (nur auf Nutzeraktion). Rein, headless testbar.
//
// Gedacht fuer Nutzer, die ihre EIGENE, selbst gesammelte Bibliothek auf einem eigenen Speicher abgelegt haben
// und sie nicht einfach als Datei aufs Geraet bekommen. Es gibt kein Standardziel und keine Vorschlaege: die
// Adresse gibt der Nutzer selbst ein, sie wird nicht gespeichert. Nur https. Der Abruf wird uebergeben
// (App: Download in den Cache, siehe pznUrlImportHttp.ts), damit diese Logik ohne Geraet laeuft.
// Den Inhalt NICHT loggen.

/** Obergrenze fuer die geladene Datei. Eine 320k-Bibliothek ist als .json.gz einige MB, als .json gut 50 MB. */
export const MAX_IMPORT_BYTES = 96 * 1024 * 1024

export const DOWNLOAD_FAILED_MESSAGE =
  'Download fehlgeschlagen. Bitte Internetverbindung und Adresse prüfen und ob die Datei ohne Anmeldung abrufbar ist.'
export const TOO_LARGE_MESSAGE = 'Die Datei ist zu groß für den Import.'
export const EMPTY_MESSAGE = 'Die Datei unter dieser Adresse ist leer.'
/** Hinweis, wenn die Adresse etwas anderes als eine Bibliothek liefert (typisch: Freigabeseite statt Datei). */
export const NOT_A_LIBRARY_MESSAGE =
  'Unter dieser Adresse liegt keine PZN-Bibliothek (.json oder .json.gz). Bei Freigabe-Links den direkten Download-Link verwenden.'

export type ImportUrlCheck = { ok: true; url: string } | { ok: false; error: string }

/** Eingegebene Adresse pruefen: nur https, ohne Zugangsdaten. Der Teil hinter „#" faellt weg (wird nie gebraucht). */
export function checkImportUrl(raw: string): ImportUrlCheck {
  const s = raw.trim()
  if (!s) return { ok: false, error: 'Bitte eine Adresse eingeben.' }
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return { ok: false, error: 'Das ist keine gültige Adresse.' }
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'Nur Adressen mit https:// sind erlaubt.' }
  if (u.username || u.password) {
    return { ok: false, error: 'Adressen mit Benutzername oder Passwort werden nicht unterstützt.' }
  }
  u.hash = ''
  return { ok: true, url: u.toString() }
}

/** Abruf: liefert die Bytes der Datei oder wirft (PznUrlImportError mit eigenem Text oder beliebigen Fehler). */
export type ImportHttpGet = (url: string) => Promise<Uint8Array>

/** Fehler mit Text fuer die Oberflaeche. */
export class PznUrlImportError extends Error {}

/** Text fuer einen HTTP-Fehlerstatus (wo der Abruf ihn kennt, im Web). */
export function httpStatusMessage(status: number): string {
  if (status === 401 || status === 403) return `Kein Zugriff auf die Datei (HTTP ${status}). Ist sie zum Herunterladen freigegeben?`
  if (status === 404) return 'Unter dieser Adresse liegt keine Datei (HTTP 404).'
  return `Download fehlgeschlagen (HTTP ${status}).`
}

/** Datei laden und als Bytes liefern. Wirft PznUrlImportError mit Text fuer die Oberflaeche. */
export async function downloadImportBytes(url: string, get: ImportHttpGet): Promise<Uint8Array> {
  let bytes: Uint8Array
  try {
    bytes = await get(url)
  } catch (err) {
    if (err instanceof PznUrlImportError) throw err
    throw new PznUrlImportError(DOWNLOAD_FAILED_MESSAGE)
  }
  if (bytes.length === 0) throw new PznUrlImportError(EMPTY_MESSAGE)
  if (bytes.length > MAX_IMPORT_BYTES) throw new PznUrlImportError(TOO_LARGE_MESSAGE)
  return bytes
}
