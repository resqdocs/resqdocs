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

/** Domain der Kurzlinks (resq.li/<code>). Ein Kurzlink verweist immer auf einen langen Link; den Schlüssel kennt
 *  dabei der Dienst, bis der Inhalt abgelaufen oder übernommen ist. */
export const DEFAULT_SHORT_HOST = 'resq.li'

export class TransferError extends Error {}

export interface TransferConfig {
  baseUrl?: string
  /** Kanal des Editors, der den Link erzeugt (z. B. 'dev' für einen Test-Editor). Er steht als
   *  `?e=<kanal>` im Link; die Empfangsseite öffnet damit den passenden Editor aus ihrer festen Liste.
   *  Fehlt er, sieht der Link aus wie bisher. */
  editor?: string
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
export function buildTransferLink(baseUrl: string, id: string, keyB64url: string, editor?: string): string {
  // Der Kanal ist ein kurzer Schlüssel, nie eine Adresse: alles andere wird weggelassen. Er steht VOR dem
  // Fragment, damit jede Stelle, die nur `#id.schlüssel` liest (auch ältere App-Versionen), unberührt bleibt.
  const channel = editor && /^[a-z0-9-]{1,16}$/.test(editor) ? `?e=${editor}` : ''
  return `${baseUrl.replace(/\/+$/, '')}/${channel}#${id}.${keyB64url}`
}

/** Beliebige Nutzereingabe (voller Link ODER nacktes `id.key`) in id+Schlüssel zerlegen. Nimmt den Teil
 *  hinter dem ERSTEN `#`; fehlt er, wird die ganze Eingabe als Fragment versucht. null bei Unfug. */
export function parseTransferInput(input: string): { id: string; keyB64url: string } | null {
  const trimmed = input.trim()
  const hash = trimmed.indexOf('#')
  return parseTransferFragment(hash >= 0 ? trimmed.slice(hash + 1) : trimmed)
}

/** Code eines Kurzlinks (`resq.li/Ab3k9`, mit oder ohne https://); sonst null. */
export function shortCodeOf(input: string): string | null {
  const m = /^(?:https?:\/\/)?resq\.li\/([A-Za-z0-9]{5})\/?$/i.exec(input.trim())
  return m ? m[1] : null
}

/** Kurzlink zu einem langen Link anlegen (nur auf ausdrücklichen Wunsch: der Dienst kennt danach den Schlüssel). */
export async function shortenTransferLink(link: string, cfg?: TransferConfig): Promise<{ code: string; url: string }> {
  let res: Response
  try {
    res = await doFetch(cfg, `${base(cfg)}/v1/short`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) })
  } catch {
    throw new TransferError('Der Transfer-Dienst ist nicht erreichbar.')
  }
  if (res.status === 404) throw new TransferError('Der Inhalt ist schon abgelaufen oder übernommen.')
  if (!res.ok) throw new TransferError('Der Kurzlink konnte nicht angelegt werden.')
  try {
    const r = (await res.json()) as { code: string; url: string }
    if (typeof r.code !== 'string' || typeof r.url !== 'string') throw new Error()
    return { code: r.code, url: r.url }
  } catch {
    throw new TransferError('Unerwartete Antwort des Transfer-Dienstes.')
  }
}

/** Kurzlink eines geteilten Inhalts wieder entfernen: der Dienst löscht den gespeicherten langen Link (mit Schlüssel)
 *  sofort. Braucht das Lösch-Token aus shareTransfer. true = entfernt. */
export async function removeShortLink(link: string, deleteToken: string, cfg?: TransferConfig): Promise<boolean> {
  const parsed = parseTransferInput(link)
  if (!parsed || !/^[A-Za-z0-9]+$/.test(parsed.id)) return false
  try {
    const res = await doFetch(cfg, `${base(cfg)}/v1/blob/${parsed.id}/short`, { method: 'DELETE', headers: { 'X-Delete-Token': deleteToken } })
    return res.ok
  } catch {
    return false
  }
}

/** Kurzlink zum langen Link auflösen. */
export async function resolveShortLink(code: string, cfg?: TransferConfig): Promise<string> {
  if (!/^[A-Za-z0-9]{5}$/.test(code)) throw new TransferError('Kein gültiger Kurzlink.')
  let res: Response
  try {
    res = await doFetch(cfg, `${base(cfg)}/v1/short/${code}`)
  } catch {
    throw new TransferError('Der Transfer-Dienst ist nicht erreichbar.')
  }
  if (res.status === 410) throw new TransferError('Der Kurzlink ist abgelaufen oder wurde schon übernommen.')
  if (res.status === 404) throw new TransferError('Diesen Kurzlink gibt es nicht. Bitte prüfen, ob er vollständig ist.')
  if (!res.ok) throw new TransferError('Der Kurzlink konnte nicht aufgelöst werden.')
  try {
    const r = (await res.json()) as { link?: unknown }
    if (typeof r.link !== 'string') throw new Error()
    return r.link
  } catch {
    throw new TransferError('Unerwartete Antwort des Transfer-Dienstes.')
  }
}

/** Eingabe für den Empfang: ein Kurzlink wird zuerst zum langen Link aufgelöst, alles andere bleibt. */
export async function expandTransferInput(input: string, cfg?: TransferConfig): Promise<string> {
  const code = shortCodeOf(input)
  return code ? resolveShortLink(code, cfg) : input
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
  return { ...meta, keyB64url, link: buildTransferLink(base(cfg), meta.id, keyB64url, cfg?.editor) }
}

