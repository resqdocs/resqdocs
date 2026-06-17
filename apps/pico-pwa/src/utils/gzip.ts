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

/** gzip-Bytes → String. */
export async function gunzipToString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

/** gzip-Magic-Bytes (1f 8b) — erkennt gezippte Backups vom Klartext-JSON. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
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
