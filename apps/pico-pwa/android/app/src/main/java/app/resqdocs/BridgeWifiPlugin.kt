package app.resqdocs

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.PatternMatcher
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Verbindet die App direkt mit dem WLAN der Bridge („ResQDocs-<ID>"), ohne Umweg ueber die
 * WLAN-Einstellungen.
 *
 * Weg: WifiNetworkSpecifier mit Praefix-Muster + ConnectivityManager.requestNetwork (ab Android 10).
 * Das System sucht selbst und zeigt die passenden Netze zur Auswahl; die App sieht keine WLAN-Liste.
 * Deshalb braucht es KEINE Standortberechtigung, nur die beiden Berechtigungen ohne Rueckfrage
 * CHANGE_NETWORK_STATE (Anfrage stellen) und ACCESS_WIFI_STATE (ist WLAN ueberhaupt an). Reines
 * Android-API, keine Google-Play-Dienste.
 *
 * Das so verbundene Netz gehoert nur dieser App und ist nie das Standardnetz des Handys. Damit die
 * Anfragen an die Bridge (CapacitorHttp) darueber laufen, wird der Prozess an das Netz gebunden
 * (bindProcessToNetwork). Folge: Solange die Bindung besteht, laeuft ALLER Netzverkehr der App ueber
 * das Bridge-WLAN, und das hat kein Internet. Geloest wird sie durch leave(), wenn das Netz
 * verschwindet (Bridge abgezogen, ausser Reichweite), und spaetestens mit dem Ende der App; Android
 * gibt die Anfrage dann selbst frei und das Handy kehrt in sein uebliches WLAN zurueck.
 *
 * join({ ssidPrefix, passphrase }) -> { status: "connected" | "cancelled" | "wifiOff" | "unsupported" | "failed", detail? }
 * leave()                          -> {}
 * status()                         -> { supported: boolean, held: boolean }
 * Ereignis "change" { held }       -> Bindung entstanden oder weggefallen
 *
 * Vor Android 10 gibt es den Weg nicht: "unsupported", die App zeigt dann „WLAN-Einstellungen oeffnen".
 */
@CapacitorPlugin(name = "ResQBridgeWifi")
class BridgeWifiPlugin : Plugin() {
    private var callback: ConnectivityManager.NetworkCallback? = null
    private var network: Network? = null
    private var pending: PluginCall? = null

    private val connectivity: ConnectivityManager
        get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @PluginMethod
    fun join(call: PluginCall) {
        val prefix = call.getString("ssidPrefix").orEmpty()
        val passphrase = call.getString("passphrase").orEmpty()
        if (prefix.length < 3 || passphrase.length < 8) {
            call.reject("ssidPrefix und passphrase fehlen")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(reply("unsupported"))
            return
        }
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        if (!wifi.isWifiEnabled) {
            // Bei ausgeschaltetem WLAN lehnt Android die Anfrage sofort ab; das saehe aus wie „abgebrochen".
            call.resolve(reply("wifiOff"))
            return
        }
        // Eine fruehere Anfrage zuerst freigeben: es gibt immer hoechstens eine.
        release()

        val specifier = WifiNetworkSpecifier.Builder()
            .setSsidPattern(PatternMatcher(prefix, PatternMatcher.PATTERN_PREFIX))
            .setWpa2Passphrase(passphrase)
            .build()
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) // die Bridge hat kein Internet
            .setNetworkSpecifier(specifier)
            .build()

        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(available: Network) = onJoined(this, available)

            // Auswahl abgebrochen, kein passendes Netz gewaehlt oder Verbindung nicht zustande gekommen.
            // Android hat die Anfrage hier bereits selbst freigegeben.
            override fun onUnavailable() = onGone(this, "cancelled")

            override fun onLost(lost: Network) = onGone(this, "failed")
        }
        synchronized(this) {
            callback = cb
            pending = call
        }
        try {
            connectivity.requestNetwork(request, cb)
        } catch (e: RuntimeException) {
            synchronized(this) {
                callback = null
                pending = null
            }
            call.resolve(reply("failed", e.javaClass.simpleName))
        }
    }

    @PluginMethod
    fun leave(call: PluginCall) {
        release()
        call.resolve()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val result = JSObject()
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        result.put("held", synchronized(this) { network != null })
        call.resolve(result)
    }

    override fun handleOnDestroy() {
        release()
        super.handleOnDestroy()
    }

    private fun onJoined(cb: ConnectivityManager.NetworkCallback, available: Network) {
        val call: PluginCall?
        val bound: Boolean
        synchronized(this) {
            if (callback !== cb) return
            bound = connectivity.bindProcessToNetwork(available)
            network = if (bound) available else null
            call = pending
            pending = null
        }
        if (!bound) {
            release()
            call?.resolve(reply("failed", "bind"))
            return
        }
        call?.resolve(reply("connected"))
        notifyHeld(true)
    }

    /** Die Anfrage erledigt sich von Android aus: abgelehnt bzw. abgebrochen, oder das Netz ist weg. */
    private fun onGone(cb: ConnectivityManager.NetworkCallback, status: String) {
        val call: PluginCall?
        synchronized(this) {
            if (callback !== cb) return
            call = pending
            pending = null
        }
        release() // loest eine bestehende Bindung und meldet das als "change"
        call?.resolve(reply(status))
    }

    /** Bindung loesen und die Anfrage zurueckgeben. Mehrfach aufrufbar. */
    private fun release() {
        val cb: ConnectivityManager.NetworkCallback?
        val call: PluginCall?
        val wasHeld: Boolean
        synchronized(this) {
            cb = callback
            call = pending
            wasHeld = network != null
            callback = null
            pending = null
            network = null
        }
        if (wasHeld) connectivity.bindProcessToNetwork(null)
        if (cb != null) {
            try {
                connectivity.unregisterNetworkCallback(cb)
            } catch (_: IllegalArgumentException) {
                // schon von Android freigegeben (onUnavailable)
            }
        }
        call?.resolve(reply("cancelled"))
        if (wasHeld) notifyHeld(false)
    }

    private fun notifyHeld(held: Boolean) {
        val data = JSObject()
        data.put("held", held)
        notifyListeners("change", data)
    }

    private fun reply(status: String, detail: String? = null): JSObject {
        val result = JSObject()
        result.put("status", status)
        if (detail != null) result.put("detail", detail)
        return result
    }
}
