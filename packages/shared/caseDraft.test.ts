// Laeuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampTtlHours, touchDraft, isDraftExpired, parseDraft } from './caseDraft.ts'
import { createReworkCaseDraftRepository, REWORK_CASE_DRAFT_KEY } from './caseDraftRepository.ts'
import type { KeyValueAdapter } from './adapters.ts'

const T0 = 1_000_000
const HOUR = 60 * 60 * 1000

function fakeAdapter(): KeyValueAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(k) {
      return store.get(k) ?? null
    },
    async set(k, v) {
      store.set(k, v)
    },
    async remove(k) {
      store.delete(k)
    },
  }
}

test('clampTtlHours: Bereich 1-5, Default 3', () => {
  assert.equal(clampTtlHours(3), 3)
  assert.equal(clampTtlHours(0), 1)
  assert.equal(clampTtlHours(9), 5)
  assert.equal(clampTtlHours('x'), 3)
})

test('touchDraft: expiresAt = now + ttl; createdAt vom Vorgaenger erhalten (sliding-idle)', () => {
  const d1 = touchDraft(null, { a: { state: 'custom', value: 'x' } }, 'p1', 3, T0)
  assert.equal(d1.expiresAt, T0 + 3 * HOUR)
  assert.equal(d1.createdAt, T0)
  const d2 = touchDraft(d1, { a: { state: 'custom', value: 'y' } }, 'p1', 3, T0 + HOUR)
  assert.equal(d2.createdAt, T0) // bleibt
  assert.equal(d2.expiresAt, T0 + HOUR + 3 * HOUR) // verlaengert
})

test('isDraftExpired: now >= expiresAt', () => {
  const d = touchDraft(null, { a: { state: 'confirmed' } }, 'p', 1, T0)
  assert.equal(isDraftExpired(d, T0 + HOUR - 1), false)
  assert.equal(isDraftExpired(d, T0 + HOUR), true)
})

test('parseDraft: roundtrip gueltig; nur bekannte Zustaende; ungueltig -> null', () => {
  const d = touchDraft(null, { a: { state: 'custom', value: 'x' } }, 'p', 3, T0)
  assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(d))), d)
  const raw = { protocolId: 'p', createdAt: T0, lastTouchedAt: T0, expiresAt: T0 + HOUR, ttlHours: 3, values: { a: { state: 'confirmed' }, b: { state: 'custom', value: 'v' }, x: { state: 'boese' }, y: { state: 'custom' } } }
  assert.deepEqual(Object.keys(parseDraft(raw)!.values).sort(), ['a', 'b'])
  assert.equal(parseDraft({ foo: 1 }), null)
  assert.equal(parseDraft(null), null)
})

test('sanitizeValues (via parseDraft): function-Variante - Allowlist {name,staerke,dosierung,kommentar,pzn}; leere Zeilen raus, namenlose MIT Daten bleiben (#260/#262)', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      mp: {
        state: 'function',
        rows: [
          { name: 'ASS', staerke: '100 mg', dosierung: '1-0-0', pzn: '123', aussteller: 'Dr. X' },
          { name: '', dosierung: 'x' }, // namenlos, aber Daten -> bleibt (Nutzerarbeit, bug-300)
          { name: '   ', kommentar: ' ' }, // komplett leer (nur Whitespace) -> raus
          { foo: 'bar' }, // kein name-String -> raus
        ],
      },
    },
  }
  const d = parseDraft(raw)!
  // 'aussteller' verworfen; staerke ueberlebt den Roundtrip; nur wirklich leere Zeilen entfallen
  assert.deepEqual(d.values.mp, {
    state: 'function',
    rows: [
      { name: 'ASS', staerke: '100 mg', dosierung: '1-0-0', pzn: '123' },
      { name: '', dosierung: 'x' },
    ],
  })
})

