import Capacitor
import Foundation
import NetworkExtension

/**
 * Verbindet das Handy direkt mit dem WLAN der Bridge („ResQDocs-<ID>"), ohne Umweg über die
 * WLAN-Einstellungen.
 *
 * Weg: NEHotspotConfiguration mit SSID-Präfix und Passwort. iOS fragt einmal nach, ob die App dem
 * Netz beitreten darf, und verbindet dann selbst. Dafür braucht die App die Fähigkeit
 * „Hotspot Configuration" (com.apple.developer.networking.HotspotConfiguration in App.entitlements).
 * Keine Standortberechtigung: Der Name des aktuellen WLANs wird nicht abgefragt; ob die Bridge
 * erreichbar ist, prüft die App danach über die Bridge selbst.
 *
 * joinOnce bleibt aus: Mit joinOnce trennt iOS das Netz, sobald die App in den Hintergrund geht.
 * Die Bridge tippt aber weiter, während das Handy weggelegt oder gesperrt ist, und die App soll den
 * Fortschritt danach wieder zeigen können. So merkt sich iOS das Netz wie ein von Hand gewähltes und
 * tritt ihm beim nächsten Mal von selbst bei. leave() nimmt es wieder aus den bekannten Netzen.
 *
 * join({ ssidPrefix, passphrase }) -> { status: "applied" | "cancelled" | "unsupported" | "failed", detail? }
 * leave()                          -> {}
 * status()                         -> { supported: Bool, held: Bool }
 *
 * "applied" heißt nur: iOS hat die Konfiguration angenommen. Am Gerät beobachtet (ohne Bridge): Findet iOS
 * kein Netz mit dem Namensanfang, fragt es gar nicht erst nach und ruft nach etwa zwei Sekunden mit dem
 * Fehler "unknown" zurück; die App macht daraus „Kein Bridge-WLAN gefunden".
 *
 * Registrierung wie ICloudBackupPlugin: CAPBridgedPlugin in Swift + registerPluginInstance in
 * MainViewController.capacitorDidLoad().
 */
@objc(BridgeWifiPlugin)
public class BridgeWifiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BridgeWifiPlugin"
    public let jsName = "ResQBridgeWifi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "join", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    /// Präfix der zuletzt angefragten Konfiguration; leave() und status() suchen damit.
    private var lastPrefix = "ResQDocs-"

    @objc func join(_ call: CAPPluginCall) {
        guard let ssidPrefix = call.getString("ssidPrefix"), ssidPrefix.count >= 3,
              let passphrase = call.getString("passphrase"), passphrase.count >= 8 else {
            call.reject("ssidPrefix und passphrase fehlen")
            return
        }
        lastPrefix = ssidPrefix
        #if targetEnvironment(simulator)
        // Der Simulator hat kein WLAN-Modul; die Anfrage endet dort immer mit einem internen Fehler.
        call.resolve(["status": "unsupported"])
        #else
        let configuration = NEHotspotConfiguration(ssidPrefix: ssidPrefix, passphrase: passphrase, isWEP: false)
        configuration.joinOnce = false
        NEHotspotConfigurationManager.shared.apply(configuration) { applyError in
            guard let error = applyError as NSError? else {
                call.resolve(["status": "applied"])
                return
            }
            guard error.domain == NEHotspotConfigurationErrorDomain,
                  let code = NEHotspotConfigurationError(rawValue: error.code) else {
                call.resolve(["status": "failed", "detail": "\(error.domain) \(error.code)"])
                return
            }
            switch code {
            case .userDenied:
                call.resolve(["status": "cancelled"])
            case .alreadyAssociated:
                call.resolve(["status": "applied"])
            default:
                call.resolve(["status": "failed", "detail": BridgeWifiPlugin.name(of: code)])
            }
        }
        #endif
    }

    @objc func leave(_ call: CAPPluginCall) {
        let wanted = lastPrefix
        NEHotspotConfigurationManager.shared.getConfiguredSSIDs { ssids in
            for ssid in ssids where ssid.hasPrefix(wanted) {
                NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
            }
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        call.resolve(["supported": false, "held": false])
        #else
        let wanted = lastPrefix
        NEHotspotConfigurationManager.shared.getConfiguredSSIDs { ssids in
            let held = ssids.contains { $0.hasPrefix(wanted) }
            call.resolve(["supported": true, "held": held])
        }
        #endif
    }

    /// Kurzer Name des Fehlers für die Anzeige in Klammern (hilft bei der Fehlersuche am Gerät).
    private static func name(of code: NEHotspotConfigurationError) -> String {
        switch code {
        case .invalid: return "invalid"
        case .invalidSSID: return "invalidSSID"
        case .invalidWPAPassphrase: return "invalidWPAPassphrase"
        case .invalidSSIDPrefix: return "invalidSSIDPrefix"
        case .applicationIsNotInForeground: return "notInForeground"
        case .internal: return "internal"
        case .pending: return "pending"
        case .systemConfiguration: return "systemConfiguration"
        case .unknown: return "unknown"
        default: return "code \(code.rawValue)"
        }
    }
}
