// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTemporaryCaseDraftController } from './temporaryCaseDraftController.ts'
import type { TemporaryCaseDraft } from './temporaryCaseDraft.ts'

const tick = () => new Promise((r) => setTimeout(r, 0))
const filled = () => ({ variableValues: { gcs: 15 }, values: {}, activeBlocks: ['b1'] })

// Fake-Repository mit blockierbarem save(), um die Persist-vs-Verwerfen-Race
// deterministisch zu provozieren.
function makeRepo(initial: TemporaryCaseDraft | null = null) {
  let stored: TemporaryCaseDraft | null = initial
  let gate: { p: Promise<void>; resolve: () => void } | null = null
  return {
    repo: {
      async load() {
        return { draft: stored, expired: false }
      },
      async save(d: TemporaryCaseDraft) {
        if (gate) await gate.p
        stored = d
      },
      async delete() {
        stored = null
      },
    },
    peek: () => stored,
    blockSave() {
      let resolve!: () => void
      const p = new Promise<void>((r) => { resolve = r })
      gate = { p, resolve }
      return () => { const g = gate; gate = null; g!.resolve() }
    },
  }
}

test('markChanged persistiert nach Debounce', async () => {
  const r = makeRepo()
  const c = createTemporaryCaseDraftController({ repo: r.repo, ttlHours: () => 3, now: () => 1000, debounceMs: 0 })
  c.markChanged(() => filled(), 'std')
  await tick()
  await tick()
  assert.ok(r.peek(), 'Entwurf wurde gespeichert')
  assert.equal(r.peek()!.protocolId, 'std')
})

test('RACE: discard nach bereits gestartetem Speichern belebt den Entwurf NICHT wieder', async () => {
  const r = makeRepo()
  const c = createTemporaryCaseDraftController({ repo: r.repo, ttlHours: () => 3, now: () => 1000, debounceMs: 0 })
  const unblock = r.blockSave()       // das nächste save() blockiert
  c.markChanged(() => filled(), 'std')
  await tick()                        // Debounce feuert → persistNow startet → haengt im save()
  const discardP = c.discard()        // generation++, wartet auf in-flight save
  await tick()
  unblock()                           // save schreibt JETZT, danach loescht discard
  await discardP
  assert.equal(r.peek(), null, 'verworfener Entwurf darf nicht durch ein in-flight save wiederbelebt werden')
})

test('discard VOR Debounce-Feuern verhindert das Speichern ganz', async () => {
  const r = makeRepo()
  const c = createTemporaryCaseDraftController({ repo: r.repo, ttlHours: () => 3, now: () => 1000, debounceMs: 50 })
  c.markChanged(() => filled(), 'std')
  await c.discard()                   // bevor der 50ms-Timer feuert
  await tick()
  assert.equal(r.peek(), null, 'kein Speichern nach discard')
})

test('restore uebernimmt gueltigen Entwurf, verlaengert die TTL nicht', async () => {
  const draft: TemporaryCaseDraft = {
    version: 1, protocolId: 'std', createdAt: 1, lastTouchedAt: 1,
    expiresAt: 9_999_999_999, ttlHours: 3, state: filled(),
  }
  const r = makeRepo(draft)
  const c = createTemporaryCaseDraftController({ repo: r.repo, ttlHours: () => 3, now: () => 1000 })
  let applied: TemporaryCaseDraft | null = null
  await c.restore((d) => { applied = d })
  assert.equal(applied!.protocolId, 'std')
  assert.equal(c.expiredNotice.value, false)
})

test('checkExpiry: abgelaufener Entwurf -> Hinweis + clearLiveState', async () => {
  const r = {
    repo: {
      async load() { return { draft: null, expired: true } },
      async save() {},
      async delete() {},
    },
  }
  const c = createTemporaryCaseDraftController({ repo: r.repo, ttlHours: () => 3, now: () => 1000 })
  let cleared = false
  c.setClearHandler(() => { cleared = true })
  await c.checkExpiry()
  assert.equal(cleared, true, 'sichtbarer Zustand wird geleert')
  assert.equal(c.expiredNotice.value, true, 'neutraler Hinweis gesetzt')
})
