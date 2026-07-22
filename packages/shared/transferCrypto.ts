// transferCrypto.ts — reine WebCrypto-Ende-zu-Ende-Verschluesselung fuer den Vorlagen-Transfer
// (PrivateBin-Muster). Verschluesselt einen Klartext-String (die serialisierte Vorlage aus
// exportTemplate/exportBlock/exportSnippet) mit AES-GCM-256; der Server sieht NUR das opake Blob.
//
// Transport-Blob = IV(12 B) || Chiffrat(inkl. 16 B GCM-Tag). Der Schluessel verlaesst den Client NIE
// im Klartext an den Server — er wird base64url kodiert und gehoert ausschliesslich ins URL-Fragment
// (#<id>.<key>), das der Browser nicht mitsendet. Frischer Key UND frische IV pro Blob -> IV-Reuse
// strukturell ausgeschlossen. Der GCM-Tag scheitert bei jeder Manipulation automatisch (AEAD-Integritaet).
//
// Vue-/Node-/WKWebView-tauglich: nur globalThis.crypto.subtle + btoa/atob, keine Dependency. WebCrypto
// ist im WKWebView bereits produktiv (useMedicationLookup.ts) und in Node vorhanden.

const IV_BYTES = 12
const encoder = new TextEncoder()
const decoder = new TextDecoder()

// 4-Byte-Kennung „RQD1" am Anfang jedes Transport-Blobs. UNVERSCHLUESSELT (verraet nichts — die Vorlage
// bleibt im Chiffrat), markiert das Blob aber als ResQDocs-Transfer-Umschlag. Der Dienst weist alles
// zurueck, was NICHT so beginnt (kein generischer Datei-Ablageplatz). Layout: MAGIC(4)‖IV(12)‖CT(+Tag).
export const TRANSFER_MAGIC = new Uint8Array([0x52, 0x51, 0x44, 0x31]) // "RQD1"
const HEADER = TRANSFER_MAGIC.length + IV_BYTES

/** true, wenn das Blob mit der ResQDocs-Transfer-Kennung beginnt. Auch serverseitig geprueft. */
export function hasTransferMagic(blob: Uint8Array): boolean {
  if (blob.length < TRANSFER_MAGIC.length) return false
  for (let i = 0; i < TRANSFER_MAGIC.length; i++) if (blob[i] !== TRANSFER_MAGIC[i]) return false
  return true
}

/** Uint8Array -> base64url (RFC 4648 §5, ohne Padding, url-/QR-sicher). */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url -> Uint8Array (ArrayBuffer-gestützt, damit direkt WebCrypto-/fetch-tauglich). */
export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + (s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface EncryptedTransfer {
  /** Opakes Transport-Blob MAGIC||IV||CT||Tag — genau das geht an den Server. */
  blob: Uint8Array<ArrayBuffer>
  /** Roher AES-Schluessel als base64url — gehoert NUR ins URL-Fragment, nie an den Server. */
  keyB64url: string
}

/** Klartext-String verschluesseln. Erzeugt einen frischen 256-Bit-Schluessel + 96-Bit-IV pro Aufruf.
 *  Blob = MAGIC(4)‖IV(12)‖CT(+Tag). */
export async function encryptTransfer(plaintext: string): Promise<EncryptedTransfer> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)))
  const blob = new Uint8Array(HEADER + ct.length)
  blob.set(TRANSFER_MAGIC, 0)
  blob.set(iv, TRANSFER_MAGIC.length)
  blob.set(ct, HEADER)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return { blob, keyB64url: toBase64Url(raw) }
}

/** Transport-Blob mit dem base64url-Schluessel entschluesseln. Wirft bei fehlender Kennung, zu kurzem
 *  Blob, falschem Schluessel ODER manipuliertem Chiffrat (GCM-Tag) — der Aufrufer behandelt das als „ungueltig". */
export async function decryptTransfer(blob: Uint8Array<ArrayBuffer>, keyB64url: string): Promise<string> {
  if (blob.length <= HEADER) throw new Error('Transfer-Blob zu kurz.')
  if (!hasTransferMagic(blob)) throw new Error('Kein ResQDocs-Transfer.')
  const iv = blob.subarray(TRANSFER_MAGIC.length, HEADER)
  const ct = blob.subarray(HEADER)
  const key = await crypto.subtle.importKey('raw', fromBase64Url(keyB64url), { name: 'AES-GCM' }, false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return decoder.decode(pt)
}

/** Fragment `<id>.<key>` in seine Teile zerlegen. Der Schluessel kann selbst keinen Punkt enthalten
 *  (base64url), also trennt der ERSTE Punkt sauber. null bei fehlendem Teil. */
export function parseTransferFragment(fragment: string): { id: string; keyB64url: string } | null {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment
  const dot = raw.indexOf('.')
  if (dot <= 0 || dot === raw.length - 1) return null
  const id = raw.slice(0, dot)
  // id-Zeichensatz defensiv HIER pruefen (nicht nur im Aufrufer) — damit kein kuenftiger Nutzer der id
  // Pfad-/Query-Zeichen einschmuggelt, wenn er sie ungeprueft in eine URL steckt. Symmetrisch zum
  // ausgelieferten receiverPage-Zwilling. Der Schluessel (base64url) enthaelt selbst keinen Punkt.
  if (!/^[A-Za-z0-9]+$/.test(id)) return null
  return { id, keyB64url: raw.slice(dot + 1) }
}