test('sanitizeValues (via parseDraft): function-Variante Aerzte - {name,rolle,ort,telefon,arztnummer}, invalide Rolle raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      ae: {
        state: 'function',
        rows: [
          { name: 'Dr. A', rolle: 'Hausarzt', ort: 'Kiel', telefon: '0431', arztnummer: '123', extra: 'x' },
          { name: 'Dr. B', rolle: 'Quatsch' },
          { name: '' },
        ],
      },
    },
  }
  const d = parseDraft(raw)!
  // Arzt-Felder behalten, 'extra' + invalide Rolle verworfen, namelose Zeile raus
  assert.deepEqual(d.values.ae, {
    state: 'function',
    rows: [{ name: 'Dr. A', rolle: 'Hausarzt', ort: 'Kiel', telefon: '0431', arztnummer: '123' }, { name: 'Dr. B' }],
  })
})

test('Repository: save -> load gueltig', async () => {
  const a = fakeAdapter()
  const repo = createReworkCaseDraftRepository(a, () => T0 + HOUR)
  await repo.save(touchDraft(null, { x: { state: 'custom', value: 'v' } }, 'p1', 3, T0))
  const { draft, expired } = await repo.load()
  assert.equal(expired, false)
  assert.equal(draft?.protocolId, 'p1')
  assert.deepEqual(draft?.values, { x: { state: 'custom', value: 'v' } })
})

test('Repository: abgelaufen -> geloescht, keine Daten zurueck', async () => {
  const a = fakeAdapter()
  const repo = createReworkCaseDraftRepository(a, () => T0 + 10 * HOUR)
  await repo.save(touchDraft(null, { x: { state: 'confirmed' } }, 'p', 1, T0))
  const { draft, expired } = await repo.load()
  assert.equal(draft, null)
  assert.equal(expired, true)
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
})

test('Repository: unlesbar -> aufgeraeumt; remove loescht', async () => {
  const a = fakeAdapter()
  a.store.set(REWORK_CASE_DRAFT_KEY, '{kaputt')
  const repo = createReworkCaseDraftRepository(a, () => T0)
  assert.equal((await repo.load()).draft, null)
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
  await repo.save(touchDraft(null, { x: { state: 'confirmed' } }, 'p', 3, T0))
  await repo.remove()
  assert.equal(a.store.has(REWORK_CASE_DRAFT_KEY), false)
})

test('sanitizeValues (via parseDraft): Score-Zeile (#55) - Pack-Years {cigarettesPerDay, years} überlebt, Fremdfeld raus', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      py: { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15, geheim: 'x' }] },
      leer: { state: 'function', rows: [{ cigarettesPerDay: NaN }, {}] },
    },
  }
  const d = parseDraft(raw)!
  assert.deepEqual(d.values.py, { state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] })
  // NaN + leeres Objekt = keine Nutzerarbeit -> beide Zeilen raus
  assert.deepEqual(d.values.leer, { state: 'function', rows: [] })
})

test('sanitizeValues (via parseDraft): Funktions-Status custom+Freitext und excluded ueberleben den Roundtrip', () => {
  const raw = {
    protocolId: 'p',
    createdAt: T0,
    lastTouchedAt: T0,
    expiresAt: T0 + HOUR,
    ttlHours: 3,
    values: {
      frei: { state: 'function', rows: [{ name: 'ASS' }], status: 'custom', text: 'siehe Akte' },
      raus: { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded' },
      leer: { state: 'function', rows: [{ name: 'ASS' }] },
      freiOhneText: { state: 'function', rows: [], status: 'custom' },
    },
  }
  const d = parseDraft(raw)!
  // custom: Status + Freitext bleiben, Zeilen erhalten (Allowlist)
  assert.deepEqual(d.values.frei, { state: 'function', rows: [{ name: 'ASS' }], status: 'custom', text: 'siehe Akte' })
  // excluded: Status bleibt (kein text-Feld)
  assert.deepEqual(d.values.raus, { state: 'function', rows: [{ name: 'ASS' }], status: 'excluded' })
  // kein Status = confirmed (rueckwaerts-kompatibel, kein status/text im Output)
  assert.deepEqual(d.values.leer, { state: 'function', rows: [{ name: 'ASS' }] })
  // custom ohne text -> auf '' normalisiert (typeof-Guard)
  assert.deepEqual(d.values.freiOhneText, { state: 'function', rows: [], status: 'custom', text: '' })
})
