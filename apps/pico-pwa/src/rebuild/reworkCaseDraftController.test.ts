// Laeuft mit:  node --test --experimental-strip-types
// Reine Controller-Logik des Einsatz-Entwurfs: LAUFENDE TTL-Pruefung (checkExpiry) + Wettlauf-Schutz
// zwischen Auto-Save und Loeschen. Fake-Repository, injizierte Uhr -> deterministisch, ohne Vue/Capacitor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReworkCaseDraft } from '@resqdocs/protocol-core/caseDraft'
import type { LoadDraftResult, ReworkCaseDraftRepository } from '@resqdocs/protocol-core/caseDraftRepository'
import type { FieldFill } from '@resqdocs/protocol-core/model'
import { createReworkCaseDraftController } from './reworkCaseDraftController.ts'

const VALUES: Record<string, FieldFill> = { f1: { state: 'confirmed' } }

/** Fake-Repository: haelt EINEN Entwurf, optional mit steuerbarem Ablauf und blockierbarem save(). */
function makeRepo(initial: ReworkCaseDraft | null = null) {
  let stored = initial
  let expireNextLoad = false
  let saveGate: Promise<void> | null = null
  const repo: ReworkCaseDraftRepository & {
    peek: () => ReworkCaseDraft | null
    expireNextLoad: () => void
    setSaveGate: (p: Promise<void>) => void
  } = {
    async load(): Promise<LoadDraftResult> {
      if (expireNextLoad && stored) {
        stored = null
        expireNextLoad = false
        return { draft: null, expired: true }
      }
      return { draft: stored, expired: false }
    },
    async save(d) {
      if (saveGate) await saveGate
      stored = d
    },
    async remove() {
      stored = null
    },
    peek: () => stored,
    expireNextLoad: () => {
      expireNextLoad = true
    },
    setSaveGate: (p) => {
      saveGate = p
    },
  }
  return repo
}

test('checkExpiry: nicht abgelaufen -> false, kein clearLiveState, Entwurf bleibt', async () => {
  const repo = makeRepo({ version: 1, protocolId: 'p', createdAt: 0, lastTouchedAt: 0, expiresAt: 9e15, ttlHours: 3, values: VALUES })
  const ctrl = createReworkCaseDraftController(repo, { ttlHours: () => 3, now: () => 1000 })
  let cleared = 0
  ctrl.setClearHandler(() => (cleared += 1))
  assert.equal(await ctrl.checkExpiry(), false)
  assert.equal(cleared, 0)
  assert.ok(repo.peek(), 'Entwurf darf nicht geloescht sein')
})

test('checkExpiry: abgelaufen -> true, Entwurf geloescht, clearLiveState EINMAL', async () => {
  const repo = makeRepo({ version: 1, protocolId: 'p', createdAt: 0, lastTouchedAt: 0, expiresAt: 1, ttlHours: 3, values: VALUES })
  const ctrl = createReworkCaseDraftController(repo, { ttlHours: () => 3, now: () => 1000 })
  let cleared = 0
  ctrl.setClearHandler(() => (cleared += 1))
  repo.expireNextLoad()
  assert.equal(await ctrl.checkExpiry(), true)
  assert.equal(cleared, 1)
  assert.equal(repo.peek(), null)
})

test('save + load: Round-Trip; leerer Stand loescht den Entwurf', async () => {
  const repo = makeRepo()
  const ctrl = createReworkCaseDraftController(repo, { ttlHours: () => 3, now: () => 1000 })
  await ctrl.save('proto', VALUES)
  assert.ok(repo.peek(), 'nach save liegt ein Entwurf vor')
  assert.equal((await ctrl.load()).draft?.protocolId, 'proto')
  await ctrl.save('proto', {}) // leer -> loeschen
  assert.equal(repo.peek(), null)
})

test('Wettlauf: remove waehrend eines laufenden save belebt den Entwurf NICHT wieder', async () => {
  const repo = makeRepo()
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  repo.setSaveGate(gate)
  const ctrl = createReworkCaseDraftController(repo, { ttlHours: () => 3, now: () => 1000 })

  const pSave = ctrl.save('proto', VALUES) // parkt in repo.save (gate)
  const pRemove = ctrl.remove() // purge: generation++, wartet auf den laufenden save
  release() // save schreibt, DANN loescht purge -> Endstand muss leer sein
  await Promise.all([pSave, pRemove])
  assert.equal(repo.peek(), null, 'der geloeschte Entwurf darf nicht durch den Trailing-save zurueckkehren')
})
