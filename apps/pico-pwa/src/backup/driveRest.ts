// driveRest.ts — REINE Google-Drive-REST-v3-Request-Builder für den appDataFolder (node-testbar; kein fetch,
// kein Token-Handling hier). Der native Store (später) holt via Sign-In ein Access-Token (Scope drive.appdata)
// und führt diese Requests mit fetch aus. appDataFolder = versteckter, app-eigener, konto-gebundener Ordner im
// EIGENEN Google-Konto des Nutzers (developers.google.com/workspace/drive/api/guides/appdata). Scope non-sensitive.
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export interface DriveRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` })

/** Alle eigenen App-Dateien auflisten (nur appDataFolder). */
export function buildListRequest(token: string): DriveRequest {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime,size)',
    pageSize: '1000',
    orderBy: 'modifiedTime desc',
  })
  return { url: `${DRIVE_FILES}?${params.toString()}`, method: 'GET', headers: auth(token) }
}

/** Datei-Inhalt herunterladen (alt=media -> rohe Bytes). */
export function buildGetRequest(token: string, id: string): DriveRequest {
  return { url: `${DRIVE_FILES}/${encodeURIComponent(id)}?alt=media`, method: 'GET', headers: auth(token) }
}

export function buildDeleteRequest(token: string, id: string): DriveRequest {
  return { url: `${DRIVE_FILES}/${encodeURIComponent(id)}`, method: 'DELETE', headers: auth(token) }
}

/** Multipart-Upload in den appDataFolder: Metadaten (parents:['appDataFolder']) + gzip-Media als base64.
 *  Für sehr große Dateien (große PZN) später auf uploadType=resumable umstellen; multipart deckt den Regelfall. */
export function buildUploadRequest(token: string, name: string, base64Gzip: string, boundary = 'rqd-boundary'): DriveRequest {
  const metadata = JSON.stringify({ name, parents: ['appDataFolder'] })
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/gzip\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    `${base64Gzip}\r\n` +
    `--${boundary}--`
  return {
    url: `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`,
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }
}
