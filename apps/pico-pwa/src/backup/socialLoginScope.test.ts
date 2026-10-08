// Laeuft mit:  node --test --experimental-strip-types
//
// Social Login nur mit Google. Die App braucht @capgo/capacitor-social-login ausschliesslich fuer die
// Drive-Sicherung auf Android (driveCloudStore.ts); iOS sichert ueber iCloud. Ohne Anbieter-Liste in
// capacitor.config.ts buendelt das Plugin ALLE Anbieter - so lag das Facebook-SDK im Android-Build, obwohl
// die App es nie aufruft. Der Plugin-Hook setzt die Liste bei `npx cap sync` in die nativen Abhaengigkeiten
// um (Android: socialLogin.<anbieter>.include, iOS: Podspec/Package.swift).
//
// Festgehalten wird deshalb die Quelle, nicht das Build-Ergebnis: die Liste in capacitor.config.ts und
// dass iOS das Plugin samt Google-/Facebook-SDKs gar nicht erst einbindet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import config from '../../capacitor.config.ts'

test('Social Login: nur Google ist eingeschaltet, alle anderen Anbieter ausdruecklich aus', () => {
  assert.deepEqual(config.plugins?.SocialLogin?.providers, {
    google: true,
    facebook: false,
    apple: false,
    twitter: false,
  })
})

test('iOS bindet weder Social Login noch Google- oder Facebook-SDKs ein (Sicherung dort ueber iCloud)', () => {
  for (const file of ['Podfile', 'Podfile.lock']) {
    const text = readFileSync(new URL(`../../ios/App/${file}`, import.meta.url), 'utf8')
    for (const pod of ['CapgoCapacitorSocialLogin', 'GoogleSignIn', 'FBSDK', 'FBAEMKit']) {
      assert.ok(!text.includes(pod), `${pod} steht in ios/App/${file}`)
    }
  }
})
