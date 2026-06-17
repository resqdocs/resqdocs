// datamatrixDecoder.ts (#170) — Bruecke zum nativen ZXing-C++-Decoder (Android-only).
//
// Hintergrund: Der WebView-Kamera-Pfad (getUserMedia/<video>) crasht auf Adreno-Geraeten
// im Chrome_InProcGpuThread (belegt: crbug 40133902 u. a.). Der native Pfad dekodiert ein
// nativ aufgenommenes Foto mit ZXing-C++ (io.github.zxing-cpp:android, Apache-2.0, GMS-frei)
// und beruehrt die Chromium-Media/GPU-Pipeline nie.
//
// Auf Web/iOS ist das Plugin NICHT implementiert (registerPlugin wirft dort "not implemented");
// der Aufruf ist durch die Plattform-/Modus-Weiche in nativeDatamatrixScan.ts abgeschirmt.
import { registerPlugin } from '@capacitor/core'

export interface DatamatrixDecoderResult {
  found: boolean
  /** Roher Data-Matrix-Inhalt (UKF-XML). NICHT loggen/persistieren. */
  text: string
  format: string
}

export interface DatamatrixDecoderPlugin {
  /** base64 (ohne data:-Prefix) eines Stills -> erkannter Data-Matrix-Text (Data Matrix only). */
  decode(options: { data: string }): Promise<DatamatrixDecoderResult>
}

export const DatamatrixDecoder = registerPlugin<DatamatrixDecoderPlugin>('DatamatrixDecoder')
