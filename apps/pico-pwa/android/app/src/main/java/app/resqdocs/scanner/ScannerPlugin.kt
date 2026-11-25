package app.resqdocs.scanner

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Nativer Code-Scanner: eigene Vollbild-Activity mit CameraX + ZXing-C++.
 *
 * scan(options) -> { status: 'found', format, bytesBase64, text, diag }
 *                | { status: 'cancelled', diag } | { status: 'denied' } | { status: 'error', code }
 *
 * Mehrfach-Modus (Optionen multi, multiToggleLabel, doneLabel, countOne, countMany, duplicateLabel, known):
 * 'found' traegt zusaetzlich items: [{ format, bytesBase64, text }] mit allen Codes in Scan-Reihenfolge;
 * format/bytesBase64/text auf oberster Ebene sind die des ersten Codes. Mit multiToggleLabel (Schalter im
 * Kamerabild) tragen 'found' und 'cancelled' ausserdem multiOn = letzte Schalterstellung. Ohne diese
 * Optionen bleibt die Rueckgabe wie oben.
 *
 * Datenschutz (harte Grenze): Kamerabilder bleiben im Arbeitsspeicher der ScanActivity und werden nie
 * gespeichert, geloggt oder uebertragen. An die WebView geht nur der gelesene Inhalt. Weder dieses Plugin
 * noch die Activity enthalten Netzwerkcode; CameraX und ZXing-C++ ebenso nicht (geprueft).
 */
@CapacitorPlugin(
    name = "ResQScanner",
    permissions = [Permission(alias = "camera", strings = [Manifest.permission.CAMERA])],
)
class ScannerPlugin : Plugin() {

    @PluginMethod
    fun scan(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
            return
        }
        startScan(call)
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            startScan(call)
        } else {
            call.resolve(JSObject().put("status", "denied"))
        }
    }

    private fun startScan(call: PluginCall) {
        val intent = Intent(context, ScanActivity::class.java)
        ScanOptions.fromCall(call).writeTo(intent)
        startActivityForResult(call, intent, "scanResult")
    }

    @ActivityCallback
    private fun scanResult(call: PluginCall, result: ActivityResult) {
        val data = result.data
        val diag = data?.getStringExtra(ScanActivity.EXTRA_DIAG) ?: ""
        when (result.resultCode) {
            Activity.RESULT_OK -> {
                val bytes = data?.getByteArrayExtra(ScanActivity.EXTRA_BYTES)
                if (bytes == null) {
                    call.resolve(JSObject().put("status", "error").put("code", "no_result"))
                    return
                }
                val out = JSObject()
                    .put("status", "found")
                    .put("format", data.getStringExtra(ScanActivity.EXTRA_FORMAT) ?: "")
                    .put("bytesBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    .put("text", data.getStringExtra(ScanActivity.EXTRA_TEXT) ?: "")
                    .put("diag", diag)
                // Nur mit Schalter bzw. im Mehrfach-Modus legt die ScanActivity die Liste und die Schalterstellung bei.
                val itemBytes = data.getStringArrayListExtra(ScanActivity.EXTRA_ITEM_BYTES)
                if (itemBytes != null) {
                    val itemTexts = data.getStringArrayListExtra(ScanActivity.EXTRA_ITEM_TEXTS)
                    val itemFormats = data.getStringArrayListExtra(ScanActivity.EXTRA_ITEM_FORMATS)
                    val items = JSArray()
                    for (i in itemBytes.indices) {
                        items.put(
                            JSObject()
                                .put("format", itemFormats?.getOrNull(i) ?: "")
                                .put("bytesBase64", itemBytes[i])
                                .put("text", itemTexts?.getOrNull(i) ?: ""),
                        )
                    }
                    out.put("items", items)
                }
                if (data.hasExtra(ScanActivity.EXTRA_MULTI_ON)) {
                    out.put("multiOn", data.getBooleanExtra(ScanActivity.EXTRA_MULTI_ON, false))
                }
                call.resolve(out)
            }
            ScanActivity.RESULT_CAMERA_ERROR ->
                call.resolve(JSObject().put("status", "error").put("code", "camera").put("diag", diag))
            else -> {
                val out = JSObject().put("status", "cancelled").put("diag", diag)
                if (data != null && data.hasExtra(ScanActivity.EXTRA_MULTI_ON)) {
                    out.put("multiOn", data.getBooleanExtra(ScanActivity.EXTRA_MULTI_ON, false))
                }
                call.resolve(out)
            }
        }
    }
}
