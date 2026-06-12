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

const RELEASE = {
  assets: [
    { name: 'manifest.json', browser_download_url: 'https://x/manifest.json' },
    { name: 'medications.v2.json', browser_download_url: 'https://x/medications.v2.json' },
  ],
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

const API = 'https://api/releases/latest'

test('syncNow lädt Manifest + Artefakt, persistiert, resolve trifft offline', async () => {
  const kv = fakeKv()
  const http = fakeHttp({
    [API]: { status: 200, data: RELEASE },
    'https://x/manifest.json': { status: 200, data: MANIFEST },
    'https://x/medications.v2.json': { status: 200, data: ARTIFACT },
  })
  const l = createMedicationLookup(http, kv, API)
  const msg = await l.syncNow()
  assert.match(msg, /Version 2/)
  assert.equal(l.resolve('04527098'), 'Ibuflam 600 mg')
  assert.equal(l.resolve('00000000'), null)
  // Offline-Neustart: zweite Instanz lädt aus dem Cache, KEIN HTTP nötig
  const l2 = createMedicationLookup(fakeHttp({}), kv, API)
  await l2.ensureLoaded()
  assert.equal(l2.resolve('17260627'), 'Ramipril 5 mg')
  assert.equal(l2.state.version, 2)
})

test('syncNow: gleiche Version lädt das Artefakt NICHT erneut', async () => {
  const kv = fakeKv()
  const http = fakeHttp({
    [API]: { status: 200, data: RELEASE },
    'https://x/manifest.json': { status: 200, data: MANIFEST },
    'https://x/medications.v2.json': { status: 200, data: ARTIFACT },
  })
  const l = createMedicationLookup(http, kv, API)
  await l.syncNow()
  const before = http.calls.length
  const msg = await l.syncNow()
  assert.match(msg, /Bereits aktuell/)
  assert.equal(http.calls.filter((u) => u.endsWith('medications.v2.json')).length, 1)
  assert.equal(http.calls.length, before + 2) // nur Release + Manifest erneut
})

test('syncNow: kein Release (404) ist kein Fehler', async () => {
  const l = createMedicationLookup(fakeHttp({ [API]: { status: 404, data: null } }), fakeKv(), API)
  const msg = await l.syncNow()
  assert.match(msg, /kein Release/i)
  assert.equal(l.state.error, null)
})

test('Quelltext-Garantie: Medications-Schicht loggt nicht, kein Browser-Storage', () => {
  for (const f of ['useMedicationLookup.ts', 'medicationStore.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), f)
  }
})
