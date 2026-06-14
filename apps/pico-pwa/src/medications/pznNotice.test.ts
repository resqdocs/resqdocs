// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reactive } from 'vue'
import { createPznNotice, PZN_STALE_AFTER_MS, PZN_CHECK_THROTTLE_MS } from './pznNotice.ts'

/** Steuerbare Zeit + zaehlender Versionsabruf. */
function makeDeps(opts: {
  version?: number | null
  fetchedAt?: string | null
  autoCheck?: boolean
  remote?: number | null
  fail?: boolean
} = {}) {
  let t = 10 * PZN_STALE_AFTER_MS // weit nach epoch, damit "alt" steuerbar ist
  let calls = 0
  // reactive wie das echte lookup.state, damit computed() auf Mutationen reagiert.
  const state = reactive({ version: opts.version ?? null, fetchedAt: opts.fetchedAt ?? null })
  return {
    state,
    deps: {
      getState: () => ({ version: state.version, fetchedAt: state.fetchedAt }),
      autoCheckEnabled: () => opts.autoCheck ?? false,
      fetchRemoteVersion: async () => {
        calls++
        if (opts.fail) throw new Error('ECONN')
        return opts.remote ?? null
      },
      now: () => t,
    },
    advance: (ms: number) => { t += ms },
    setNow: (ms: number) => { t = ms },
    callCount: () => calls,
    nowMs: () => t,
  }
}

const isoAgo = (nowMs: number, ms: number) => new Date(nowMs - ms).toISOString()

test('nie synchronisiert -> kein Hinweis (keine Belaestigung von Nicht-Nutzern)', () => {
  const { deps } = makeDeps({ version: null, fetchedAt: null })
  const n = createPznNotice(deps)
  assert.equal(n.visible.value, false)
  assert.equal(n.reason.value, null)
})

test('lokaler Alters-Hinweis: frisch -> aus, aelter als 7 Tage -> an (ohne Netz)', () => {
  const fresh = makeDeps({ version: 1 })
  fresh.state.fetchedAt = isoAgo(fresh.nowMs(), PZN_STALE_AFTER_MS - 60_000)
  const a = createPznNotice(fresh.deps)
  assert.equal(a.visible.value, false, 'jünger als 7 Tage -> kein Hinweis')

  const old = makeDeps({ version: 1 })
  old.state.fetchedAt = isoAgo(old.nowMs(), PZN_STALE_AFTER_MS + 60_000)
  const b = createPznNotice(old.deps)
  assert.equal(b.visible.value, true)
  assert.equal(b.reason.value, 'stale')
})

test('maybeCheck tut ohne Opt-in nichts (kein Netzabruf)', async () => {
  const { deps, callCount } = makeDeps({ version: 1, autoCheck: false, remote: 5 })
  const n = createPznNotice(deps)
  await n.maybeCheck()
  assert.equal(callCount(), 0, 'kein Hintergrund-Request ohne Zustimmung')
})

test('maybeCheck mit Opt-in: neuere Remote-Version -> praeziser Hinweis', async () => {
  const m = makeDeps({ version: 1, autoCheck: true, remote: 2 })
  m.state.fetchedAt = isoAgo(m.nowMs(), 60_000) // frisch -> nicht stale
  const n = createPznNotice(m.deps)
  await n.maybeCheck()
  assert.equal(m.callCount(), 1)
  assert.equal(n.reason.value, 'newer')
  assert.equal(n.visible.value, true)
  assert.equal(n.remoteVersion.value, 2)
})

test('maybeCheck mit Opt-in: gleiche Version -> kein Hinweis', async () => {
  const m = makeDeps({ version: 3, autoCheck: true, remote: 3 })
  m.state.fetchedAt = isoAgo(m.nowMs(), 60_000)
  const n = createPznNotice(m.deps)
  await n.maybeCheck()
  assert.equal(n.visible.value, false)
})

test('maybeCheck: gedrosselt; nach Ablauf wieder erlaubt', async () => {
  const m = makeDeps({ version: 1, autoCheck: true, remote: 1 })
  const n = createPznNotice(m.deps)
  await n.maybeCheck()
  assert.equal(m.callCount(), 1)
  await n.maybeCheck()
  assert.equal(m.callCount(), 1, 'innerhalb der Drossel kein zweiter Request')
  m.advance(PZN_CHECK_THROTTLE_MS + 1)
  await n.maybeCheck()
  assert.equal(m.callCount(), 2)
})

test('maybeCheck: Fehler werden geschluckt, kein Hinweis', async () => {
  const m = makeDeps({ version: 1, autoCheck: true, fail: true })
  m.state.fetchedAt = isoAgo(m.nowMs(), 60_000)
  const n = createPznNotice(m.deps)
  await n.maybeCheck() // darf nicht werfen
  assert.equal(n.visible.value, false)
})

test('maybeCheck: Drossel greift auch nach einem Fehler (kein Sofort-Retry)', async () => {
  const m = makeDeps({ version: 1, autoCheck: true, fail: true })
  const n = createPznNotice(m.deps)
  await n.maybeCheck()
  assert.equal(m.callCount(), 1)
  await n.maybeCheck() // gleich danach: gedrosselt trotz Fehler
  assert.equal(m.callCount(), 1, 'temporaerer Netzfehler loest keinen sofortigen erneuten Abruf aus')
  m.advance(PZN_CHECK_THROTTLE_MS + 1)
  await n.maybeCheck()
  assert.equal(m.callCount(), 2, 'nach Ablauf der Drossel wieder erlaubt')
})

test('dismiss blendet fuer die Sitzung aus; reset (nach Sync) raeumt auf', async () => {
  const old = makeDeps({ version: 1 })
  old.state.fetchedAt = isoAgo(old.nowMs(), PZN_STALE_AFTER_MS + 60_000)
  const n = createPznNotice(old.deps)
  assert.equal(n.visible.value, true)
  n.dismiss()
  assert.equal(n.visible.value, false)

  // Sync aktualisiert den lokalen Stand: frisch + zuruecksetzen -> kein Hinweis.
  old.state.version = 2
  old.state.fetchedAt = isoAgo(old.nowMs(), 0)
  n.reset()
  assert.equal(n.visible.value, false)
  assert.equal(n.remoteVersion.value, null)
})

test('Notice-Schicht loggt nicht und nutzt keinen Browser-Storage (Quelltext)', () => {
  for (const f of ['pznNotice.ts', 'usePznNotice.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), f)
  }
})
