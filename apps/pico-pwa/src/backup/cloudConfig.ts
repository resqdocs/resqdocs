// cloudConfig.ts — Konfiguration des optionalen Cloud-Backups.
//
// GOOGLE_WEB_CLIENT_ID = OAuth-2.0-**Web**-Client-ID (serverClientId) fürs Google-Sign-In. Das ist KEIN Secret
// (eine solche Client-ID steckt in jeder ausgelieferten APK und ist öffentlich einsehbar); hier die eigene
// Web-Client-ID des Google-Cloud-Projekts eintragen. Der zugehörige Android-OAuth-Client (Package-Name + SHA-1)
// muss im selben Google-Projekt existieren, seine ID wird NICHT im Code verwendet. Scope drive.appdata =
// non-sensitive (versteckter, app-eigener Ordner im Drive des Nutzers).
export const GOOGLE_WEB_CLIENT_ID = 'your-web-client-id.apps.googleusercontent.com'

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
