// nativeDatamatrixScan.ts (#170) — nativer BMP-Data-Matrix-Scan (Android-only).
//
// Architektur (belegt durch Crash-Research, siehe datamatrixDecoder.ts):
//   native Einzel-Foto-Aufnahme (@capacitor/camera, System-/Geraete-Kamera) ->
//   ZXing-C++-Decode (DatamatrixDecoder, Data Matrix, tryHarder) -> Roh-UKF-String.
// KEIN getUserMedia, KEIN WebView-<video>/Canvas-GPU-Pfad -> umgeht den WebView-GPU-Crash.
//
// Datenschutz (Patientenplaene): saveToGallery:false (kein Galerie-Eintrag), das aufgenommene
// Still wird nur im Speicher dekodiert und danach fallen gelassen (kein Halten/Persistieren),
// der dekodierte Inhalt wird NIE geloggt. Netzfrei.
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { DatamatrixDecoder } from './datamatrixDecoder'

/** Nativer Pfad nur auf Android (Plugin ist Android-only; iOS/Web nutzen den WebView-Scanner). */
export function nativeDatamatrixScanAvailable(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export type NativeScanResult =
  | { status: 'found'; raw: string }
  | { status: 'notFound' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

/**
 * Nimmt EIN Foto nativ auf und dekodiert es lokal mit ZXing-C++.
 * Wirft nicht; Fehler/Abbruch werden als Status zurueckgegeben.
 */
export async function scanDatamatrixNative(): Promise<NativeScanResult> {
  let base64: string | undefined
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false, // KEINE Speicherung (Patientendaten)
      allowEditing: false,
    })
    base64 = photo.base64String
  } catch (e) {
    const msg = (e as Error)?.message ?? ''
    // @capacitor/camera meldet Nutzer-Abbruch ueber die Fehlermeldung.
    if (/cancel/i.test(msg)) return { status: 'cancelled' }
    return { status: 'error', message: 'Kamera nicht verfügbar oder Zugriff verweigert.' }
  }
  if (!base64) return { status: 'cancelled' }
  try {
    const res = await DatamatrixDecoder.decode({ data: base64 })
    base64 = undefined // Bilddaten sofort fallen lassen
    return res.found ? { status: 'found', raw: res.text } : { status: 'notFound' }
  } catch {
    base64 = undefined
    return { status: 'error', message: 'Der Code konnte nicht gelesen werden.' }
  }
}
