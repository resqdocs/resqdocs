// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMedicationLookup } from './useMedicationLookup.ts'
import type { HttpAdapter, HttpResponse } from '../pico/picoTypes.ts'
import type { KeyValueAdapter } from '../storage/types.ts'

function fakeKv(): KeyValueAdapter & { dump: Record<string, string> } {
  const dump: Record<string, string> = {}
  return {
    dump,
    async get(k) { return dump[k] ?? null },
    async set(k, v) { dump[k] = v },
    async remove(k) { delete dump[k] },
  }
}

const MANIFEST = { version: 2, count: 2, updated: '2026-06-10T00:00:00Z', file: 'medications.v2.json' }
const ARTIFACT = { version: 2, count: 2, updated: '2026-06-10T00:00:00Z', entries: { '04527098': 'Ibuflam 600 mg', '17260627': 'Ramipril 5 mg' } }

function fakeHttp(map: Record<string, HttpResponse>): HttpAdapter & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async get(url) { calls.push(url); return map[url] ?? { status: 404, data: null } },
    async post() { throw new Error('kein POST erwartet') },
  }
}

// Manifest-URL + relativ daneben liegendes Daten-Artefakt (wie auf resqdocs.app/pzn/).
const MANIFEST_URL = 'https://example.test/pzn/manifest.json'
const DATA_URL = 'https://example.test/pzn/medications.v2.json'

test('DEAKTIVIERT (Default-Flag): kein Netz, keine Auflösung, kein Sync (IFA/DSGVO)', async () => {
  const kv = fakeKv()
  const http = fakeHttp({ [MANIFEST_URL]: { status: 200, data: MANIFEST }, [DATA_URL]: { status: 200, data: ARTIFACT } })
  // Ohne `enabled`-Override -> Default = PZN_DICTIONARY_ENABLED (false).
  const l = createMedicationLookup(http, kv, MANIFEST_URL)
  await l.ensureLoaded()
  assert.equal(l.resolve('04527098'), null, 'keine automatische Auflösung')
  assert.equal(await l.fetchRemoteVersion(), null, 'kein Versionsabruf')
  assert.equal(await l.syncNow(), 'PZN-Wörterbuch deaktiviert.')
  assert.deepEqual(http.calls, [], 'KEIN Netzzugriff')
})

test('syncNow lädt Manifest + Artefakt, persistiert, resolve trifft offline', async () => {
  const kv = fakeKv()
  const http = fakeHttp({
    [MANIFEST_URL]: { status: 200, data: MANIFEST },
    [DATA_URL]: { status: 200, data: ARTIFACT },
  })
  const l = createMedicationLookup(http, kv, MANIFEST_URL, true)
  const msg = await l.syncNow()
  assert.match(msg, /Version 2/)
  assert.ok(http.calls.includes(DATA_URL), 'Daten-URL relativ zum Manifest aufgelöst')
  assert.equal(l.resolve('04527098'), 'Ibuflam 600 mg')
  assert.equal(l.resolve('00000000'), null)
  // Offline-Neustart: zweite Instanz lädt aus dem Cache, KEIN HTTP nötig
  const l2 = createMedicationLookup(fakeHttp({}), kv, MANIFEST_URL, true)
  await l2.ensureLoaded()
  assert.equal(l2.resolve('17260627'), 'Ramipril 5 mg')
  assert.equal(l2.state.version, 2)
})

test('syncNow: gleiche Version lädt das Artefakt NICHT erneut', async () => {
  const kv = fakeKv()
  const http = fakeHttp({
    [MANIFEST_URL]: { status: 200, data: MANIFEST },
    [DATA_URL]: { status: 200, data: ARTIFACT },
  })
  const l = createMedicationLookup(http, kv, MANIFEST_URL, true)
  await l.syncNow()
  const before = http.calls.length
  const msg = await l.syncNow()
  assert.match(msg, /Bereits aktuell/)
  assert.equal(http.calls.filter((u) => u === DATA_URL).length, 1)
  assert.equal(http.calls.length, before + 1) // nur das Manifest erneut
})

test('syncNow: keine Daten (404) ist kein Fehler', async () => {
  const l = createMedicationLookup(fakeHttp({ [MANIFEST_URL]: { status: 404, data: null } }), fakeKv(), MANIFEST_URL, true)
  const msg = await l.syncNow()
  assert.match(msg, /keine Daten/i)
  assert.equal(l.state.error, null)
})

test('resolve normalisiert PZN auf 8 Stellen (BMP ohne fuehrende Null)', async () => {
  const kv = fakeKv()
  const http = fakeHttp({
    [MANIFEST_URL]: { status: 200, data: MANIFEST },
    [DATA_URL]: { status: 200, data: ARTIFACT },
  })
  const l = createMedicationLookup(http, kv, MANIFEST_URL, true)
  await l.syncNow()
  // Key im Woerterbuch ist 8-stellig "04527098".
  assert.equal(l.resolve('04527098'), 'Ibuflam 600 mg', 'exakter 8-stelliger Treffer bleibt')
  assert.equal(l.resolve('4527098'), 'Ibuflam 600 mg', 'BMP-Wert ohne fuehrende Null trifft')
  assert.equal(l.resolve('  4527098 '), 'Ibuflam 600 mg', 'Whitespace wird toleriert')
  // Robustheit: leere/ungueltige Eingaben brechen nicht, liefern null.
  assert.equal(l.resolve(''), null)
  assert.equal(l.resolve('abc'), null)
  assert.equal(l.resolve('99999999'), null, 'unbekannte PZN -> null')
  // >8 Ziffern werden NICHT gekuerzt -> kein (falscher) Treffer.
  assert.equal(l.resolve('045270989'), null, '9-stelliger Wert wird nicht gekuerzt -> null')
})

test('Quelltext-Garantie: Medications-Schicht loggt nicht, kein Browser-Storage', () => {
  for (const f of ['useMedicationLookup.ts', 'medicationStore.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), f)
  }
})
