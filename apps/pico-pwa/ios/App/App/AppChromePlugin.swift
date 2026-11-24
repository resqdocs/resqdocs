import Capacitor
import UIKit

/**
 * Erscheinung der App (Hell, Dunkel, System) für alles, was iOS selbst zeichnet.
 *
 * Die Seite in der WebView setzt ihr Thema selbst. Die Fläche hinter der WebView, die Statusleiste, die
 * Tastatur und die Antwort der WebView auf `prefers-color-scheme` folgen aber dem Fenster. Stand dort das
 * Systemthema, während in der App das andere gewählt war, sprang die App beim Start von dunkel auf hell
 * (oder umgekehrt), und Uhr, Symbole und Tastatur passten nicht zur App.
 *
 * Deshalb bekommt das Fenster die gewählte Erscheinung als `overrideUserInterfaceStyle`:
 *   Hell -> .light, Dunkel -> .dark, System (und alles Unbekannte) -> .unspecified, also dem System folgen.
 *
 * Zwei Zeitpunkte:
 *   - beim Start, bevor die Seite zeichnet: SceneDelegate liest die gespeicherte Einstellung (storedStyle),
 *   - beim Umschalten in den Einstellungen: die App ruft das Plugin ResQChrome (setAppearance).
 *
 * Das Startbild selbst wählt iOS nach dem Systemthema; darauf hat die App keinen Einfluss.
 */
enum AppAppearance {
    /// Wo die Einstellungen der App liegen: @capacitor/preferences schreibt nach UserDefaults.standard unter
    /// "CapacitorStorage.<Schlüssel>". Der Schlüssel der App-Einstellungen ist "app.settings"
    /// (src/storage/settingsRepository.ts), der Wert ein JSON-Text mit dem Feld "theme".
    static let settingsDefaultsKey = "CapacitorStorage.app.settings"

    /// "light" -> hell, "dark" -> dunkel, alles andere (auch "system", fehlend, unbekannt) -> dem System folgen.
    static func style(forTheme theme: String?) -> UIUserInterfaceStyle {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    /// Feld "theme" aus dem gespeicherten JSON-Text; nil, wenn es fehlt oder der Text nicht lesbar ist.
    static func theme(fromSettingsJSON json: String?) -> String? {
        guard let data = json?.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        return object["theme"] as? String
    }

    /// Erscheinung aus den gespeicherten Einstellungen. Fehlt der Eintrag oder ist er unlesbar: dem System folgen.
    static func storedStyle(defaults: UserDefaults = .standard) -> UIUserInterfaceStyle {
        return style(forTheme: theme(fromSettingsJSON: defaults.string(forKey: settingsDefaultsKey)))
    }
}

/**
 * Plugin ResQChrome auf iOS: stellt das Fenster live auf die in der App gewählte Erscheinung.
 * (Auf Android heißt das Plugin genauso und führt dort die Farbe hinter den Systemleisten nach; die App hat
 * damit eine Schicht, src/shell/systemBars.ts, und jede Plattform ihre eigene Methode.)
 *
 * setAppearance({ theme: "light" | "dark" | "system" })
 *
 * Registrierung wie ICloudBackupPlugin: CAPBridgedPlugin in Swift + registerPluginInstance in
 * MainViewController.capacitorDidLoad().
 */
@objc(AppChromePlugin)
public class AppChromePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppChromePlugin"
    public let jsName = "ResQChrome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise)
    ]

    @objc func setAppearance(_ call: CAPPluginCall) {
        let style = AppAppearance.style(forTheme: call.getString("theme"))
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }
}
