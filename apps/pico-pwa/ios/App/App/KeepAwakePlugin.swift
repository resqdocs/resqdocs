import Capacitor
import UIKit

/**
 * Hält den Bildschirm an, solange die App es verlangt (Fortschrittsanzeige beim Tippen der Bridge).
 * Setzt nur isIdleTimerDisabled: keine Berechtigung nötig, wirkt nur im Vordergrund, und iOS nimmt es
 * von selbst zurück, wenn die App beendet wird.
 *
 * set({ on: Bool })
 *
 * Registrierung wie ICloudBackupPlugin: CAPBridgedPlugin in Swift + registerPluginInstance in
 * MainViewController.capacitorDidLoad().
 */
@objc(KeepAwakePlugin)
public class KeepAwakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeepAwakePlugin"
    public let jsName = "ResQKeepAwake"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func set(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }
}
