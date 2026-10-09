package app.resqdocs.scanner

import kotlin.math.atan
import kotlin.math.tan

/**
 * Start-Zoom aus den Kamera-Faehigkeiten (Muster von Apple, WWDC21 "What's new in camera capture"):
 * Haelt man einen Code so nah, dass er den Zielrahmen fuellt, liegt man oft UNTER dem Mindest-
 * Fokusabstand der Hauptkamera - das Bild bleibt unscharf. Deshalb so weit zoomen, dass der Code den
 * Rahmen erst ab dem Mindestabstand fuellt; der Nutzer haelt dann automatisch weiter weg.
 *
 * Rein faehigkeitsbasiert (keine Geraeteliste). Bei unbekannten/unkalibrierten Werten: Zoom 1.
 */
object StartZoom {
    /** Obergrenze: hoeherer Zoom kann auf eine Tele-Linse mit groesserem Mindestabstand wechseln. */
    const val MAX_START_ZOOM = 2.0f

    /**
     * @param minFocusDiopters LENS_INFO_MINIMUM_FOCUS_DISTANCE (Dioptrien, 0 = Fixfokus)
     * @param calibrated       Fokusdistanz-Kalibrierung APPROXIMATE oder CALIBRATED
     * @param focalLengthMm    Brennweite der Linse
     * @param sensorShortMm    kurze Seite des Sensors (entspricht im Hochformat der Bildbreite)
     * @param codeSizeMm       Kantenlaenge des Codes
     * @param frameFill        Anteil der Bildbreite, den der Zielrahmen einnimmt
     * @param maxZoomRatio     hoechster Zoom der Kamera
     */
    fun compute(
        minFocusDiopters: Float,
        calibrated: Boolean,
        focalLengthMm: Float,
        sensorShortMm: Float,
        codeSizeMm: Float,
        frameFill: Float,
        maxZoomRatio: Float,
    ): Float {
        if (!calibrated || minFocusDiopters <= 0f || focalLengthMm <= 0f || sensorShortMm <= 0f) return 1f
        val minFocusMm = 1000f / minFocusDiopters
        val fov = 2.0 * atan(sensorShortMm / (2.0 * focalLengthMm))
        // Abstand, in dem der Code den Rahmen gerade fuellt: codeSize = fill * 2 * d * tan(fov/2)
        val fillDistanceMm = codeSizeMm / (frameFill * 2.0 * tan(fov / 2.0))
        if (fillDistanceMm >= minFocusMm) return 1f
        val zoom = (minFocusMm / fillDistanceMm).toFloat()
        return zoom.coerceIn(1f, minOf(MAX_START_ZOOM, maxZoomRatio.coerceAtLeast(1f)))
    }
}
