// scanProfiles.ts - zentrale Decoder-Profile fuer den nativen Scanner.
//
// Android (CameraX + ZXing-C++) und iOS (AVFoundation + ZXing-C++) bekommen GENAU diese Werte,
// damit beide Plattformen gleich dekodieren. Die nativen Wrapper haben unterschiedliche Voreinstellungen
// (Android: alle try*-Optionen aus, iOS: an) - deshalb wird hier jede Option ausdruecklich gesetzt.
// tryDenoise bleibt aus: der iOS-Wrapper bietet es nicht an, und Einheitlichkeit geht vor.
//
// Die Plugins liefern Rohbytes; den Zeichensatz bestimmt das Profil. Der Medikationsplan ist laut
// Spezifikation ISO-8859-1 kodiert - die Zeichensatz-Heuristik des Decoders wird so umgangen.

export type ScanFormat = 'DataMatrix' | 'QRCode' | 'Code39' | 'PZN'
export type ScanCharset = 'iso-8859-1' | 'utf-8'
/** Erkanntes Format, plattformneutral (nativ und WebView liefern dasselbe). */
export type ScanResultFormat = 'datamatrix' | 'qrcode' | 'code39' | 'unknown'
/** Ergebnis eines Scans, wie es das Overlay an den Aufrufer gibt. Nie loggen/speichern. */
export interface ScanResult {
  text: string
  format: ScanResultFormat
}

export interface DecoderOptions {
  tryHarder: boolean
  tryRotate: boolean
  tryInvert: boolean
  tryDownscale: boolean
  tryDenoise: boolean
}

export interface ScanProfile {
  formats: ScanFormat[]
  decoder: DecoderOptions
  charset: ScanCharset
  /** Kantenlaenge des erwarteten Codes in mm - daraus berechnet der Scanner den Start-Zoom. */
  codeSizeMm: number
  title: string
  hint: string
  /** Zielrahmen im WebView-Overlay: quadratisch (2D-Codes) oder breit (Strichcode auf Packungen). */
  frame: 'square' | 'wide'
  /** Optionale zweite Zeile unter dem Hinweis (WebView-Overlay), z. B. Datensparsamkeit. */
  note?: string
}

/** Bundeseinheitlicher Medikationsplan: dichter Data-Matrix-Code (96x96 Module), dunkel auf hell. */
export const BMP_PROFILE: ScanProfile = {
  formats: ['DataMatrix'],
  decoder: { tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, tryDenoise: false },
  charset: 'iso-8859-1',
  codeSizeMm: 40,
  title: 'Medikationsplan scannen',
  hint: 'BMP-Code in den Rahmen halten · Reflexionen vermeiden',
  frame: 'square',
}

/**
 * Medikamentenpackung: securPharm-Data-Matrix (klein, 10-16 mm) oder klassischer PZN-Strichcode
 * (Code 39 mit fuehrendem '-'). 'PZN' ist ein eigenes zxing-cpp-Format mit Pruefziffer (Android);
 * der iOS-Wrapper kennt es nicht und liest ihn als Code 39 - der Aufrufer extrahiert die PZN ohnehin
 * selbst (packageScan.ts). GS1-Inhalt ist ASCII, deshalb ISO-8859-1 (Bytes 1:1, nichts geraten).
 */
export const PACKAGE_PROFILE: ScanProfile = {
  formats: ['DataMatrix', 'Code39', 'PZN'],
  decoder: { tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, tryDenoise: false },
  charset: 'iso-8859-1',
  codeSizeMm: 20,
  title: 'Packung scannen',
  hint: 'Barcode der Packung in den Rahmen halten',
  frame: 'wide',
  note: 'Es wird nur die PZN übernommen — Seriennummer, Charge und Verfalldatum nicht.',
}

/** Transfer-Link als QR-Code (meist vom Bildschirm eines anderen Geraets; im Dunkelmodus invertiert). */
export const QR_PROFILE: ScanProfile = {
  formats: ['QRCode'],
  decoder: { tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, tryDenoise: false },
  charset: 'utf-8',
  codeSizeMm: 40,
  title: 'QR-Code scannen',
  hint: 'QR-Code des Transfer-Links in den Rahmen halten',
  frame: 'square',
}

/** Base64-Rohbytes eines Scans in Text wandeln, mit dem Zeichensatz des Profils. */
export function decodeScanBytes(bytesBase64: string, charset: ScanCharset): string {
  const binary = atob(bytesBase64)
  if (charset === 'iso-8859-1') {
    // ISO-8859-1 bildet jedes Byte 1:1 auf U+0000..U+00FF ab. Bewusst NICHT TextDecoder('iso-8859-1'):
    // der WHATWG-Standard behandelt diesen Namen als windows-1252.
    return binary
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Formatname eines Decoders (zxing-cpp: DATA_MATRIX, QR_CODE, CODE_39, PZN; zxing-js: DATA_MATRIX, QR_CODE, CODE_39) -> neutral. */
export function normalizeScanFormat(name: string): ScanResultFormat {
  switch (name) {
    case 'DATA_MATRIX': return 'datamatrix'
    case 'QR_CODE': return 'qrcode'
    case 'CODE_39':
    case 'PZN': return 'code39'
    default: return 'unknown'
  }
}
