import Foundation
import AVFoundation
import UIKit
import Capacitor

/**
 * Nativer Code-Scanner für iOS – Gegenstück zum Android-Plugin app.resqdocs.scanner.
 *
 * scan(options) -> { status: 'found', format, bytesBase64, text, diag }
 *                | { status: 'cancelled', diag } | { status: 'denied' } | { status: 'error', code }
 *
 * Mehrfach-Modus (Optionen multi, multiToggleLabel, doneLabel, countOne, countMany, duplicateLabel, known):
 * 'found' trägt zusätzlich items: [{ format, bytesBase64, text }] mit allen Codes in Scan-Reihenfolge;
 * format/bytesBase64/text auf oberster Ebene sind die des ersten Codes. Mit multiToggleLabel (Schalter im
 * Kamerabild) tragen 'found' und 'cancelled' außerdem multiOn = letzte Schalterstellung. Ohne diese
 * Optionen bleibt die Rückgabe wie oben.
 *
 * Datenschutz (harte Grenze): Kamerabilder bleiben im Arbeitsspeicher des ScanViewController und werden
 * nie gespeichert, geloggt oder übertragen. An die WebView geht nur der gelesene Inhalt. Weder dieses
 * Plugin noch der ViewController enthalten Netzwerkcode; ZXing-C++ ebenso nicht (geprüft).
 *
 * Registrierung wie ICloudBackupPlugin: CAPBridgedPlugin in Swift + registerPluginInstance in
 * MainViewController.capacitorDidLoad (das .m-Makro allein registriert nicht zuverlässig).
 */
@objc(ScannerPlugin)
public class ScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScannerPlugin"
    public let jsName = "ResQScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
    ]

    @objc func scan(_ call: CAPPluginCall) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            present(call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    self?.present(call)
                } else {
                    call.resolve(["status": "denied"])
                }
            }
        default:
            call.resolve(["status": "denied"])
        }
    }

    private func present(_ call: CAPPluginCall) {
        let options = ScanOptions(call: call)
        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.resolve(["status": "error", "code": "no_view"])
                return
            }
            // Zeigt die WebView gerade etwas anderes an (zweiter Aufruf, fremdes Modal), würde present still
            // verworfen und das Promise hinge für immer.
            guard host.presentedViewController == nil else {
                call.resolve(["status": "error", "code": "busy"])
                return
            }
            let vc = ScanViewController(options: options)
            vc.modalPresentationStyle = .fullScreen
            // Genau einmal antworten; [weak vc] vermeidet den Zyklus vc -> onFinish -> vc.
            var answered = false
            vc.onFinish = { [weak vc] outcome in
                guard !answered else { return }
                answered = true
                vc?.onFinish = nil
                vc?.dismiss(animated: true)
                call.resolve(outcome.asDictionary())
            }
            host.present(vc, animated: true)
        }
    }
}

/// Optionen aus dem JS-Aufruf. Die Decoder-Profile legt die App zentral in TS fest (scanProfiles.ts);
/// Android bekommt dieselben Werte. Hier nur Übernahme mit sicheren Voreinstellungen.
struct ScanOptions {
    let formats: [String]
    let tryHarder: Bool
    let tryRotate: Bool
    let tryInvert: Bool
    let tryDownscale: Bool
    /// Kantenlänge des erwarteten Codes in mm – steuert den Start-Zoom.
    let codeSizeMm: Double
    /// Verzögerter Start-Zoom in ms (0 = sofort): erst 1-fach, nach dieser Zeit ohne Treffer der Start-Zoom.
    let startZoomDelayMs: Int
    let title: String
    let hint: String
    let cancelLabel: String
    let torchLabel: String
    let showDiagnostics: Bool
    let theme: ScanTheme
    /// Mehrfach-Modus: Der Bildschirm bleibt nach einem Treffer offen und sammelt Codes bis zum Beenden.
    /// Mit multiToggleLabel ist das nur die Anfangsstellung des Schalters.
    let multi: Bool
    /// Beschriftung des Schalters für den Mehrfach-Modus im Kamerabild; leer = kein Schalter.
    let multiToggleLabel: String
    /// Beschriftung des Knopfs, der den Mehrfach-Modus beendet.
    let doneLabel: String
    /// Zähler-Text bei genau einem erfassten Code.
    let countOne: String
    /// Zähler-Text ab zwei Codes; {n} wird durch die Anzahl ersetzt.
    let countMany: String
    /// Meldung, wenn ein Code schon erfasst ist oder seine PZN in known steht.
    let duplicateLabel: String
    /// PZN (8-stellig), die der Aufrufer schon hat – sie werden im Mehrfach-Modus nicht noch einmal aufgenommen.
    let known: Set<String>

