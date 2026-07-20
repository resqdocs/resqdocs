// driveCloudStore.ts — CloudBackupStore-Implementierung für ANDROID über Google Drive appDataFolder.
// Sign-In via @capgo/capacitor-social-login (nur Access-Token, Scope drive.appdata), dann reines fetch gegen
// die Drive-REST-v3-Endpunkte (Request-Builder aus driveRest.ts). NUR nativ; Plugin dynamisch importiert, damit
// der Web-Build es nicht eager lädt.
// ACHTUNG: Diese Schicht ist NICHT im Container laufzeit-testbar — der genaue Token-Pfad (login vs. stiller
// Refresh) muss am Gerät verifiziert werden. Der Token-Abruf ist bewusst in accessToken() isoliert.
import { Capacitor } from '@capacitor/core'
import { gzipString, decodeMaybeGzip, bytesToBase64Async } from '../utils/gzip.ts'
import { buildListRequest, buildGetRequest, buildDeleteRequest, buildUploadRequest, type DriveRequest } from './driveRest.ts'
import type { CloudBackupStore, CloudFile } from './cloudBackup.ts'
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_DRIVE_SCOPE } from './cloudConfig.ts'

export interface DriveCloudStore extends CloudBackupStore {
  /** Interaktiver Login (wenn der Nutzer Cloud aktiviert). true = angemeldet. */
  signIn(): Promise<boolean>
  signOut(): Promise<void>
}

let initialized = false
let cached: { token: string; expiresAt: number } | null = null

async function plugin() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  if (!initialized) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } })
    initialized = true
  }
  return SocialLogin
}

/** Access-Token für drive.appdata.
 *  interactive=false (Auto-Sync / 401-Retry): NUR stiller Refresh — es wird NIEMALS aus dem Hintergrund ein
 *    Google-Login-/Konto-Dialog erzwungen (login() mit GetSignInWithGoogleOption würde immer UI zeigen).
 *  interactive=true (Nutzer verbindet Cloud): darf als letzte Stufe login() mit Konto-/Consent-UI zeigen.
 *  Stiller Pfad: refresh() ist No-op bei gültigen Tokens, sonst stille Erneuerung über die beim ersten login()
 *  persistierten drive.appdata-Scopes; getAuthorizationCode() liefert den frischen Access-Token (flacher String). */
async function accessToken(interactive = false): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const SocialLogin = await plugin()
  try {
    await SocialLogin.refresh({ provider: 'google', options: {} })
    const auth = await SocialLogin.getAuthorizationCode({ provider: 'google' })
    const silent = (auth as { accessToken?: string } | null)?.accessToken ?? null
    if (silent) {
      cached = { token: silent, expiresAt: Date.now() + 3_300_000 } // ~55 min (stiller Pfad liefert kein expires)
      return silent
    }
  } catch {
    /* kein stiller Renew möglich (nicht angemeldet / Netzfehler) — unten anhand von interactive entscheiden */
  }
  if (!interactive) return null
  // Stufe 2 — interaktiv, nur nutzer-getriggert. forceRefreshToken entfällt (im ONLINE-Modus ein No-op).
  const { result } = await SocialLogin.login({ provider: 'google', options: { scopes: [GOOGLE_DRIVE_SCOPE] } })
  const at = (result as { accessToken?: { token?: string; expires?: string } | null }).accessToken
  const token = at?.token ?? null
  if (token) {
    const parsed = at?.expires ? Date.parse(at.expires) : NaN
    cached = { token, expiresAt: Number.isFinite(parsed) ? parsed : Date.now() + 3_300_000 }
  }
  return token
}

/** fetch mit Bearer-Token; bei 401 einmal STILL erneuern und erneut versuchen (kein Hintergrund-Dialog). */
async function authedFetch(build: (token: string) => DriveRequest): Promise<Response> {
  const REAUTH = 'Cloud: Google-Anmeldung abgelaufen — bitte Cloud einmal neu verbinden.'
  let token = await accessToken(false)
  if (!token) throw new Error(REAUTH)
  const send = (req: DriveRequest) => fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
  let res = await send(build(token))
  if (res.status === 401) {
    cached = null
    token = await accessToken(false)
    if (!token) throw new Error(REAUTH)
    res = await send(build(token))
  }
  return res
}

export function createDriveCloudStore(): DriveCloudStore {
  return {
    async available() {
      if (!Capacitor.isNativePlatform()) return false
      try {
        const SocialLogin = await plugin()
        const r = await SocialLogin.isLoggedIn({ provider: 'google' })
        return r.isLoggedIn
      } catch {
        return false
      }
    },
    async signIn() {
      if (!Capacitor.isNativePlatform()) return false
      cached = null
      // interactive=true: das ERSTE Verbinden MUSS den Login-/Consent-Dialog zeigen dürfen (ein frischer Nutzer
      // hat drive.appdata noch nie gewährt -> stiller refresh() hätte nichts zu erneuern). Danach läuft alles still.
      return (await accessToken(true)) != null
    },
    async signOut() {
      cached = null
      try {
        const SocialLogin = await plugin()
        await SocialLogin.logout({ provider: 'google' })
      } catch {
        /* ignorieren */
      }
    },
    async put(name, envelopeJson) {
      const b64 = await bytesToBase64Async(await gzipString(envelopeJson))
      const res = await authedFetch((tok) => buildUploadRequest(tok, name, b64))
      if (!res.ok) throw new Error(`Drive-Upload fehlgeschlagen (${res.status})`)
    },
    async list(): Promise<CloudFile[]> {
      const res = await authedFetch(buildListRequest)
      if (!res.ok) throw new Error(`Drive-Liste fehlgeschlagen (${res.status})`)
      const data = (await res.json()) as { files?: { id: string; name: string; modifiedTime?: string; size?: string }[] }
      return (data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime ? Date.parse(f.modifiedTime) || 0 : 0,
        size: f.size ? Number(f.size) || 0 : 0,
      }))
    },
    async get(id) {
      const res = await authedFetch((tok) => buildGetRequest(tok, id))
      if (!res.ok) return null
      return decodeMaybeGzip(new Uint8Array(await res.arrayBuffer()))
    },
    async remove(id) {
      const res = await authedFetch((tok) => buildDeleteRequest(tok, id))
      if (!res.ok && res.status !== 404) throw new Error(`Drive-Löschen fehlgeschlagen (${res.status})`)
    },
  }
}
