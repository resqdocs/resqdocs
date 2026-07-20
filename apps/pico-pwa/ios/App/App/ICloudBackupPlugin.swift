import Foundation
import Capacitor

/**
 * iCloud-Backup-Transport für iOS — Gegenstück zu driveCloudStore.ts (Android/Google Drive appDataFolder).
 *
 * Legt gzip-Bloebs unter "Documents/Backups/" im iCloud-Ubiquity-Container ab: dadurch syncen die Sicherungen
 * über die eigenen Apple-Geräte des Nutzers UND erscheinen (via NSUbiquitousContainers-Key in Info.plist,
 * IsDocumentScopePublic=true) sichtbar in der Dateien-App unter iCloud Drive -> ResQDocs -> Backups. Reiner
 * Byte-Transport — die gerätescoped/append-only-Rotation liegt unverändert in cloudBackup.ts/useBackup.ts und
 * ist robust gegen Nutzer-Eingriffe in „Dateien" (strikte Namensprüfung; ein Gerät löscht nie fremde Stände).
 *
 * NUR Vorlagen/Textbausteine, KEINE Patientendaten. Kein Logging von Inhalten, keine Fremd-Server.
 * Jeder Zugriff läuft über NSFileCoordinator (Reader-Writer-Lock gegen den iCloud-Daemon).
 */
@objc(ICloudBackupPlugin)
public class ICloudBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    // Capacitor-6+-Registrierung: lokale Swift-Plugins MÜSSEN CAPBridgedPlugin in Swift erfüllen
    // (jsName/identifier/pluginMethods). Das frühere .m-CAP_PLUGIN-Makro allein registrierte NICHT mehr
    // zuverlässig und kollidierte mit dieser @objc-Klasse ("ICloudBackup plugin is not implemented").
    // Muster wie @capacitor/app. Die .m ist deshalb bewusst leer.
    public let identifier = "ICloudBackupPlugin"
    public let jsName = "ICloudBackup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "put", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let containerId = "iCloud.com.example.resqdocs"
    private let subfolder = "Documents/Backups" // sichtbar in Dateien: iCloud Drive -> ResQDocs -> Backups
    private let q = DispatchQueue(label: "com.example.resqdocs.icloudbackup", qos: .utility)

    /// Diagnostischer Verfügbarkeits-Check. NUR off-main aufrufen (blockiert + retryt).
    /// reason: "ok" | "no-icloud-account" | "container-nil".
    /// Trennt „kein iCloud-Konto / iCloud Drive aus" (ubiquityIdentityToken == nil) von „Konto da, Container
    /// (noch) nicht bereitgestellt" (url bleibt trotz Retry nil -> Provisioning-Verzögerung/Portal/Profil/Speicher).
    private func probeAvailability() -> (available: Bool, url: URL?, reason: String) {
        // (a) Billiger Konto-Check zuerst — der von Apple vorgesehene Weg für „ist iCloud verfügbar".
        if FileManager.default.ubiquityIdentityToken == nil {
            return (false, nil, "no-icloud-account")
        }
        // (b) Container mit kurzem Backoff — der ERSTE url()-Aufruf provisioniert und kann kurz nil liefern.
        let attempts = 8
        let delay: TimeInterval = 0.6
        for i in 0..<attempts {
            if let url = FileManager.default.url(forUbiquityContainerIdentifier: containerId) {
                return (true, url, "ok")
            }
            if i < attempts - 1 {
                Thread.sleep(forTimeInterval: delay) // wir sind bereits off-main (q.utility)
            }
        }
        return (false, nil, "container-nil")
    }

    /// Ubiquity-Root oder nil. Blockiert/retryt -> NUR off-main verwenden.
    private func containerURL() -> URL? {
        probeAvailability().url
    }

    /// Versteckter Backup-Ordner (legt ihn bei Bedarf an).
    private func backupDir() -> URL? {
        guard let root = containerURL() else { return nil }
        let dir = root.appendingPathComponent(subfolder, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// ".rqd-….json.gz.icloud" (noch nicht geladener Platzhalter) -> "rqd-….json.gz"
    private func realName(_ raw: String) -> String {
        var n = raw
        if n.hasSuffix(".icloud") {
            n = String(n.dropLast(7))
            if n.hasPrefix(".") { n.removeFirst() }
        }
        return n
    }

    @objc func available(_ call: CAPPluginCall) {
        q.async {
            let r = self.probeAvailability()
            call.resolve(["available": r.available, "reason": r.reason])
        }
    }

    @objc func put(_ call: CAPPluginCall) {
        guard let name = call.getString("name"),
              let b64 = call.getString("dataBase64"),
              let data = Data(base64Encoded: b64) else {
            call.reject("Ungültige Argumente")
            return
        }
        q.async {
            guard let dir = self.backupDir() else { call.reject("iCloud nicht verfügbar"); return }
            let url = dir.appendingPathComponent(name)
            var coErr: NSError?
            var writeErr: Error?
            NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coErr) { u in
                do { try data.write(to: u, options: .atomic) } catch { writeErr = error }
            }
            if let e = coErr ?? (writeErr as NSError?) {
                call.reject("Schreiben fehlgeschlagen: \(e.code)")
                return
            }
            call.resolve()
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        q.async {
            guard let dir = self.backupDir() else { call.reject("iCloud nicht verfügbar"); return }
            let keys: [URLResourceKey] = [.contentModificationDateKey, .fileSizeKey]
            let items = (try? FileManager.default.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: keys, options: [])) ?? []
            var files: [[String: Any]] = []
            for u in items {
                let name = self.realName(u.lastPathComponent)
                guard name.hasPrefix("rqd-") else { continue } // nur unsere Dateien
                let v = try? u.resourceValues(forKeys: Set(keys))
                let mtime = (v?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
                files.append([
                    "id": name,
                    "name": name,
                    "modifiedTime": mtime,
                    "size": v?.fileSize ?? 0,
                ])
            }
            call.resolve(["files": files])
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id fehlt"); return }
        q.async {
            guard let dir = self.backupDir() else { call.reject("iCloud nicht verfügbar"); return }
            let url = dir.appendingPathComponent(id)
            // iOS lädt neue iCloud-Dateien NIE automatisch -> vor dem Lesen Download anstoßen + kurz pollen.
            let st = (try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]))?
                .ubiquitousItemDownloadingStatus
            if st != .current {
                try? FileManager.default.startDownloadingUbiquitousItem(at: url)
                let deadline = Date().addingTimeInterval(20)
                while Date() < deadline {
                    let s = (try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]))?
                        .ubiquitousItemDownloadingStatus
                    if s == .current { break }
                    Thread.sleep(forTimeInterval: 0.3)
                }
            }
            var out: String?
            var coErr: NSError?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coErr) { u in
                if let d = try? Data(contentsOf: u) { out = d.base64EncodedString() }
            }
            call.resolve(["dataBase64": out ?? NSNull()]) // null = fehlend/nicht ladbar -> TS behandelt es
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id fehlt"); return }
        q.async {
            guard let dir = self.backupDir() else { call.reject("iCloud nicht verfügbar"); return }
            let url = dir.appendingPathComponent(id)
            var coErr: NSError?
            NSFileCoordinator().coordinate(writingItemAt: url, options: .forDeleting, error: &coErr) { u in
                try? FileManager.default.removeItem(at: u)
            }
            if let e = coErr { call.reject("Löschen fehlgeschlagen: \(e.code)"); return }
            call.resolve()
        }
    }
}
