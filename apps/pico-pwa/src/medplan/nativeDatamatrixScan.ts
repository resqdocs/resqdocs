// nativeDatamatrixScan.ts (#170) — nativer BMP-Data-Matrix-Scan (Android + iOS).
//
// Architektur (belegt durch Crash-Research, siehe datamatrixDecoder.ts):
//   native Einzel-Foto-Aufnahme (@capacitor/camera, System-/Geraete-Kamera) ->
//   nativer Decode (DatamatrixDecoder: Android=ZXing-C++, iOS=Apple Vision) -> Roh-UKF-String.
// KEIN getUserMedia, KEIN WebView-<video>/Canvas-GPU-Pfad -> umgeht den WebView-GPU-Crash (Android).
//
// Datenschutz (Patientenplaene): saveToGallery:false (kein Galerie-Eintrag), das aufgenommene
// Still wird nur im Speicher dekodiert und danach fallen gelassen (kein Halten/Persistieren),
// der dekodierte Inhalt wird NIE geloggt. Netzfrei.
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { DatamatrixDecoder } from './datamatrixDecoder'

/** Nativer Pfad auf Android (zxing-cpp) UND iOS (Apple Vision); Web nutzt den WebView-Scanner. */
export function nativeDatamatrixScanAvailable(): boolean {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios'
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
    const msg = (e as Error)?.message ?? String(e)
    // @capacitor/camera meldet Nutzer-Abbruch ueber die Fehlermeldung.
    if (/cancel/i.test(msg)) return { status: 'cancelled' }
    // Diagnose (#170): den ECHTEN Plugin-Grund zeigen (z. B. fehlende Usage-Description,
    // 'denied', 'not available') statt einer generischen Meldung.
    return { status: 'error', message: msg ? `Kamera-/Scan-Fehler: ${msg}` : 'Kamera nicht verfügbar oder Zugriff verweigert.' }
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
