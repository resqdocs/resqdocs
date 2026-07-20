// gzip.ts — gzip/gunzip über die eingebaute CompressionStream-API (#194/#197).
//
// Bordmittel, KEIN Dependency: CompressionStream/DecompressionStream sind auf
// iOS 18 (WKWebView), Android-WebView und modernen Browsern verfügbar. Für die
// PZN-Bibliothek: Backup als gezipptes JSON (kleiner als CSV, robust gegen
// Sonderzeichen/führende Nullen).

/** JSON-/Text-String → gzip-Bytes. */
export async function gzipString(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** gzip-Bytes → entpackte ROHE Bytes (für mehrschichtiges Entpacken; NICHT text-dekodiert). */
export async function gunzipToBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** gzip-Bytes → String (UTF-8). Dünner Wrapper über gunzipToBytes. */
export async function gunzipToString(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await gunzipToBytes(bytes))
}

/** gzip-Magic-Bytes (1f 8b) — erkennt gezippte Backups vom Klartext-JSON. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

/** Max. gzip-Schichten, die der Import entpackt (deckt roh/einfach/doppelt mit 1 Reserve ab). */
const MAX_GZIP_LAYERS = 3

/**
 * Robustes Entpacken einer Backup-Datei zu JSON-Text. Erkennt gzip über Magic-Bytes
 * (1f 8b) und entpackt SCHICHTWEISE auf Byte-Ebene — so wird auch ein doppelt-gzipptes
 * Backup (iOS-/HTTP-Transport re-gzippt die schon gezippte Download-Datei) korrekt gelesen,
 * während rohes JSON (kein Magic) und einfach-gzip unverändert funktionieren. Pro Schicht
 * werden ROHE Bytes weitergereicht (nicht text-dekodiert), erst das endgültige Nicht-gzip-
 * Ergebnis wird als UTF-8 dekodiert.
 *
 * Defensiv: hartes Limit MAX_GZIP_LAYERS gegen Endlos-/Bomben-Verschachtelung — bleibt
 * danach noch gzip übrig, ist die Datei ungültig (→ null). Korruptes/abgeschnittenes gzip
 * (DecompressionStream wirft) → ebenfalls null, statt eines unbehandelten Fehlers. Die
 * Schema-/Inhaltsprüfung (parseImport) bleibt UNVERÄNDERT beim Aufrufer; hier wird nur der
 * JSON-Text gewonnen. null = „ungültige Datei".
 */
export async function decodeMaybeGzip(bytes: Uint8Array): Promise<string | null> {
  let cur = bytes
  let layers = 0
  try {
    while (isGzip(cur) && layers < MAX_GZIP_LAYERS) {
      cur = await gunzipToBytes(cur)
      layers++
    }
  } catch {
    return null // korruptes/abgeschnittenes gzip → ungültige Datei
  }
  if (isGzip(cur)) return null // nach MAX_GZIP_LAYERS noch gzip → zu viele Schichten / Bombe
  return new TextDecoder().decode(cur)
}

/** Uint8Array → base64 (für Capacitor Filesystem, das Binärdaten base64 schreibt). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Wie bytesToBase64, aber NICHT-blockierend: gibt regelmäßig dem Event-Loop das Zeichnen frei (yield) und
 *  meldet Fortschritt. Für große PZN-Backups, damit die UI beim Packen nicht einfriert. */
export async function bytesToBase64Async(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  let bin = ''
  const CHUNK = 0x8000
  let sinceYield = 0
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    if (++sinceYield >= 16) {
      sinceYield = 0
      onProgress?.(Math.min(i + CHUNK, bytes.length), bytes.length)
      await new Promise((r) => setTimeout(r)) // Macrotask-Yield -> UI kann zeichnen
    }
  }
  onProgress?.(bytes.length, bytes.length)
  return btoa(bin)
}
