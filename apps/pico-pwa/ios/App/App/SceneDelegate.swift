import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    // Fenster und Start-View-Controller legt UIKit aus Main.storyboard an (UISceneStoryboardFile im Info.plist):
    // MainViewController, der die lokalen Plugins registriert (ICloudBackup, siehe AppDelegate.swift). Hier KEIN
    // eigenes Fenster mit CAPBridgeViewController() - das ersetzte MainViewController, und die iCloud-Sicherung
    // meldete "ICloudBackup plugin is not implemented on ios". Festgehalten in src/backup/icloudRegistration.test.ts.
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