    init(call: CAPPluginCall) {
        formats = call.getArray("formats", String.self) ?? ["DataMatrix"]
        let d = call.getObject("decoder") ?? [:]
        tryHarder = (d["tryHarder"] as? Bool) ?? true
        tryRotate = (d["tryRotate"] as? Bool) ?? true
        tryInvert = (d["tryInvert"] as? Bool) ?? false
        tryDownscale = (d["tryDownscale"] as? Bool) ?? true
        codeSizeMm = min(200, max(5, call.getDouble("codeSizeMm") ?? 40))
        startZoomDelayMs = min(10_000, max(0, call.getInt("startZoomDelayMs") ?? 0))
        title = call.getString("title") ?? "Code scannen"
        hint = call.getString("hint") ?? "Code in den Rahmen halten"
        cancelLabel = call.getString("cancelLabel") ?? "Abbrechen"
        torchLabel = call.getString("torchLabel") ?? "Licht"
        showDiagnostics = call.getBool("showDiagnostics") ?? false
        theme = ScanTheme(call.getObject("theme"))
        multi = call.getBool("multi") ?? false
        multiToggleLabel = call.getString("multiToggleLabel") ?? ""
        doneLabel = call.getString("doneLabel") ?? "Fertig"
        countOne = call.getString("countOne") ?? "1 Code erfasst"
        countMany = call.getString("countMany") ?? "{n} Codes erfasst"
        duplicateLabel = call.getString("duplicateLabel") ?? "Schon in der Liste"
        known = Set(call.getArray("known", String.self) ?? [])
    }
}

/// Farben des aktiven App-Themes (#rrggbb aus der WebView), damit der Scanner aussieht wie der Rest der
/// App (hell/dunkel/ResQDocs). Fehlt etwas oder ist es unlesbar, gilt das ResQDocs-Dunkelthema.
struct ScanTheme {
    let base100: UIColor
    let base300: UIColor
    let baseContent: UIColor
    let primary: UIColor
    let primaryContent: UIColor

    /// Heller Hintergrund -> dunkle Statusleisten-Symbole.
    var isLight: Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        base100.getRed(&r, green: &g, blue: &b, alpha: &a)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
    }

    init(_ o: JSObject?) {
        base100 = ScanTheme.color(o?["base100"], fallback: UIColor(red: 0x14 / 255, green: 0x1B / 255, blue: 0x30 / 255, alpha: 1))
        base300 = ScanTheme.color(o?["base300"], fallback: UIColor(red: 0x2E / 255, green: 0x3F / 255, blue: 0x6E / 255, alpha: 1))
        baseContent = ScanTheme.color(o?["baseContent"], fallback: UIColor(red: 0xE7 / 255, green: 0xEB / 255, blue: 0xF5 / 255, alpha: 1))
        primary = ScanTheme.color(o?["primary"], fallback: UIColor(red: 0xFF / 255, green: 0x7A / 255, blue: 0x66 / 255, alpha: 1))
        primaryContent = ScanTheme.color(o?["primaryContent"], fallback: UIColor(red: 0x14 / 255, green: 0x1B / 255, blue: 0x30 / 255, alpha: 1))
    }

    /// "#rrggbb" -> UIColor; alles andere -> fallback.
    private static func color(_ value: Any?, fallback: UIColor) -> UIColor {
        guard let s = value as? String, s.hasPrefix("#"), s.count == 7, let v = UInt32(s.dropFirst(), radix: 16) else { return fallback }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

/// Ein erfasster Code im Mehrfach-Modus.
struct ScanItem {
    let format: String
    let bytes: Data
    let text: String
}

/// Ergebnis des Scanners, wie es an JS geht. Formatnamen wie in der Android-Brücke (zxing-cpp-Namen).
enum ScanOutcome {
    case found(format: String, bytes: Data, text: String, diag: String)
    /// Mit Schalter bzw. im Mehrfach-Modus: alle Codes in Scan-Reihenfolge; multiOn nur mit Schalter.
    case foundMany(items: [ScanItem], diag: String, multiOn: Bool?)
    case cancelled(diag: String)
    /// Abbruch mit Schalter im Kamerabild: dessen letzte Stellung geht mit zurück.
    case cancelledWithSwitch(diag: String, multiOn: Bool)
    case cameraError(diag: String)

    func asDictionary() -> [String: Any] {
        switch self {
        case let .found(format, bytes, text, diag):
            return ["status": "found", "format": format, "bytesBase64": bytes.base64EncodedString(), "text": text, "diag": diag]
        case let .foundMany(items, diag, multiOn):
            // Oberste Ebene = erster Code (wie beim Einzel-Scan), items enthält alle, auch den ersten.
            let first = items.first
            let list: [[String: String]] = items.map {
                ["format": $0.format, "bytesBase64": $0.bytes.base64EncodedString(), "text": $0.text]
            }
            var out: [String: Any] = [
                "status": "found",
                "format": first?.format ?? "",
                "bytesBase64": first?.bytes.base64EncodedString() ?? "",
                "text": first?.text ?? "",
                "diag": diag,
                "items": list,
            ]
            if let on = multiOn { out["multiOn"] = on }
            return out
        case let .cancelled(diag):
            return ["status": "cancelled", "diag": diag]
        case let .cancelledWithSwitch(diag, multiOn):
            return ["status": "cancelled", "diag": diag, "multiOn": multiOn]
        case let .cameraError(diag):
            return ["status": "error", "code": "camera", "diag": diag]
        }
    }
}
