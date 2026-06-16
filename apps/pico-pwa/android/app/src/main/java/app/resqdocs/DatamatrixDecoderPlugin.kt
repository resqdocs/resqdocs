package app.resqdocs

import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import zxingcpp.BarcodeReader

/**
 * Nativer Data-Matrix-Decoder (#170) — ZXing-C++ (io.github.zxing-cpp:android, Apache-2.0, GMS-frei).
 *
 * decode({ data: base64 }) -> { found, text, format }. Dekodiert NUR Data Matrix, rein lokal/offline.
 * Wird vom Web-Code NUR auf Android und nur bei scannerMode 'native_zxingcpp' aufgerufen; das Still
 * kommt nativ von @capacitor/camera (kein getUserMedia/WebView-<video> -> umgeht den WebView-GPU-Crash).
 *
 * Datenschutz: KEIN Logging des Bildinhalts/Roh-Payloads, keine Persistenz, kein Netz.
 *
 * HINWEIS (Build): Options-Feldnamen und der read(Bitmap)-Overload von zxing-cpp android 3.0.2 beim
 * ersten Mac-Build verifizieren — die Wrapper-API kann je Version leicht abweichen.
 */
@CapacitorPlugin(name = "DatamatrixDecoder")
class DatamatrixDecoderPlugin : Plugin() {

    private val reader = BarcodeReader().apply {
        // Data Matrix only + volle Robustheit fuer dichte/schlechte BMP-Codes:
        // Rotation/Invertierung/Downscale/Denoise + LocalAverage-Binarizer (ungleiches Licht).
        options.formats = setOf(BarcodeReader.Format.DATA_MATRIX)
        options.tryHarder = true
        options.tryRotate = true
        options.tryInvert = true
        options.tryDownscale = true
        options.tryDenoise = true
        options.binarizer = BarcodeReader.Binarizer.LOCAL_AVERAGE
    }

    @PluginMethod
    fun decode(call: PluginCall) {
        val data = call.getString("data")
        if (data.isNullOrEmpty()) {
            call.reject("data fehlt")
            return
        }
        try {
            val bytes = Base64.decode(data, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (bitmap == null) {
                call.reject("Bild nicht lesbar")
                return
            }
            val results = reader.read(bitmap) // read(Bitmap)-Overload des Wrappers
            val first = results.firstOrNull()
            val ret = JSObject()
            ret.put("found", first != null)
            ret.put("text", first?.text ?: "")
            ret.put("format", first?.format?.toString() ?: "")
            // bitmap faellt aus dem Scope -> GC; kein Halten/Persistieren des Bildes.
            call.resolve(ret)
        } catch (e: Throwable) {
            // Bewusst OHNE Roh-Inhalt in der Meldung (Datenschutz).
            call.reject("decode fehlgeschlagen")
        }
    }
}
