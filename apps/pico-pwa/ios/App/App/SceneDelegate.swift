import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    // Fenster und Start-View-Controller legt UIKit aus Main.storyboard an (UISceneStoryboardFile im Info.plist):
    // MainViewController, der die lokalen Plugins registriert (ICloudBackup, siehe AppDelegate.swift). Hier KEIN
    // eigenes Fenster mit CAPBridgeViewController() - das ersetzte MainViewController, und die iCloud-Sicherung
    // meldete "ICloudBackup plugin is not implemented on ios". Festgehalten in src/backup/icloudRegistration.test.ts.
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Erscheinung der App (Hell, Dunkel, System) aus den gespeicherten Einstellungen, BEVOR die Seite zeichnet:
        // Fläche hinter der WebView, Statusleiste, Tastatur und prefers-color-scheme folgen dem Fenster. Ohne das
        // startete die App bei abweichendem Systemthema in der falschen Farbe und sprang dann um
        // (AppChromePlugin.swift). Später führt die App das Fenster über das Plugin ResQChrome nach.
        let style = AppAppearance.storedStyle()
        window?.overrideUserInterfaceStyle = style
        (scene as? UIWindowScene)?.windows.forEach { $0.overrideUserInterfaceStyle = style }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
