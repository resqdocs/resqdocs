// App-Zuordnung fuer angetippte Transfer-Links: iOS (Universal Links) und Android (App Links) pruefen
// je eine Datei unter /.well-known/, bevor sie einen https-Link direkt an die App uebergeben.
// Die Werte (App-Kennungen, Zertifikats-Fingerabdruecke) sind Deploy-Konfiguration und kommen
// ausschliesslich aus Umgebungsvariablen. Ohne Konfiguration gibt es die Dateien nicht (404) und
// Links oeffnen wie bisher die Empfaenger-Seite im Browser.
//
// Zugeordnet wird NUR die Wurzel mit Fragment (#<id>.<key>): das ist die Form eines Transfer-Links.
// Der Schluessel im Fragment erreicht den Server dabei weiterhin nie.

export interface AndroidAppLink {
  packageName: string
  fingerprints: string[]
}

export interface AppLinksConfig {
  /** Apple-App-Kennungen in der Form <Team-ID>.<Bundle-ID>. */
  iosAppIds: string[]
  android: AndroidAppLink[]
}

const IOS_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Liest die Zuordnung aus der Umgebung. Ungueltige Eintraege werden verworfen (nie halb ausgeliefert).
 *  APPLINKS_IOS_APP_IDS = "<Team-ID>.<Bundle-ID>[,…]"
 *  APPLINKS_ANDROID     = "<Paketname>=<SHA-256-Fingerabdruck>[,…]" (mehrere Zertifikate je Paket: Eintrag wiederholen) */
export function parseAppLinksEnv(env: Record<string, string | undefined>): AppLinksConfig {
  const iosAppIds = [...new Set(list(env.APPLINKS_IOS_APP_IDS).filter((id) => IOS_APP_ID.test(id)))]
  const byPackage = new Map<string, Set<string>>()
  for (const entry of list(env.APPLINKS_ANDROID)) {
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    const packageName = entry.slice(0, eq).trim()
    const fingerprint = entry.slice(eq + 1).trim().toUpperCase()
    if (!ANDROID_PACKAGE.test(packageName) || !SHA256_FINGERPRINT.test(fingerprint)) continue
    if (!byPackage.has(packageName)) byPackage.set(packageName, new Set())
    byPackage.get(packageName)!.add(fingerprint)
  }
  const android = [...byPackage].map(([packageName, set]) => ({ packageName, fingerprints: [...set] }))
  return { iosAppIds, android }
}

/** Inhalt von /.well-known/apple-app-site-association; null = nicht konfiguriert. */
export function buildAppleAppSiteAssociation(cfg: AppLinksConfig, kind: 'transfer' | 'short' = 'transfer'): string | null {
  if (cfg.iosAppIds.length === 0) return null
  return JSON.stringify({
    applinks: {
      details: [
        {
          appIDs: cfg.iosAppIds,
          // Transfer: nur "/" MIT nicht-leerem Fragment. Kurzlink-Domain: nur Pfade aus genau 5 Zeichen (die Codes);
          // Startseite, /editor und /ai bleiben im Browser.
          components: kind === 'short' ? [{ '/': '/?????' }] : [{ '/': '/', '#': '?*' }],
        },
      ],
    },
  })
}

/** Inhalt von /.well-known/assetlinks.json; null = nicht konfiguriert. */
export function buildAssetLinks(cfg: AppLinksConfig): string | null {
  if (cfg.android.length === 0) return null
  return JSON.stringify(
    cfg.android.map((app) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: app.packageName, sha256_cert_fingerprints: app.fingerprints },
    })),
  )
}
