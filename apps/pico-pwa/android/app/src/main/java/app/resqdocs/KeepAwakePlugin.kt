package app.resqdocs

import android.view.WindowManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Haelt den Bildschirm an, solange die App es verlangt (Fortschrittsanzeige beim Tippen der Bridge).
 * Setzt nur FLAG_KEEP_SCREEN_ON am eigenen Fenster: keine Berechtigung noetig, gilt nur solange die App
 * im Vordergrund ist, und Android nimmt es von selbst zurueck, wenn das Fenster verschwindet.
 *
 * set({ on: boolean })
 */
@CapacitorPlugin(name = "ResQKeepAwake")
class KeepAwakePlugin : Plugin() {
    @PluginMethod
    fun set(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        activity.runOnUiThread {
            if (on) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            call.resolve()
        }
    }
}
