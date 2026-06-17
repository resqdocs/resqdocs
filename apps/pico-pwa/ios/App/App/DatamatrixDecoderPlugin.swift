import Foundation
import Capacitor
import Vision
import UIKit

/**
 * Nativer Data-Matrix-Decoder fuer iOS (#170) — Apple Vision (VNDetectBarcodesRequest, .dataMatrix).
 *
 * decode({ data: base64 }) -> { found, text, format }. Dekodiert NUR Data Matrix, lokal/offline,
 * Apple-eingebaut (kein Pod/SPM, keine GMS). Gleicher Capacitor-Plugin-Name wie das Android-Plugin
 * ("DatamatrixDecoder"), daher nutzt der Web-Code dieselbe TS-Bridge. Aufruf nur im nativen Modus;
 * das Still kommt nativ von @capacitor/camera (kein getUserMedia/WebView-<video>).
 *
 * Datenschutz: KEIN Logging des Bildinhalts/Roh-Payloads, keine Persistenz, kein Netz.
 */
@objc(DatamatrixDecoderPlugin)
public class DatamatrixDecoderPlugin: CAPPlugin {

    @objc func decode(_ call: CAPPluginCall) {
        guard let data = call.getString("data"),
              let imageData = Data(base64Encoded: data),
              let uiImage = UIImage(data: imageData),
              let cgImage = uiImage.cgImage else {
            call.reject("Bild nicht lesbar")
            return
        }

        let request = VNDetectBarcodesRequest()
        request.symbologies = [.dataMatrix]

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            // Robust ueber SDK-Versionen: nur Barcode-Observations + nicht-leerer Payload.
            let payloads = (request.results ?? []).compactMap { ($0 as? VNBarcodeObservation)?.payloadStringValue }
            let first = payloads.first
            call.resolve([
                "found": first != nil,
                "text": first ?? "",
                "format": "DataMatrix"
            ])
        } catch {
            // Bewusst OHNE Roh-Inhalt in der Meldung (Datenschutz).
            call.reject("decode fehlgeschlagen")
        }
    }
}
