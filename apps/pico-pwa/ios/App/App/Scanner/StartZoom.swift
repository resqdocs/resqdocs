import Foundation

/**
 * Start-Zoom aus den Kamera-Fähigkeiten (Apple, WWDC21 „What's new in camera capture", Session 10047):
 * Hält man einen kleinen Code so nah, dass er den Zielrahmen füllt, liegt man oft UNTER dem
 * Mindest-Fokusabstand – das Bild bleibt unscharf. Deshalb so weit zoomen, dass der Code den Rahmen
 * erst ab dem Mindestabstand füllt; der Nutzer hält dann automatisch weiter weg.
 *
 * Rechnung identisch zum Android-Gegenstück (StartZoom.kt), nur die Eingaben stammen von AVFoundation:
 * minimumFocusDistance (mm, -1 = unbekannt) und das horizontale Sichtfeld des aktiven Formats.
 * Rein fähigkeitsbasiert, keine Geräteliste. Bei unbekannten Werten: Zoom 1.
 */
enum StartZoom {
    /// Obergrenze: höherer Zoom würde die virtuelle Kamera auf das Tele mit größerer Nahgrenze schicken.
    static let maxStartZoom: Double = 2.0

    /// - Parameters:
    ///   - minFocusMm: AVCaptureDevice.minimumFocusDistance (mm), <= 0 = unbekannt
    ///   - fovDegrees: horizontales Sichtfeld des aktiven Formats bei Zoom 1 (AVCaptureDevice.Format.videoFieldOfView)
    ///   - codeSizeMm: Kantenlänge des Codes
    ///   - frameFill: Anteil der Bildbreite, den der Zielrahmen einnimmt
    ///   - maxZoom: höchster erlaubter Zoom des Formats
    static func compute(minFocusMm: Double, fovDegrees: Double, codeSizeMm: Double, frameFill: Double, maxZoom: Double) -> Double {
        guard minFocusMm > 0, fovDegrees > 0, fovDegrees < 180, codeSizeMm > 0, frameFill > 0 else { return 1 }
        let halfFov = fovDegrees / 2 * .pi / 180
        // Abstand, in dem der Code den Rahmen gerade füllt: codeSize = fill * 2 * d * tan(fov/2)
        let fillDistanceMm = codeSizeMm / (frameFill * 2 * tan(halfFov))
        guard fillDistanceMm > 0, fillDistanceMm < minFocusMm else { return 1 }
        let zoom = minFocusMm / fillDistanceMm
        // Nie unter 1 (ein Wert < 1 ist für videoZoomFactor eine Exception), nie über die Obergrenze.
        return max(1, min(zoom, min(maxStartZoom, max(1, maxZoom))))
    }
}
