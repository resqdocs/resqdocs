// HTTP-Dienst des Vorlagen-Transfers. Drei Endpunkte + Healthcheck, node:http, keine Framework-
// Dependency. Der Dienst ist KRYPTO-AGNOSTISCH: er nimmt opake Blobs an und gibt sie heraus, ohne je
// Klartext oder Schluessel zu sehen. CORS offen (App via capacitor://, Editor via https), damit die
// Browser-Clients direkt sprechen koennen. TLS/Rate-Limit terminieren bevorzugt am externen Proxy.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { isIPv6 } from 'node:net'
import { createStore, BlobTooLargeError, StoreFullError, MAX_BLOB_BYTES, DEFAULT_MAX_BLOBS, DEFAULT_MAX_TOTAL_BYTES, type BlobStore } from './store.ts'
import { createRateLimiter, type RateLimiter } from './rateLimiter.ts'
import { readFileSync } from 'node:fs'
import { receiverHtml, goneHtml } from './receiverPage.ts'
import { parseAppLinksEnv, buildAppleAppSiteAssociation, buildAssetLinks, type AppLinksConfig } from './appLinks.ts'

// Sicherheits-Header der Empfaenger-Seite. no-referrer: beim „Im Editor oeffnen" darf weder Pfad noch
// id an die Editor-Herkunft lecken (das Fragment strippt der Browser ohnehin aus dem Referer). CSP
// blockt jeden externen Request; die Seite ist vollstaendig self-contained.
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  // frame-ancestors wirkt NUR als HTTP-Header (im <meta> ignorieren Browser es) -> hier setzen, damit die
  // Seite nicht in fremde iframes einbettbar ist (Clickjacking-Haertung). X-Frame-Options als Altlast-Fallback.
  'Content-Security-Policy': "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

// ResQDocs-Transfer-Kennung „RQD1" (muss mit TRANSFER_MAGIC in packages/shared/transferCrypto.ts
// uebereinstimmen). Der Dienst ist bewusst standalone (keine shared-Abhaengigkeit) -> die 4 Bytes hier
// dupliziert. Der Server weist alles zurueck, was nicht so beginnt: kein generischer Datei-Ablageplatz.
// (Hinweis: bei echter E2E kann der Server den ENTSCHLUESSELTEN Inhalt nicht pruefen — dies ist eine
// Umschlag-/Form-Pruefung, kein Inhalts-Beweis.)
const MAGIC = Buffer.from([0x52, 0x51, 0x44, 0x31])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Expire, X-Burn, X-Delete-Token, X-Claim, X-Claim-Token',
  'Access-Control-Expose-Headers': 'X-Claim-Token, X-Prior-Opens',
  'Access-Control-Max-Age': '86400',
}

function send(res: ServerResponse, status: number, body?: string | Buffer, headers: Record<string, string> = {}): void {
  res.writeHead(status, { ...CORS, ...headers })
  res.end(body)
}

/** Body bis MAX lesen; bei Ueberschreitung sofort 413 und Verbindung kappen. */
function readBody(req: IncomingMessage, res: ServerResponse, max: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let aborted = false
    req.on('data', (c: Buffer) => {
      if (aborted) return
      size += c.length
      if (size > max) {
        aborted = true
        send(res, 413, 'Blob zu gross.')
        req.destroy()
        resolve(null)
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks))
    })
    req.on('error', () => {
      if (!aborted) resolve(null)
    })
  })
}

/** Rate-Limit-Schluessel = die ECHTE Client-IP. Standard: der Verbindungs-Peer (Socket-Adresse). Hinter dem
 *  Reverse-Proxy ist dieser Peer immer die PROXY-IP -> der Limiter waere global. Damit er wirklich PER-IP
 *  greift, wird — und NUR dann — die vom Proxy angehaengte echte Client-IP (letzter X-Forwarded-For-Eintrag)
 *  genutzt, wenn der Verbindungs-Peer der konfigurierte `trustedProxy` ist. Von JEDEM anderen Peer wird
 *  X-Forwarded-For NIE vertraut (Spoofing-Schutz, CWE-348): dort bleibt es bei der Socket-Adresse. Rein
 *  fluechtig (rateLimiter-Map, maxKeys-begrenzt), nie persistiert. */
