// Run: node --test --experimental-strip-types src/appLinks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAppLinksEnv, buildAppleAppSiteAssociation, buildAssetLinks } from './appLinks.ts'

const FP_A = Array.from({ length: 32 }, () => 'AA').join(':')
const FP_B = Array.from({ length: 32 }, () => 'BB').join(':')

test('ohne Umgebungswerte: nichts konfiguriert, keine Dateien', () => {
  const cfg = parseAppLinksEnv({})
  assert.deepEqual(cfg, { iosAppIds: [], android: [] })
  assert.equal(buildAppleAppSiteAssociation(cfg), null)
  assert.equal(buildAssetLinks(cfg), null)
})

test('iOS: mehrere App-Kennungen, Dubletten und ungueltige Eintraege fallen weg', () => {
  const cfg = parseAppLinksEnv({
    APPLINKS_IOS_APP_IDS: ' ABCDE12345.com.example.app , ABCDE12345.com.example.app,zu-kurz.com.example,ABCDE12345,ABCDE12345.com.example.beta ',
  })
  assert.deepEqual(cfg.iosAppIds, ['ABCDE12345.com.example.app', 'ABCDE12345.com.example.beta'])
  const aasa = JSON.parse(buildAppleAppSiteAssociation(cfg) ?? '')
  assert.deepEqual(aasa.applinks.details[0].appIDs, cfg.iosAppIds)
  // Nur die Wurzel MIT Fragment wird der App zugeordnet.
  assert.deepEqual(aasa.applinks.details[0].components, [{ '/': '/', '#': '?*' }])
})

test('Android: Fingerabdruecke je Paket gesammelt, Kleinschreibung normalisiert, Ungueltiges verworfen', () => {
  const cfg = parseAppLinksEnv({
    APPLINKS_ANDROID: `com.example.app=${FP_A}, com.example.app=${FP_B.toLowerCase()},com.example.debug=${FP_A},ohnepunkt=${FP_A},com.example.app=AA:BB,kein-gleich`,
  })
  assert.deepEqual(cfg.android, [
    { packageName: 'com.example.app', fingerprints: [FP_A, FP_B] },
    { packageName: 'com.example.debug', fingerprints: [FP_A] },
  ])
  const links = JSON.parse(buildAssetLinks(cfg) ?? '')
  assert.equal(links.length, 2)
  assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls'])
  assert.deepEqual(links[0].target, { namespace: 'android_app', package_name: 'com.example.app', sha256_cert_fingerprints: [FP_A, FP_B] })
})

test('eine Seite konfiguriert: nur diese Datei existiert', () => {
  const cfg = parseAppLinksEnv({ APPLINKS_IOS_APP_IDS: 'ABCDE12345.com.example.app' })
  assert.notEqual(buildAppleAppSiteAssociation(cfg), null)
  assert.equal(buildAssetLinks(cfg), null)
})
