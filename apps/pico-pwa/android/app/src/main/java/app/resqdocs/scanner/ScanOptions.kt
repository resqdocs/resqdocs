package app.resqdocs.scanner

import android.content.Intent
import android.graphics.Color
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import zxingcpp.BarcodeReader

/**
 * Farben des aktiven App-Themes (#rrggbb aus der WebView), damit der Scanner aussieht wie der Rest der
 * App. Fehlt etwas oder ist es unlesbar, gilt das ResQDocs-Dunkelthema.
 */
data class ScanTheme(
    val base100: Int,
    val base300: Int,
    val baseContent: Int,
    val primary: Int,
    val primaryContent: Int,
) {
    /** Heller Hintergrund -> dunkle Statusleisten-Symbole. */
    val isLight: Boolean get() = androidx.core.graphics.ColorUtils.calculateLuminance(base100) > 0.5

    fun toIntArray() = intArrayOf(base100, base300, baseContent, primary, primaryContent)

    companion object {
        val DEFAULT = ScanTheme(0xFF141B30.toInt(), 0xFF2E3F6E.toInt(), 0xFFE7EBF5.toInt(), 0xFFFF7A66.toInt(), 0xFF141B30.toInt())

        private fun parse(o: JSObject?, key: String, fallback: Int): Int {
            val v = o?.getString(key) ?: return fallback
            return try { Color.parseColor(v) } catch (_: IllegalArgumentException) { fallback }
        }

        fun fromJs(o: JSObject?): ScanTheme = ScanTheme(
            base100 = parse(o, "base100", DEFAULT.base100),
            base300 = parse(o, "base300", DEFAULT.base300),
            baseContent = parse(o, "baseContent", DEFAULT.baseContent),
            primary = parse(o, "primary", DEFAULT.primary),
            primaryContent = parse(o, "primaryContent", DEFAULT.primaryContent),
        )

        fun fromIntArray(a: IntArray?): ScanTheme =
            if (a == null || a.size < 5) DEFAULT else ScanTheme(a[0], a[1], a[2], a[3], a[4])
    }
}

/**
 * Scan-Optionen aus dem JS-Aufruf. Die Decoder-Profile (welche Formate, welche try*-Schalter) legt die
 * App zentral in TS fest (scanProfiles.ts) - iOS bekommt dieselben Werte. Hier nur Uebernahme mit
 * sicheren Voreinstellungen; der Android-Wrapper hat alle try*-Optionen sonst auf false.
 */
data class ScanOptions(
    val formats: List<String>,
    val tryHarder: Boolean,
    val tryRotate: Boolean,
    val tryInvert: Boolean,
    val tryDownscale: Boolean,
    val tryDenoise: Boolean,
    /** Kantenlaenge des erwarteten Codes in mm - steuert den Start-Zoom. */
    val codeSizeMm: Float,
    val title: String,
    val hint: String,
    val cancelLabel: String,
    val torchLabel: String,
    val showDiagnostics: Boolean,
    val theme: ScanTheme,
) {
    fun readerOptions(): BarcodeReader.Options = BarcodeReader.Options().also { o ->
        o.formats = formats.mapNotNull { FORMAT_MAP[it] }.toSet().ifEmpty { setOf(BarcodeReader.Format.DATA_MATRIX) }
        o.tryHarder = tryHarder
        o.tryRotate = tryRotate
        o.tryInvert = tryInvert
        o.tryDownscale = tryDownscale
        o.tryDenoise = tryDenoise
        o.binarizer = BarcodeReader.Binarizer.LOCAL_AVERAGE
        // PLAIN: Inhalt unveraendert (keine HRI-Umformatierung von GS1/ISO-15434); die App dekodiert
        // die Rohbytes selbst (BMP: ISO-8859-1).
        o.textMode = BarcodeReader.TextMode.PLAIN
        o.maxNumberOfSymbols = 1
    }

    fun writeTo(intent: Intent) {
        intent.putExtra(K_FORMATS, formats.toTypedArray())
        intent.putExtra(K_TRY, booleanArrayOf(tryHarder, tryRotate, tryInvert, tryDownscale, tryDenoise))
        intent.putExtra(K_CODE_SIZE, codeSizeMm)
        intent.putExtra(K_TEXTS, arrayOf(title, hint, cancelLabel, torchLabel))
        intent.putExtra(K_DIAG, showDiagnostics)
        intent.putExtra(K_THEME, theme.toIntArray())
    }

    companion object {
        private const val K_FORMATS = "scan.formats"
        private const val K_TRY = "scan.try"
        private const val K_CODE_SIZE = "scan.codeSizeMm"
        private const val K_TEXTS = "scan.texts"
        private const val K_DIAG = "scan.diag"
        private const val K_THEME = "scan.theme"

        /** Formatnamen der JS-API -> ZXing-C++. */
        val FORMAT_MAP = mapOf(
            "DataMatrix" to BarcodeReader.Format.DATA_MATRIX,
            "QRCode" to BarcodeReader.Format.QR_CODE,
            "Code39" to BarcodeReader.Format.CODE_39,
            "PZN" to BarcodeReader.Format.PZN,
        )

        fun fromCall(call: PluginCall): ScanOptions {
            val formats = call.getArray("formats")?.toList<String>() ?: listOf("DataMatrix")
            val d = call.getObject("decoder")
            return ScanOptions(
                formats = formats,
                tryHarder = d?.optBoolean("tryHarder", true) ?: true,
                tryRotate = d?.optBoolean("tryRotate", true) ?: true,
                tryInvert = d?.optBoolean("tryInvert", false) ?: false,
                tryDownscale = d?.optBoolean("tryDownscale", true) ?: true,
                tryDenoise = d?.optBoolean("tryDenoise", false) ?: false,
                codeSizeMm = (call.getFloat("codeSizeMm") ?: 40f).coerceIn(5f, 200f),
                title = call.getString("title") ?: "Code scannen",
                hint = call.getString("hint") ?: "Code in den Rahmen halten",
                cancelLabel = call.getString("cancelLabel") ?: "Abbrechen",
                torchLabel = call.getString("torchLabel") ?: "Licht",
                showDiagnostics = call.getBoolean("showDiagnostics", false) ?: false,
                theme = ScanTheme.fromJs(call.getObject("theme")),
            )
        }

        fun fromIntent(intent: Intent): ScanOptions {
            val t = intent.getBooleanArrayExtra(K_TRY) ?: booleanArrayOf(true, true, false, true, false)
            val texts = intent.getStringArrayExtra(K_TEXTS) ?: arrayOf("Code scannen", "Code in den Rahmen halten", "Abbrechen", "Licht")
            return ScanOptions(
                formats = intent.getStringArrayExtra(K_FORMATS)?.toList() ?: listOf("DataMatrix"),
                tryHarder = t[0], tryRotate = t[1], tryInvert = t[2], tryDownscale = t[3], tryDenoise = t[4],
                codeSizeMm = intent.getFloatExtra(K_CODE_SIZE, 40f),
                title = texts[0], hint = texts[1], cancelLabel = texts[2], torchLabel = texts[3],
                showDiagnostics = intent.getBooleanExtra(K_DIAG, false),
                theme = ScanTheme.fromIntArray(intent.getIntArrayExtra(K_THEME)),
            )
        }
    }
}