/** IPv6-Adressen auf ihr /64-Netz kürzen: ein Anschluss hat meist ein ganzes /64, sonst zählte jede Adresse einzeln. */
export function limitKeyOf(ip: string): string {
  if (!isIPv6(ip) || /^::ffff:\d/.test(ip)) return ip
  const [head, tail = ''] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

export function clientKey(req: IncomingMessage, trustedProxy?: string | null): string {
  const peer = req.socket.remoteAddress || 'unknown'
  if (trustedProxy && peer === trustedProxy) {
    // Bevorzugt X-Real-IP (der Proxy setzt genau EINE, vom Client nicht beeinflussbare Adresse) — robuster
    // als das Parsen von X-Forwarded-For, das bei falscher Proxy-Konfig (verbatim durchgereichtes XFF) vom
    // Client kontrollierbar waere. Fallback: letzter XFF-Hop. Beides nur vom vertrauenswuerdigen Peer.
    const real = req.headers['x-real-ip']
    if (typeof real === 'string' && real.trim()) return `ip:${limitKeyOf(real.trim())}`
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string') {
      const last = xff.split(',').map((s) => s.trim()).filter(Boolean).pop()
      if (last) return `xff:${limitKeyOf(last)}`
    }
  }
  return `ip:${limitKeyOf(peer)}`
}

/** Kurzlink-Domain und Ziel-Adresse der langen Links. */
export const DEFAULT_SHORT_HOST = 'resq.li'
export const DEFAULT_PUBLIC_BASE = 'https://transfer.resqdocs.app'
const SHORT_CODE = /^[A-Za-z0-9]{5}$/
/** Weiterleitungen auf der Kurzlink-Domain, falls der Proxy sie nicht schon erledigt. */
const SHORT_HOST_REDIRECTS: Record<string, string> = {
  '/': 'https://resqdocs.app/',
  '/editor': 'https://editor.resqdocs.app/',
  '/editor/': 'https://editor.resqdocs.app/',
  '/ai': 'https://ai.resqdocs.app/',
  '/ai/': 'https://ai.resqdocs.app/',
}

/** Langen Link prüfen: genau `<base>/` [+ `?e=<kanal>`] + `#<id>.<schlüssel>`. Gibt die Blob-ID zurück, sonst null. */
export function longLinkBlobId(link: string, base: string): string | null {
  const b = base.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^${b}/(?:\\?e=[a-z0-9-]{1,16})?#([A-Za-z0-9]{1,32})\\.([A-Za-z0-9_-]{16,64})$`).exec(link)
  return m ? m[1] : null
}

// Vorschaubild für Link-Vorschauen (Open Graph), 1200 × 630. Liegt in src/, damit Deploy und Image es mitnehmen.
const OG_PNG = readFileSync(new URL('./assets/og-transfer.png', import.meta.url))

export interface ServerOptions {
  store: BlobStore
  postLimiter?: RateLimiter | null
  getLimiter?: RateLimiter | null
  deleteLimiter?: RateLimiter | null
  /** Socket-Adresse des vertrauenswuerdigen Reverse-Proxys; nur von ihm wird X-Forwarded-For geglaubt. */
  trustedProxy?: string | null
  /** App-Zuordnung (Universal Links / App Links). Fehlt sie, antworten die .well-known-Pfade mit 404. */
  appLinks?: AppLinksConfig | null
  /** Auflösen von Kurzlinks je Anschluss (eigenes, strengeres Limit als Blob-Abrufe). */
  shortLimiter?: RateLimiter | null
  /** Fehlversuche beim Auflösen je Anschluss: wer zu oft einen unbekannten Code abfragt, bekommt für den Rest des
   *  Fensters 429. Gilt nur für diesen Anschluss; gültige Kurzlinks anderer bleiben erreichbar. */
  shortMissLimiter?: RateLimiter | null
  /** Anlegen von Kurzlinks je Anschluss (strenger als das Ablegen von Inhalten). */
  shortCreateLimiter?: RateLimiter | null
  /** Host der Kurzlinks (Standard resq.li); Anfragen mit diesem Host bekommen Weiterleitungen statt der Empfangsseite. */
  shortHost?: string
  /** Adresse der langen Links (Standard https://transfer.resqdocs.app); nur solche Ziele nimmt der Kurzlink an. */
  publicBase?: string
}

