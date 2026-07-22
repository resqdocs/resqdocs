// Zufaellige IDs/Token aus einem CSPRNG. Die Sicherheit des Transfers liegt im AES-Schluessel (im
// Fragment), NICHT in der ID — die ID muss nur schwer erratbar/aufzaehlbar sein. Alphabet ohne
// verwechselbare Zeichen (0/O, 1/I/l), damit die ID zugleich als tippbarer Kurzcode taugt.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' // 54 Zeichen

/** Unverzerrte Zufallszeichenkette (Rejection-Sampling gegen Modulo-Bias). */
function randomString(len: number): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let out = ''
  while (out.length < len) {
    const buf = crypto.getRandomValues(new Uint8Array(len - out.length))
    for (const b of buf) if (b < max) out += ALPHABET[b % ALPHABET.length]
  }
  return out
}

/** Blob-ID = zugleich Kurzcode (1:1, kein zweiter Ratepfad). 12 Zeichen ~ 69 Bit. */
export function newId(): string {
  return randomString(12)
}

/** Loesch-Token: laenger, rein zufaellig — nur der Ersteller kann vorzeitig loeschen. */
export function newDeleteToken(): string {
  return randomString(32)
}
