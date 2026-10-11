// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBridgeUrl } from './bridgeUrl.ts'
import { createSettingsRepository } from '../storage/settingsRepository.ts'
import { createFakeKeyValueAdapter } from '../storage/keyValueAdapter.ts'

test('Adresse ohne Schema bekommt http:// ergaenzt', () => {
  assert.deepEqual(normalizeBridgeUrl('10.10.10.1'), { ok: true, url: 'http://10.10.10.1' })
  assert.deepEqual(normalizeBridgeUrl('  10.10.10.1  '), { ok: true, url: 'http://10.10.10.1' })
  assert.deepEqual(normalizeBridgeUrl('bridge.local:8080'), { ok: true, url: 'http://bridge.local:8080' })
})

test('http(s) bleibt unveraendert', () => {
  assert.deepEqual(normalizeBridgeUrl('http://10.10.10.1'), { ok: true, url: 'http://10.10.10.1' })
  assert.deepEqual(normalizeBridgeUrl('HTTPS://bridge.local'), { ok: true, url: 'HTTPS://bridge.local' })
})

test('anderes Schema -> Fehlermeldung nennt http://', () => {
  const r = normalizeBridgeUrl('ftp://10.10.10.1')
  assert.equal(r?.ok, false)
  assert.match(r && !r.ok ? r.error : '', /http:\/\//)
})

test('leer -> null (Feld springt auf den gespeicherten Wert zurueck)', () => {
  assert.equal(normalizeBridgeUrl(''), null)
  assert.equal(normalizeBridgeUrl('   '), null)
})

test('ergaenzte Adresse uebersteht den Neustart (Speicherschicht nimmt sie an)', async () => {
  const r = normalizeBridgeUrl('10.10.10.2')
  assert.ok(r?.ok)
  const repo = createSettingsRepository(createFakeKeyValueAdapter())
  const s = await repo.loadSettings()
  await repo.saveSettings({ ...s, picoBaseUrl: r.url })
  assert.equal((await repo.loadSettings()).picoBaseUrl, 'http://10.10.10.2')
})