export function createTransferServer(opts: ServerOptions) {
  const { store, postLimiter = null, getLimiter = null, deleteLimiter = null, trustedProxy = null, appLinks = null } = opts
  const shortHost = (opts.shortHost ?? DEFAULT_SHORT_HOST).toLowerCase()
  const publicBase = (opts.publicBase ?? DEFAULT_PUBLIC_BASE).replace(/\/+$/, '')
  // Einmal beim Start gebaut: statischer, oeffentlicher Inhalt (die Betriebssysteme rufen ihn selbst ab).
  const wellKnown: Record<string, string | null> = {
    '/.well-known/apple-app-site-association': appLinks ? buildAppleAppSiteAssociation(appLinks) : null,
    '/.well-known/assetlinks.json': appLinks ? buildAssetLinks(appLinks) : null,
  }
  const shortAasa = appLinks ? buildAppleAppSiteAssociation(appLinks, 'short') : null
  const shortLimiter = opts.shortLimiter ?? null
  const shortMissLimiter = opts.shortMissLimiter ?? null
  const shortCreateLimiter = opts.shortCreateLimiter ?? null
  const receiverPage = receiverHtml(publicBase)
  const gonePage = goneHtml(publicBase)
  /** false = dieser Anschluss ist am Limit (Anfragen insgesamt oder Fehlversuche). */
  const mayResolve = (req: IncomingMessage): boolean => {
    const key = clientKey(req, trustedProxy)
    if (shortMissLimiter?.full(key)) return false
    return !shortLimiter || shortLimiter.allow(key)
  }
  const countMiss = (req: IncomingMessage): void => {
    shortMissLimiter?.allow(clientKey(req, trustedProxy))
  }

  const server = createHttpServer(async (req, res) => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (method === 'OPTIONS') return send(res, 204)
    if (method === 'GET' && path === '/healthz') return send(res, 200, 'ok')

    // Kurzlink-Domain (resq.li): /<code> leitet auf den langen Link weiter. Keine Empfangsseite, keine API.
    const host = String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
    if (host === shortHost && (method === 'GET' || method === 'HEAD')) {
      if (path === '/.well-known/apple-app-site-association' || path === '/.well-known/assetlinks.json') {
        const body = path.endsWith('assetlinks.json') ? wellKnown[path] : shortAasa
        if (body === null) return send(res, 404, 'Nicht konfiguriert.')
        return send(res, 200, method === 'HEAD' ? undefined : body, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      }
      if (Object.hasOwn(SHORT_HOST_REDIRECTS, path)) return send(res, 302, undefined, { Location: SHORT_HOST_REDIRECTS[path], 'Cache-Control': 'no-store' })
      const code = path.slice(1).replace(/\/$/, '')
      if (SHORT_CODE.test(code)) {
        if (!mayResolve(req)) return send(res, 429, 'Zu viele Anfragen.')
        const r = store.resolve(code)
        if (r.kind === 'ok') return send(res, 302, undefined, { Location: r.target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
        if (r.kind === 'missing') countMiss(req)
      }
      return send(res, 404, method === 'HEAD' ? undefined : gonePage, { ...PAGE_HEADERS, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'" })
    }

    // POST /v1/short — Kurzlink zu einem langen Link anlegen (Body JSON {link}). Der Server kennt danach den
    // Schlüssel, bis der Inhalt weg ist; deshalb nur auf ausdrücklichen Wunsch beim Teilen.
    if (method === 'POST' && path === '/v1/short') {
      const limiter = shortCreateLimiter ?? postLimiter
      if (limiter && !limiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const body = await readBody(req, res, 2048)
      if (body === null) return
      let link = ''
      try {
        const parsed = JSON.parse(body.toString('utf8')) as { link?: unknown }
        link = typeof parsed.link === 'string' ? parsed.link : ''
      } catch {
        return send(res, 400, 'Kein JSON.')
      }
      const blobId = longLinkBlobId(link, publicBase)
      if (!blobId) return send(res, 400, 'Kein Transfer-Link.')
      try {
        const made = store.shorten(blobId, link)
        if (!made) return send(res, 404, 'Nicht gefunden oder abgelaufen.')
        return send(res, 201, JSON.stringify({ code: made.code, url: `https://${shortHost}/${made.code}`, expiresAt: made.expiresAt }), { 'Content-Type': 'application/json' })
      } catch (err) {
        if (err instanceof StoreFullError) return send(res, 507, 'Speicher voll — bitte spaeter erneut.')
        return send(res, 500, 'Serverfehler.')
      }
    }

    // GET /v1/short/:code — Kurzlink zum langen Link auflösen (App, Editor). 410 = abgelaufen/übernommen.
    const shortMatch = method === 'GET' && /^\/v1\/short\/([A-Za-z0-9]+)$/.exec(path)
    if (shortMatch) {
      if (!mayResolve(req)) return send(res, 429, 'Zu viele Anfragen.')
      const r = SHORT_CODE.test(shortMatch[1]) ? store.resolve(shortMatch[1]) : { kind: 'missing' as const }
      if (r.kind === 'missing') {
        countMiss(req)
        return send(res, 404, 'Nicht gefunden.')
      }
      if (r.kind === 'expired') return send(res, 410, 'Abgelaufen.')
      return send(res, 200, JSON.stringify({ link: r.target }), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    }

    // GET / (+ HEAD) — Empfaenger-Seite. Ohne diese bekaemen Browser-Oeffner eines Links einen 404;
    // stattdessen entschluesselt diese self-contained Seite den Inhalt lokal aus dem URL-Fragment.
    // Der Schluessel erreicht den Server hier NIE (Fragment wird nicht mitgesendet).
    if ((method === 'GET' || method === 'HEAD') && path === '/') {
      return send(res, 200, method === 'HEAD' ? undefined : receiverPage, PAGE_HEADERS)
    }

    // GET /og-transfer.png — festes Vorschaubild für Messenger (og:image der Empfangsseite).
    if ((method === 'GET' || method === 'HEAD') && path === '/og-transfer.png') {
      return send(res, 200, method === 'HEAD' ? undefined : OG_PNG, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      })
    }

    // GET /v1/blob/:id/info — nur „1× lesen“ und Restlaufzeit für die Empfangsseite. Liefert, reserviert und
    // verbraucht den Inhalt nicht; die id steht ohnehin im Link.
    const infoMatch = method === 'GET' && /^\/v1\/blob\/([A-Za-z0-9]+)\/info$/.exec(path)
    if (infoMatch) {
      if (getLimiter && !getLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const info = store.info(infoMatch[1])
      if (!info) return send(res, 404, 'Nicht gefunden oder abgelaufen.')
      return send(res, 200, JSON.stringify(info), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    }

    // GET /.well-known/… — App-Zuordnung fuer angetippte Links. Muss ohne Umleitung als JSON kommen.
    if ((method === 'GET' || method === 'HEAD') && Object.hasOwn(wellKnown, path)) {
      const body = wellKnown[path]
      if (body === null) return send(res, 404, 'Nicht konfiguriert.')
      return send(res, 200, method === 'HEAD' ? undefined : body, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })
    }

    // POST /v1/blob — Chiffrat ablegen
    if (method === 'POST' && path === '/v1/blob') {
      if (postLimiter && !postLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const body = await readBody(req, res, MAX_BLOB_BYTES)
      if (body === null) return // 413/Abbruch bereits gesendet
      if (body.length === 0) return send(res, 400, 'Leerer Body.')
      // Umschlag-Pruefung: nur ResQDocs-Transfer-Blobs annehmen (Form, nicht Inhalt — E2E-bedingt).
      if (body.length < MAGIC.length || !body.subarray(0, MAGIC.length).equals(MAGIC)) {
        return send(res, 415, 'Kein ResQDocs-Transfer.')
      }
      const ttl = Number(req.headers['x-expire'])
      const burn = req.headers['x-burn'] === '1'
      try {
        const meta = store.put(new Uint8Array(body), ttl, burn)
        return send(res, 201, JSON.stringify(meta), { 'Content-Type': 'application/json' })
      } catch (err) {
        if (err instanceof BlobTooLargeError) return send(res, 413, 'Blob zu gross.')
        if (err instanceof StoreFullError) return send(res, 507, 'Speicher voll — bitte spaeter erneut.')
        return send(res, 500, 'Serverfehler.')
      }
    }

    // GET /v1/blob/:idOrCode — Chiffrat holen. „1× lesen“: ohne X-Claim sofort verbraucht (wie bisher), mit
    // X-Claim: 1 nur reserviert, bis der Empfänger übernimmt (consume) oder abbricht (release).
    const getMatch = method === 'GET' && /^\/v1\/blob\/([A-Za-z0-9]+)$/.exec(path)
    if (getMatch) {
      if (getLimiter && !getLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const r = store.fetch(getMatch[1], { claim: req.headers['x-claim'] === '1' })
      if (r.kind === 'missing') return send(res, 404, 'Nicht gefunden oder abgelaufen.')
      if (r.kind === 'busy') return send(res, 409, 'Wird gerade auf einem anderen Gerät geöffnet.')
      // no-store: kein zwischengeschalteter (Proxy-)Cache darf das Chiffrat ueber die serverseitige
      // Loeschung/Burn hinaus vorhalten (rueckstandsfreies Loeschen, Anforderung d). Ohne Key ohnehin wertlos.
      return send(res, 200, Buffer.from(r.blob), {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Prior-Opens': String(r.priorOpens),
        ...(r.claimToken ? { 'X-Claim-Token': r.claimToken } : {}),
      })
    }

    // POST /v1/blob/:id/consume | /release — reservierten „1× lesen“-Link verbrauchen bzw. freigeben (mit Token)
    const claimMatch = method === 'POST' && /^\/v1\/blob\/([A-Za-z0-9]+)\/(consume|release)$/.exec(path)
    if (claimMatch) {
      if (deleteLimiter && !deleteLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const token = req.headers['x-claim-token']
      const ok = typeof token === 'string' && (claimMatch[2] === 'consume' ? store.consume(claimMatch[1], token) : store.release(claimMatch[1], token))
      return send(res, ok ? 204 : 404, ok ? undefined : 'Nicht gefunden.')
    }

    // DELETE /v1/blob/:id/short — Kurzlink zurücknehmen (mit dem Lösch-Token des Inhalts); der Inhalt bleibt.
    const unshortMatch = method === 'DELETE' && /^\/v1\/blob\/([A-Za-z0-9]+)\/short$/.exec(path)
    if (unshortMatch) {
      if (deleteLimiter && !deleteLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const token = req.headers['x-delete-token']
      const ok = typeof token === 'string' && store.unshorten(unshortMatch[1], token)
      return send(res, ok ? 204 : 404, ok ? undefined : 'Nicht gefunden.')
    }

    // DELETE /v1/blob/:id — vorzeitig loeschen (mit Token)
    const delMatch = method === 'DELETE' && /^\/v1\/blob\/([A-Za-z0-9]+)$/.exec(path)
    if (delMatch) {
      if (deleteLimiter && !deleteLimiter.allow(clientKey(req, trustedProxy))) return send(res, 429, 'Zu viele Anfragen.')
      const token = req.headers['x-delete-token']
      const ok = typeof token === 'string' && store.remove(delMatch[1], token)
      return send(res, ok ? 204 : 404, ok ? undefined : 'Nicht gefunden.')
    }

    return send(res, 404, 'Unbekannter Endpunkt.')
  })
  // Slowloris/slow-body-Schutz: langsame/haengende Requests hart beenden (readBody hat kein eigenes Timeout,
  // sonst haelt ein Angreifer mit tropfenweisem Body beliebig viele Verbindungen offen). Defense-in-Depth
  // unabhaengig vom externen Proxy.
  server.headersTimeout = 10_000
  server.requestTimeout = 20_000
  return server
}

// --- Direkter Start (Container-Entry) --------------------------------------------------------------
// Nur wenn direkt ausgefuehrt (nicht im Test importiert).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const dbPath = process.env.TRANSFER_DB ?? '/data/transfer.db'
  const port = Number(process.env.PORT ?? 8086)
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  // NUR positive endliche Zahlen akzeptieren: `Number(x) || DEFAULT` wuerde bei einem negativen Env-Wert
  // greifen (z. B. -1 ist truthy) und den Cap ins Absurde ziehen -> 507 fuer ALLE. Fehlkonfig faellt auf Default.
  const posIntEnv = (v: string | undefined, def: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : def
  }
  const maxBlobs = posIntEnv(process.env.TRANSFER_MAX_BLOBS, DEFAULT_MAX_BLOBS)
  const maxTotalBytes = posIntEnv(process.env.TRANSFER_MAX_TOTAL_BYTES, DEFAULT_MAX_TOTAL_BYTES)
  const store = createStore(db, undefined, maxBlobs, maxTotalBytes)
  // PER-IP-Rate-Limit (nicht mehr nur global): der Limiter keyed auf die ECHTE Client-IP — hinter dem
  // Proxy via letztem X-Forwarded-For, aber NUR wenn der Verbindungs-Peer TRUSTED_PROXY ist (sonst Socket,
  // spoofsicher). So kann ein einzelner Abrufer nicht das Budget aller Nutzer auffressen. Per Env abschaltbar.
  const rl = process.env.RATE_LIMIT !== 'off'
  const trustedProxy = process.env.TRUSTED_PROXY || null
  const postLimiter = rl ? createRateLimiter(60, 60_000) : null
  const getLimiter = rl ? createRateLimiter(300, 60_000) : null
  const deleteLimiter = rl ? createRateLimiter(60, 60_000) : null
  // Kurzlinks: je Anschluss (IPv6 je /64) 20 Auflösungen pro Minute und höchstens 5 Fehlversuche pro Minute (danach
  // für diesen Anschluss 429 bis zum Ende des Fensters); Anlegen höchstens 10 pro Minute. Bewusst keine Sperre für
  // alle: sonst könnte ein Einzelner jeden Kurzlink unerreichbar machen.
  const shortLimiter = rl ? createRateLimiter(20, 60_000) : null
  const shortMissLimiter = rl ? createRateLimiter(5, 60_000) : null
  const shortCreateLimiter = rl ? createRateLimiter(10, 60_000) : null
  // RIGOROSES Loeschen abgelaufener Blobs: SOFORT beim Start (falls Links waehrend eines Neustarts abliefen),
  // dann alle 60 s. secure_delete + auto_vacuum entfernen den Inhalt spurlos + geben Seiten sofort ans OS
  // zurueck; wal_checkpoint(TRUNCATE) spuelt zusaetzlich das WAL-Journal, damit dort keine Restspur bleibt.
  const cleanup = (): void => {
    store.sweep()
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  }
  cleanup()
  setInterval(cleanup, 60_000).unref()
  const appLinks = parseAppLinksEnv(process.env)
  const server = createTransferServer({ store, postLimiter, getLimiter, deleteLimiter, shortLimiter, shortMissLimiter, shortCreateLimiter, trustedProxy, appLinks, shortHost: process.env.SHORT_HOST || undefined, publicBase: process.env.PUBLIC_BASE || undefined })
  // Verbindungs-Obergrenze gegen Speicher-DoS: jede offene Verbindung kann bis zu 512 KB Body puffern.
  // Deckel * 512 KB haelt den Body-Speicher weit unter mem_limit (256m). Der Rate-Limiter zaehlt nur
  // Requests/Minute, nicht Gleichzeitigkeit — deshalb hier zusaetzlich harte Concurrency-Grenze. Am externen
  // Proxy zusaetzlich `limit_conn` pro IP setzen (bindende Deploy-Voraussetzung, siehe README/compose).
  server.maxConnections = Number(process.env.MAX_CONNECTIONS) || 128
  // EINZIGE Ausgabe ist diese Startzeile (kein Request-/Datenlog). Der Container laeuft mit
  // logging: "none" -> auch sie wird verworfen.
  server.listen(port, () => {
    console.log(`transfer service on :${port}`)
  })
}
