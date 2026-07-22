// transferClient.ts — dünner Client für den Vorlagen-Transfer. Verschlüsselt lokal (transferCrypto),
// legt NUR das Chiffrat beim Dienst ab und baut den Kurz-Link `<baseUrl>/#<id>.<key>` — der Schlüssel
// steht ausschließlich im Fragment und erreicht den Server nie. Empfangen: Link/Fragment zerlegen,
// Chiffrat holen, lokal entschlüsseln. Der resultierende Klartext-String geht beim Aufrufer 1:1 in
// routeImport (App) bzw. detectAndParse (Editor). fetch ist in WebView, Editor-Browser und Node vorhanden.
import { encryptTransfer, decryptTransfer, parseTransferFragment } from './transferCrypto.ts'

export const DEFAULT_TRANSFER_BASE_URL = 'https://transfer.resqdocs.app'

/** Gültigkeits-Wahl der UI. „1× lesen" = Burn (nach dem ersten Abruf gelöscht) mit 7-Tage-Netz gegen
 *  nie abgerufene Blobs; die Zeitstufen sind mehrfach lesbar bis zum Ablauf. */
export type TransferTtl = 'burn' | '1h' | '24h' | '7d'
const TTL_SECONDS: Record<TransferTtl, number> = { burn: 604800, '1h': 3600, '24h': 86400, '7d': 604800 }

export class TransferError extends Error {}

export interface TransferConfig {
  baseUrl?: string
  /** Test-Injektion; Default globalThis.fetch. */
  fetchImpl?: typeof fetch
}

export interface ShareResult {
  id: string
  code: string
  keyB64url: string
  /** Vollständiger Link inkl. Schlüssel im Fragment — das ist das Geheimnis, wie ein Passwort behandeln. */
  link: string
  deleteToken: string
  expiresAt: number
}

function base(cfg?: TransferConfig): string {
  return (cfg?.baseUrl ?? DEFAULT_TRANSFER_BASE_URL).replace(/\/+$/, '')
}
function doFetch(cfg: TransferConfig | undefined, url: string, init?: RequestInit): Promise<Response> {
  return (cfg?.fetchImpl ?? fetch)(url, init)
}

/** Link aus baseUrl + id + Schlüssel bauen. Schlüssel steht im Fragment (#), nie im an den Server
 *  gesendeten Teil. */
export function buildTransferLink(baseUrl: string, id: string, keyB64url: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/#${id}.${keyB64url}`
}

/** Beliebige Nutzereingabe (voller Link ODER nacktes `id.key`) in id+Schlüssel zerlegen. Nimmt den Teil
 *  hinter dem ERSTEN `#`; fehlt er, wird die ganze Eingabe als Fragment versucht. null bei Unfug. */
export function parseTransferInput(input: string): { id: string; keyB64url: string } | null {
  const trimmed = input.trim()
  const hash = trimmed.indexOf('#')
  return parseTransferFragment(hash >= 0 ? trimmed.slice(hash + 1) : trimmed)
}

/** Vorlage teilen: Klartext-String verschlüsseln, Chiffrat ablegen, Link+Code zurückgeben. */
export async function shareTransfer(
  plaintext: string,
  ttl: TransferTtl,
  cfg?: TransferConfig,
): Promise<ShareResult> {
  const { blob, keyB64url } = await encryptTransfer(plaintext)
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream', 'X-Expire': String(TTL_SECONDS[ttl]) }
  if (ttl === 'burn') headers['X-Burn'] = '1'
  let res: Response
  try {
    res = await doFetch(cfg, `${base(cfg)}/v1/blob`, { method: 'POST', headers, body: blob })
  } catch {
    throw new TransferError('Der Transfer-Dienst ist nicht erreichbar.')
  }
  if (res.status === 413) throw new TransferError('Die Vorlage ist zu groß für den Transfer.')
  if (!res.ok) throw new TransferError('Der Transfer konnte nicht angelegt werden.')
  let meta: { id: string; code: string; deleteToken: string; expiresAt: number }
  try {
    meta = (await res.json()) as { id: string; code: string; deleteToken: string; expiresAt: number }
  } catch {
    // z. B. ein 200 mit Nicht-JSON-Body (Proxy-/Captive-Portal-Seite, leerer Body) -> saubere Meldung.
    throw new TransferError('Unerwartete Antwort des Transfer-Dienstes.')
  }
  return { ...meta, keyB64url, link: buildTransferLink(base(cfg), meta.id, keyB64url) }
}

/** Vorlage empfangen: Link/Fragment zerlegen, Chiffrat holen, lokal entschlüsseln. Gibt den Klartext-
 *  String (die serialisierte Vorlage) zurück — der Aufrufer schickt ihn durch routeImport/detectAndParse.
 *  Wirft TransferError bei ungültigem Link, abgelaufenem/verbranntem Blob oder falschem Schlüssel. */
export async function receiveTransfer(linkOrFragment: string, cfg?: TransferConfig): Promise<string> {
  const parsed = parseTransferInput(linkOrFragment)
  if (!parsed) throw new TransferError('Kein gültiger Transfer-Link.')
  // id defensiv gegen den erlaubten Zeichensatz prüfen (kein Pfad-Unfug in die URL).
  if (!/^[A-Za-z0-9]+$/.test(parsed.id)) throw new TransferError('Kein gültiger Transfer-Link.')
  let res: Response
  try {
    res = await doFetch(cfg, `${base(cfg)}/v1/blob/${parsed.id}`)
  } catch {
    throw new TransferError('Der Transfer-Dienst ist nicht erreichbar.')
  }
  if (res.status === 404) throw new TransferError('Der Transfer ist abgelaufen oder wurde bereits geöffnet.')
  if (!res.ok) throw new TransferError('Der Transfer konnte nicht geladen werden.')
  let blob: Uint8Array<ArrayBuffer>
  try {
    blob = new Uint8Array(await res.arrayBuffer()) // Mid-Stream-Abbruch -> sauber als TransferError
  } catch {
    throw new TransferError('Der Transfer konnte nicht geladen werden.')
  }
  try {
    return await decryptTransfer(blob, parsed.keyB64url)
  } catch {
    throw new TransferError('Der Link ist unvollständig oder beschädigt (Entschlüsselung fehlgeschlagen).')
  }
}
