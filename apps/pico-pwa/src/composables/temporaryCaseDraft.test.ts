// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CASE_DRAFT_TTL_DEFAULT_HOURS,
  clampTtlHours,
  createDraft,
  isDraftExpired,
  isStateEmpty,
  parseDraft,
  touchDraft,
} from './temporaryCaseDraft.ts'

const HOUR = 60 * 60 * 1000
const emptyState = () => ({ variableValues: {}, values: {}, activeBlocks: [] as string[] })
const filledState = () => ({ variableValues: { gcs: 15 }, values: {}, activeBlocks: ['b1'] })

test('clampTtlHours: 1–5, gerundet, sonst Default 3', () => {
  assert.equal(clampTtlHours(3), 3)
  assert.equal(clampTtlHours(1), 1)
  assert.equal(clampTtlHours(5), 5)
  assert.equal(clampTtlHours(0), 1) // unter Minimum
  assert.equal(clampTtlHours(9), 5) // über Maximum
  assert.equal(clampTtlHours(2.4), 2) // gerundet
  assert.equal(clampTtlHours('abc'), CASE_DRAFT_TTL_DEFAULT_HOURS)
  assert.equal(clampTtlHours(undefined), CASE_DRAFT_TTL_DEFAULT_HOURS)
})

test('createDraft: createdAt = lastTouchedAt = now, expiresAt = now + ttl', () => {
  const now = 1_000_000
  const d = createDraft(filledState(), 'std', 3, now)
  assert.equal(d.createdAt, now)
  assert.equal(d.lastTouchedAt, now)
  assert.equal(d.expiresAt, now + 3 * HOUR)
  assert.equal(d.ttlHours, 3)
  assert.equal(d.protocolId, 'std')
})

test('touchDraft (Sliding-Idle): jede echte Änderung verlängert expiresAt, createdAt bleibt', () => {
  const t0 = 1_000_000
  const d0 = createDraft(filledState(), 'std', 3, t0)
  const t1 = t0 + 2 * HOUR
  const d1 = touchDraft(d0, filledState(), 'std', 3, t1)
  assert.equal(d1.createdAt, t0, 'createdAt bleibt erhalten')
  assert.equal(d1.lastTouchedAt, t1)
  assert.equal(d1.expiresAt, t1 + 3 * HOUR, 'Timer wird ab now verlängert')
})

test('isDraftExpired: exakt bei expiresAt abgelaufen', () => {
  const now = 1_000_000
  const d = createDraft(filledState(), 'std', 1, now)
  assert.equal(isDraftExpired(d, now), false)
  assert.equal(isDraftExpired(d, now + HOUR - 1), false)
  assert.equal(isDraftExpired(d, now + HOUR), true)
  assert.equal(isDraftExpired(d, now + 2 * HOUR), true)
})

test('touchDraft: bereits abgelaufener Vorgänger startet createdAt neu', () => {
  const t0 = 1_000_000
  const expired = createDraft(filledState(), 'std', 1, t0)
  const tLater = t0 + 5 * HOUR // weit nach Ablauf
  const fresh = touchDraft(expired, filledState(), 'std', 3, tLater)
  assert.equal(fresh.createdAt, tLater, 'neuer Entwurf, neue createdAt')
  assert.equal(fresh.expiresAt, tLater + 3 * HOUR)
})

test('isStateEmpty erkennt leeren Arbeitsstand', () => {
  assert.equal(isStateEmpty(emptyState()), true)
  assert.equal(isStateEmpty(filledState()), false)
  assert.equal(isStateEmpty({ variableValues: {}, values: { p1: 'x' }, activeBlocks: [] }), false)
})

test('parseDraft: gültige Struktur round-trips, fremde/kaputte → null', () => {
  const d = createDraft(filledState(), 'std', 3, 1_000_000)
  const back = parseDraft(JSON.parse(JSON.stringify(d)))
  assert.deepEqual(back, d)
  assert.equal(parseDraft(null), null)
  assert.equal(parseDraft({ foo: 'bar' }), null)
  assert.equal(parseDraft({ state: { variableValues: {}, values: {}, activeBlocks: [] } }), null) // keine Zeitstempel
})

test('parseDraft: übernimmt NUR die drei caseState-Sammlungen (Datenminimierung)', () => {
  const raw = {
    createdAt: 1, lastTouchedAt: 1, expiresAt: 2, ttlHours: 3, protocolId: 'std',
    state: {
      variableValues: { a: 1 }, values: { p: 'x' }, activeBlocks: ['b'],
      // Fremdfelder (z. B. Roh-Payloads) dürfen NICHT durchrutschen:
      rawBmp: 'BASE64...', image: 'data:...', debug: { dump: 1 },
    },
  }
  const d = parseDraft(raw)
  assert.ok(d)
  assert.deepEqual(Object.keys(d!.state).sort(), ['activeBlocks', 'values', 'variableValues'])
  assert.equal((d!.state as Record<string, unknown>).rawBmp, undefined)
  assert.equal((d!.state as Record<string, unknown>).image, undefined)
})

test('Datensparsamkeit/Quelltext: kein Logging, kein Netz, kein direkter Web-Storage', () => {
  const src = readFileSync(new URL('./temporaryCaseDraft.ts', import.meta.url), 'utf8')
  assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest/.test(src))
})
