package app.resqdocs

import android.content.res.Configuration
import android.graphics.Color
import androidx.core.view.WindowCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Farbe hinter den Systemleisten (Statusleiste oben, Gestenleiste unten) passend zum Thema der App.
 *
 * Android zeichnet die App randlos. Kann die System-WebView die Ränder noch nicht selbst an die Seite
 * weitergeben (ältere Fassungen), legt Capacitor einen Rand um die WebView; darin sieht man den Hintergrund
 * des Fensters. Der Standard dafür steht in res/values(-night)/colors.xml (appChrome) und folgt dem
 * Systemthema. Wählt jemand in der App ein anderes Thema als das System, setzt die App die Farbe hier nach.
 *
 * Keine veralteten Leisten-APIs (setStatusBarColor/setNavigationBarColor): nur der Fensterhintergrund und
 * die Helligkeit der Leisten-Symbole.
 *
 * setColor({ color: "#rrggbb", dark: boolean })
 */
@CapacitorPlugin(name = "ResQChrome")
class AppChromePlugin : Plugin() {
    private var color: Int? = null
    private var dark = false

    @PluginMethod
    fun setColor(call: PluginCall) {
        val hex = call.getString("color")
        val parsed = try {
            if (hex == null) null else Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            null
        }
        if (parsed == null) {
            call.reject("color fehlt oder ist keine Farbe")
            return
        }
        color = parsed
        dark = call.getBoolean("dark", false) ?: false
        activity.runOnUiThread {
            apply()
            call.resolve()
        }
    }

    // Capacitor setzt bei jeder Konfigurationsänderung (Drehen, Systemthema) wieder die Farbe aus dem
    // Android-Thema. Danach die Farbe der App erneut setzen.
    override fun handleOnConfigurationChanged(newConfig: Configuration?) {
        super.handleOnConfigurationChanged(newConfig)
        activity.window.decorView.post { apply() }
    }

    private fun apply() {
        val c = color ?: return
        val window = activity.window
        window.decorView.setBackgroundColor(c)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
    }
}
