// Bewusst leer. Die Registrierung des iCloud-Backup-Plugins erfolgt in Swift über CAPBridgedPlugin
// (jsName "ICloudBackup", siehe ICloudBackupPlugin.swift) — dem offiziellen Capacitor-6+-Muster (@capacitor/app).
//
// Das frühere CAP_PLUGIN(ICloudBackupPlugin, "ICloudBackup", …)-Makro expandierte zu
// "@interface ICloudBackupPlugin : NSObject" und kollidierte mit der @objc-Swift-Klasse (CAPPlugin-Subklasse),
// wodurch das Plugin zur Laufzeit als "not implemented" galt. Daher entfernt.
