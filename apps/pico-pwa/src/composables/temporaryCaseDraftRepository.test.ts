// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFakeKeyValueAdapter } from '../storage/keyValueAdapter.ts'
import {
  CASE_DRAFT_KEY,
  createTemporaryCaseDraftRepository,
} from './temporaryCaseDraftRepository.ts'
import { createDraft } from './temporaryCaseDraft.ts'

const HOUR = 60 * 60 * 1000
const state = () => ({ variableValues: { gcs: 15 }, values: {}, activeBlocks: ['b1'] })

test('save → load: gültiger Entwurf kommt unverändert zurück', async () => {
  const adapter = createFakeKeyValueAdapter()
  let t = 1_000_000
  const repo = createTemporaryCaseDraftRepository(adapter, () => t)
  const d = createDraft(state(), 'std', 3, t)
  await repo.save(d)
  const { draft, expired } = await repo.load()
  assert.equal(expired, false)
  assert.deepEqual(draft, d)
})

test('load: abgelaufener Entwurf wird gelöscht und meldet expired (keine Daten)', async () => {
  const adapter = createFakeKeyValueAdapter()
  let t = 1_000_000
  const repo = createTemporaryCaseDraftRepository(adapter, () => t)
  await repo.save(createDraft(state(), 'std', 1, t)) // TTL 1h
  t += HOUR + 1 // über Ablauf hinaus
  const { draft, expired } = await repo.load()
  assert.equal(draft, null, 'keine Patientendaten nach Ablauf')
  assert.equal(expired, true)
  assert.equal(adapter.dump()[CASE_DRAFT_KEY], undefined, 'Storage-Eintrag wurde gelöscht')
})

test('load: nicht abgelaufener Entwurf bleibt erhalten', async () => {
  const adapter = createFakeKeyValueAdapter()
  let t = 1_000_000
  const repo = createTemporaryCaseDraftRepository(adapter, () => t)
  await repo.save(createDraft(state(), 'std', 3, t))
  t += 2 * HOUR // innerhalb der TTL
  const { draft, expired } = await repo.load()
  assert.ok(draft)
  assert.equal(expired, false)
  assert.ok(adapter.dump()[CASE_DRAFT_KEY])
})

test('load: kein Entwurf → null/false', async () => {
  const repo = createTemporaryCaseDraftRepository(createFakeKeyValueAdapter(), () => 1)
  assert.deepEqual(await repo.load(), { draft: null, expired: false })
})

test('load: unlesbarer/fremder Inhalt → null und wird aufgeräumt', async () => {
  const adapter = createFakeKeyValueAdapter({ [CASE_DRAFT_KEY]: '{not valid json' })
  const repo = createTemporaryCaseDraftRepository(adapter, () => 1)
  const { draft, expired } = await repo.load()
  assert.equal(draft, null)
  assert.equal(expired, false)
  assert.equal(adapter.dump()[CASE_DRAFT_KEY], undefined)
})

test('delete entfernt den Entwurf', async () => {
  const adapter = createFakeKeyValueAdapter()
  const repo = createTemporaryCaseDraftRepository(adapter, () => 1)
  await repo.save(createDraft(state(), 'std', 3, 1))
  await repo.delete()
  assert.equal(adapter.dump()[CASE_DRAFT_KEY], undefined)
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Netz, kein direkter Web-Storage', () => {
  const src = readFileSync(new URL('./temporaryCaseDraftRepository.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})