/** Geöffneter Transfer. Bei „1× lesen“ reserviert der Dienst den Link nur; verbraucht ist er erst nach consume(). */
export interface OpenedTransfer {
  text: string
  /** true = der Dienst hält den Link für dieses Gerät fest („1× lesen“); false = nichts zu verbrauchen oder älterer
   *  Dienst, der „1× lesen“ schon beim Abruf verbraucht hat. */
  reserved: boolean
  /** So oft wurde der Link vorher schon geöffnet, aber nicht übernommen (nur „1× lesen“, sonst 0). */
  priorOpens: number
  /** Übernommen: Link verbrauchen. Ohne Reservierung (kein „1× lesen“, älterer Dienst) gibt es nichts zu tun. */
  consume(): Promise<boolean>
  /** Abgebrochen: Reservierung freigeben, der Link gilt wieder. */
  release(): Promise<boolean>
}

/** Wie receiveTransfer, aber ein „1× lesen“-Link gilt erst als geöffnet, wenn consume() gerufen wird. Der Dienst
 *  hält ihn bis dahin einige Minuten für dieses Gerät fest; ohne Rückmeldung gilt er danach wieder. */
export async function openTransfer(linkOrFragment: string, cfg?: TransferConfig): Promise<OpenedTransfer> {
  const parsed = parseTransferInput(await expandTransferInput(linkOrFragment, cfg))
  if (!parsed || !/^[A-Za-z0-9]+$/.test(parsed.id)) throw new TransferError('Kein gültiger Transfer-Link.')
  const res = await fetchBlob(cfg, parsed.id, { 'X-Claim': '1' })
  const token = res.headers.get('X-Claim-Token')
  const priorOpens = Number(res.headers.get('X-Prior-Opens')) || 0
  let text: string
  try {
    text = await decryptResponse(res, parsed.keyB64url)
  } catch (e) {
    // Nicht lesbar (falscher Schlüssel, abgebrochener Abruf): die Reservierung sofort aufheben, sonst wäre der Link
    // zehn Minuten für alle gesperrt.
    if (token) await doFetch(cfg, `${base(cfg)}/v1/blob/${parsed.id}/release`, { method: 'POST', headers: { 'X-Claim-Token': token } }).catch(() => {})
    throw e
  }
  const settle = async (action: 'consume' | 'release'): Promise<boolean> => {
    if (!token) return true
    try {
      const r = await doFetch(cfg, `${base(cfg)}/v1/blob/${parsed.id}/${action}`, { method: 'POST', headers: { 'X-Claim-Token': token } })
      return r.ok
    } catch {
      return false // offline: die Reservierung läuft von selbst ab, der Link gilt dann wieder
    }
  }
  let done = false
  const once = (action: 'consume' | 'release') => async (): Promise<boolean> => {
    if (done) return true
    done = true
    return settle(action)
  }
  return { text, reserved: !!token, priorOpens, consume: once('consume'), release: once('release') }
}

async function fetchBlob(cfg: TransferConfig | undefined, id: string, headers?: Record<string, string>): Promise<Response> {
  let res: Response
  try {
    res = await doFetch(cfg, `${base(cfg)}/v1/blob/${id}`, headers ? { headers } : undefined)
  } catch {
    throw new TransferError('Der Transfer-Dienst ist nicht erreichbar.')
  }
  if (res.status === 404) throw new TransferError('Der Transfer ist abgelaufen oder wurde bereits geöffnet.')
  if (res.status === 409) throw new TransferError('Der Link wird gerade auf einem anderen Gerät geöffnet. In ein paar Minuten noch einmal versuchen.')
  if (!res.ok) throw new TransferError('Der Transfer konnte nicht geladen werden.')
  return res
}

async function decryptResponse(res: Response, keyB64url: string): Promise<string> {
  let blob: Uint8Array<ArrayBuffer>
  try {
    blob = new Uint8Array(await res.arrayBuffer()) // Mid-Stream-Abbruch -> sauber als TransferError
  } catch {
    throw new TransferError('Der Transfer konnte nicht geladen werden.')
  }
  try {
    return await decryptTransfer(blob, keyB64url)
  } catch {
    throw new TransferError('Der Link ist unvollständig oder beschädigt (Entschlüsselung fehlgeschlagen).')
  }
}

/** Vorlage empfangen: Link/Fragment zerlegen, Chiffrat holen, lokal entschlüsseln. Gibt den Klartext-
 *  String (die serialisierte Vorlage) zurück — der Aufrufer schickt ihn durch routeImport/detectAndParse.
 *  Wirft TransferError bei ungültigem Link, abgelaufenem/verbranntem Blob oder falschem Schlüssel. */
export async function receiveTransfer(linkOrFragment: string, cfg?: TransferConfig): Promise<string> {
  const parsed = parseTransferInput(await expandTransferInput(linkOrFragment, cfg))
  if (!parsed) throw new TransferError('Kein gültiger Transfer-Link.')
  // id defensiv gegen den erlaubten Zeichensatz prüfen (kein Pfad-Unfug in die URL).
  if (!/^[A-Za-z0-9]+$/.test(parsed.id)) throw new TransferError('Kein gültiger Transfer-Link.')
  return decryptResponse(await fetchBlob(cfg, parsed.id), parsed.keyB64url)
}
