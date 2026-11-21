// Von aussen geoeffnete Inhalte erkennen: ein angetippter Transfer-Link (Universal Link / App Link /
// eigenes Schema von der Empfaenger-Seite) oder eine ueber das Teilen-Menue uebergebene Vorlagen-Datei.
// Rein -> node-getestet. Hier wird NICHTS abgerufen oder importiert: das Ergebnis fuehrt nur in den
// vorhandenen Empfangs-/Importpfad (TemplateIO), der vor dem Abruf nachfragt.
import { DEFAULT_TRANSFER_BASE_URL, DEFAULT_SHORT_HOST, buildTransferLink, parseTransferInput, shortCodeOf } from '@resqdocs/protocol-core/transferClient'

export type IncomingOpen =
  | { kind: 'transfer'; link: string }
  | { kind: 'file'; url: string; name: string }

/** Eigenes Schema fuer den Knopf „In der App öffnen" der Empfaenger-Seite: resqdocs://receive#<id>.<key> */
export const APP_SCHEME = 'resqdocs:'
export const APP_SCHEME_HOST = 'receive'

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim())
  } catch {
    return null
  }
}

/** Ziel hinter dem eigenen Schema. Aeltere Chromium-WebViews (vor 130) zerlegen fremde Schemata nicht
 *  in Host und Pfad: `hostname` ist dort leer und das Ziel steht als '//receive' im Pfad. */
export function appSchemeTarget(url: Pick<URL, 'hostname' | 'pathname'>): string {
  return url.hostname || (url.pathname.replace(/^\/+/, '').split('/')[0] ?? '')
}

function asTransfer(raw: string, base: string): IncomingOpen | null {
  const parsed = parseTransferInput(raw)
  return parsed ? { kind: 'transfer', link: buildTransferLink(base, parsed.id, parsed.keyB64url) } : null
}

/** Ordnet eine vom System uebergebene URL ein. null = nichts fuer uns (still ignorieren). */
export function classifyIncomingUrl(raw: string, transferBaseUrl: string = DEFAULT_TRANSFER_BASE_URL): IncomingOpen | null {
  const url = parseUrl(raw)
  const base = parseUrl(transferBaseUrl)
  if (!url || !base) return null
  const baseHref = transferBaseUrl.replace(/\/+$/, '')

  // Kurzlink (resq.li/<code>): wird erst beim Empfang zum langen Link aufgelöst.
  if (url.protocol === 'https:' && url.host === DEFAULT_SHORT_HOST) {
    const code = shortCodeOf(url.href)
    return code ? { kind: 'transfer', link: `https://${DEFAULT_SHORT_HOST}/${code}` } : null
  }
  if (url.protocol === 'https:') {
    // Nur die Wurzel des Transfer-Dienstes mit Fragment; alles andere dieser oder fremder Hosts nicht.
    if (url.host !== base.host || url.pathname !== '/' || url.hash.length < 2) return null
    return asTransfer(url.hash, baseHref)
  }
  if (url.protocol === APP_SCHEME) {
    if (appSchemeTarget(url) !== APP_SCHEME_HOST || url.hash.length < 2) return null
    return asTransfer(url.hash, baseHref)
  }
  if (url.protocol === 'file:') {
    const last = url.pathname.split('/').pop() ?? ''
    if (!/\.json$/i.test(last)) return null
    let name = last
    try {
      name = decodeURIComponent(last)
    } catch {
      /* Rohname behalten */
    }
    return { kind: 'file', url: url.href, name }
  }
  return null
}

/** Schluckt dieselbe URL, wenn das System sie kurz hintereinander doppelt meldet. Ein bewusstes
 *  zweites Antippen nach Ablauf des Fensters kommt wieder durch. */
export function createIncomingGate(windowMs = 1500, now: () => number = Date.now): { accept(url: string): boolean } {
  let lastUrl = ''
  let lastAt = -Infinity
  return {
    accept(url: string): boolean {
      const t = now()
      const repeat = url === lastUrl && t - lastAt < windowMs
      lastUrl = url
      lastAt = t
      return !repeat
    },
  }
}
