package app.resqdocs

import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import androidx.core.view.WindowCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Farbe hinter den Systemleisten (Statusleiste oben, Gestenleiste unten) passend zu dem, was die App zeigt.
 *
 * Android zeichnet die App randlos. Kann die System-WebView die Ränder noch nicht selbst an die Seite
 * weitergeben (ältere Fassungen), legt Capacitor einen Rand um die WebView; darin sieht man den Hintergrund
 * des Fensters. Der Standard dafür steht in res/values(-night)/colors.xml (appChrome) und folgt dem
 * Systemthema. Die App meldet nach, was die Seite an ihrem oberen und an ihrem unteren Rand gerade zeigt
 * (src/shell/systemBars.ts): Kopfzeile und Tab-Leiste, ein Fenster über den ganzen Bildschirm in anderer
 * Farbe oder eine abgedunkelte Seite. Oben und unten dürfen sich unterscheiden (z. B. ein Blatt von unten).
 *
 * Keine veralteten Leisten-APIs (setStatusBarColor/setNavigationBarColor): nur der Fensterhintergrund und
 * die Helligkeit der Leisten-Symbole.
 *
 * setColor({ color: "#rrggbb", dark: boolean, bottomColor?: "#rrggbb", bottomDark?: boolean })
 */
@CapacitorPlugin(name = "ResQChrome")
class AppChromePlugin : Plugin() {
    private var color: Int? = null
    private var dark = false
    private var bottomColor: Int? = null
    private var bottomDark = false

    @PluginMethod
    fun setColor(call: PluginCall) {
        val parsed = parse(call.getString("color"))
        if (parsed == null) {
            call.reject("color fehlt oder ist keine Farbe")
            return
        }
        color = parsed
        dark = call.getBoolean("dark", false) ?: false
        // Ohne eigene Angabe gilt unten dasselbe wie oben.
        val lower = parse(call.getString("bottomColor"))
        bottomColor = lower ?: parsed
        bottomDark = if (lower == null) dark else (call.getBoolean("bottomDark", dark) ?: dark)
        activity.runOnUiThread {
            apply()
            call.resolve()
        }
    }

    private fun parse(hex: String?): Int? {
        if (hex == null) return null
        return try {
            Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    // Capacitor setzt bei jeder Konfigurationsänderung (Drehen, Systemthema) wieder die Farbe aus dem
    // Android-Thema. Danach die Farbe der App erneut setzen.
    override fun handleOnConfigurationChanged(newConfig: Configuration?) {
        super.handleOnConfigurationChanged(newConfig)
        activity.window.decorView.post { apply() }
    }

    private fun apply() {
        val upper = color ?: return
        val lower = bottomColor ?: upper
        val window = activity.window
        if (upper == lower) {
            window.decorView.setBackgroundColor(upper)
        } else {
            window.decorView.background = SplitDrawable(upper, lower)
        }
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !bottomDark
    }

    /** Obere Hälfte in der einen, untere Hälfte in der anderen Farbe: hinter Statusleiste und Gestenleiste. */
    private class SplitDrawable(private val upper: Int, private val lower: Int) : Drawable() {
        private val paint = Paint()

        override fun draw(canvas: Canvas) {
            val area = bounds
            val middle = area.exactCenterY()
            paint.color = upper
            canvas.drawRect(area.left.toFloat(), area.top.toFloat(), area.right.toFloat(), middle, paint)
            paint.color = lower
            canvas.drawRect(area.left.toFloat(), middle, area.right.toFloat(), area.bottom.toFloat(), paint)
        }

        override fun setAlpha(alpha: Int) {}

        override fun setColorFilter(colorFilter: ColorFilter?) {}

        @Deprecated("Deprecated in Java")
        override fun getOpacity(): Int = PixelFormat.OPAQUE
    }
}
