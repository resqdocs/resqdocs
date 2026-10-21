// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import {
  createAppUpdateNotice,
  isNewer,
  pickVersion,
  APP_UPDATE_CACHE_KEY,
  APP_UPDATE_SKIP_KEY,
  APP_VERSION_URL,
  STORE_URLS,
  type StorePlatform,
} from './appUpdateNotice.ts'
import { createFakeKeyValueAdapter } from '../storage/keyValueAdapter.ts'

/** Steuerbare Zeit, zaehlender Abruf, Fake-Preferences. */
function makeDeps(opts: {
  platform?: StorePlatform | null
  enabled?: boolean
  current?: string | null
  remote?: unknown
  fail?: boolean
  cache?: object
} = {}) {
  let t = 1_000_000
  let calls = 0
  let fail = opts.fail ?? false
  // reaktiv wie storage.settings in der App, damit computed() auf das Umschalten reagiert
  const enabled = ref(opts.enabled ?? true)
  const kv = createFakeKeyValueAdapter(opts.cache ? { [APP_UPDATE_CACHE_KEY]: JSON.stringify(opts.cache) } : {})
  return {
    kv,
    deps: {
      platform: () => (opts.platform === undefined ? 'ios' : opts.platform),
      enabled: () => enabled.value,
      currentVersion: async () => (opts.current === undefined ? '1.7.0' : opts.current),
      fetchLatest: async () => {
        calls++
        if (fail) throw new Error('offline')
        return opts.remote ?? { ios: '1.7.0', android: '1.7.0' }
      },
      kv,
      now: () => t,
    },
    advance: (ms: number) => { t += ms },
    nowMs: () => t,
    calls: () => calls,
    setEnabled: (v: boolean) => { enabled.value = v },
    setFail: (v: boolean) => { fail = v },
  }
}

test('isNewer: numerisch je Stelle, fehlende Stellen = 0, Muell nie neuer', () => {
  assert.equal(isNewer('1.7.1', '1.7.0'), true)
  assert.equal(isNewer('1.10.0', '1.9.3'), true)
  assert.equal(isNewer('2.0', '1.99.99'), true)
  assert.equal(isNewer('1.7.0', '1.7.0'), false)
  assert.equal(isNewer('1.7', '1.7.0'), false)
  assert.equal(isNewer('1.6.9', '1.7.0'), false)
  assert.equal(isNewer('1.8.0-beta', '1.7.0'), false)
  assert.equal(isNewer('1.8.0', 'quatsch'), false)
  // Test-Builds tragen ein Suffix an der installierten Version
  assert.equal(isNewer('1.7.1', '1.7.0-debug'), true)
  assert.equal(isNewer('1.7.1', '1.7.1-r8test'), false)
})

test('pickVersion: nur die eigene Plattform, nur gueltige Versionen', () => {
  assert.equal(pickVersion({ ios: '1.7.1', android: '1.7.2' }, 'ios'), '1.7.1')
  assert.equal(pickVersion({ ios: '1.7.1', android: '1.7.2' }, 'android'), '1.7.2')
  assert.equal(pickVersion({ android: '1.7.2' }, 'ios'), null)
  assert.equal(pickVersion({ ios: 171 }, 'ios'), null)
  assert.equal(pickVersion('1.7.1', 'ios'), null)
  assert.equal(pickVersion(null, 'ios'), null)
})

test('neuere Store-Version -> Hinweis sichtbar, Store-Link der Plattform', async () => {
  const d = makeDeps({ platform: 'android', remote: { ios: '1.7.0', android: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, true)
  assert.equal(n.latest.value, '1.7.1')
  assert.equal(n.storeUrl.value, STORE_URLS.android)
})

test('gleiche oder aeltere Version -> kein Hinweis', async () => {
  for (const ios of ['1.7.0', '1.6.0']) {
    const d = makeDeps({ remote: { ios } })
    const n = createAppUpdateNotice(d.deps)
    await n.maybeCheck()
    assert.equal(n.visible.value, false, ios)
  }
})

test('gestaffelte Freigabe: Android neuer, iOS noch nicht -> iOS zeigt nichts', async () => {
  const d = makeDeps({ platform: 'ios', remote: { ios: '1.7.0', android: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, false)
})

test('Web (keine Plattform) und abgeschaltet: KEIN Abruf, kein Hinweis', async () => {
  const web = makeDeps({ platform: null, remote: { ios: '9.0.0' } })
  const nWeb = createAppUpdateNotice(web.deps)
  await nWeb.maybeCheck()
  assert.equal(web.calls(), 0)
  assert.equal(nWeb.visible.value, false)

  const aus = makeDeps({ enabled: false, remote: { ios: '9.0.0' } })
  const nAus = createAppUpdateNotice(aus.deps)
  await nAus.maybeCheck()
  assert.equal(aus.calls(), 0)
  assert.equal(nAus.visible.value, false)
})

test('Abschalten blendet einen schon bekannten Hinweis sofort aus', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, true)
  d.setEnabled(false)
  assert.equal(n.visible.value, false)
})

test('jedes Oeffnen ruft ab: Start, Rueckkehr in den Vordergrund und Neustart', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  d.advance(1_000)
  await n.maybeCheck() // Rueckkehr in den Vordergrund
  assert.equal(d.calls(), 2)
  await createAppUpdateNotice(d.deps).maybeCheck() // Neustart
  assert.equal(d.calls(), 3)
})

test('Neustart offline: Hinweis sofort aus dem Speicher, Speicher bleibt unveraendert', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  await createAppUpdateNotice(d.deps).maybeCheck()
  const before = d.kv.dump()[APP_UPDATE_CACHE_KEY]

  d.setFail(true)
  d.advance(60_000)
  const n2 = createAppUpdateNotice(d.deps)
  await n2.maybeCheck()
  assert.equal(d.calls(), 2)
  assert.equal(n2.visible.value, true, 'zuletzt bekannte Version bleibt sichtbar')
  assert.equal(n2.latest.value, '1.7.1')
  assert.equal(d.kv.dump()[APP_UPDATE_CACHE_KEY], before, 'Fehler ueberschreibt den letzten Stand nicht')
})

test('laufender Abruf: ein zweiter Aufruf loest keinen weiteren aus', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await Promise.all([n.maybeCheck(), n.maybeCheck()])
  assert.equal(d.calls(), 1)
})

test('kaputter Speicher oder kaputte Antwort: kein Hinweis, kein Absturz', async () => {
  const d = makeDeps({ remote: '<html>' })
  await d.kv.set(APP_UPDATE_CACHE_KEY, '{nicht json')
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, false)
  assert.equal(d.calls(), 1)
})

test('installierte Version unbekannt -> kein Hinweis', async () => {
  const d = makeDeps({ current: null, remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, false)
})

test('Spaeter: blendet fuer die Sitzung aus, neue Instanz zeigt wieder', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  n.dismiss()
  assert.equal(n.visible.value, false)
  const n2 = createAppUpdateNotice(d.deps)
  await n2.maybeCheck()
  assert.equal(n2.visible.value, true)
})

test('Haken „bis zur naechsten Version": bleibt ueber Neustarts aus, eine neuere Version zeigt wieder', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  await n.dismiss(true)
  assert.equal(n.visible.value, false)
  assert.equal(d.kv.dump()[APP_UPDATE_SKIP_KEY], '1.7.1')

  const n2 = createAppUpdateNotice(d.deps) // Neustart, Store meldet weiter 1.7.1
  await n2.maybeCheck()
  assert.equal(n2.visible.value, false)

  const d3 = makeDeps({ remote: { ios: '1.7.2' } })
  await d3.kv.set(APP_UPDATE_SKIP_KEY, '1.7.1')
  const n3 = createAppUpdateNotice(d3.deps)
  await n3.maybeCheck()
  assert.equal(n3.visible.value, true)
  assert.equal(n3.latest.value, '1.7.2')
})

test('Spaeter ohne Haken merkt sich nichts dauerhaft', async () => {
  const d = makeDeps({ remote: { ios: '1.7.1' } })
  const n = createAppUpdateNotice(d.deps)
  await n.maybeCheck()
  await n.dismiss()
  assert.equal(d.kv.dump()[APP_UPDATE_SKIP_KEY], undefined)
})

test('Netzwerk-Policy: einzige Adresse ist die Versionsdatei auf resqdocs.app, keine Kennung im Abruf', () => {
  assert.equal(APP_VERSION_URL, 'https://resqdocs.app/app-version.json')
  const wiring = readFileSync(new URL('./useAppUpdateNotice.ts', import.meta.url), 'utf8')
  assert.deepEqual(wiring.match(/https?:\/\/[^\s'"`]+/g) ?? [], [], 'Adressen nur ueber appUpdateNotice.ts')
  assert.match(wiring, /\.get\(APP_VERSION_URL, \{/, 'Abruf genau dieser Adresse, ohne angehaengte Parameter')
  assert.ok(!/deviceId|uuid|getId\(/i.test(wiring), 'keine Geraetekennung')
  // Nur feste Header: neutraler User-Agent statt Geraetemodell/Systemversion des HTTP-Stacks, feste Sprache
  // statt der Geraetesprache.
  const headers = [...wiring.matchAll(/headers: (\{[^}]*\})/g)].map((m) => m[1])
  assert.deepEqual(headers, ["{ 'User-Agent': 'ResQDocs', 'Accept-Language': 'de' }"])
})
