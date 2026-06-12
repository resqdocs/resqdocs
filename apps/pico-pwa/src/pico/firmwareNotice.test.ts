// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFirmwareNotice, CHECK_INTERVAL_MS } from './firmwareNotice.ts'
import type { OtaManifest, PicoStatus } from './picoTypes.ts'

const manifest: OtaManifest = { version: '0.3.2', size: 1000, sha256: 'ab'.repeat(32), sigB64: 'x'.repeat(88) }

/** otaSupported weglassen = alte Firmware ohne das Feld (Legacy 0.2.0). */
function makeStatus(fwVersion: string, otaSupported?: boolean): PicoStatus {
  const s: PicoStatus = { name: 'ResQDocs-F80EA8', fwVersion, apiVersion: '0.1.0', ready: true, defaultOs: 'win_de' }
  if (otaSupported !== undefined) s.otaSupported = otaSupported
  return s
}

/** Steuerbare Zeit + zaehlender Status-Fetcher. */
function makeDeps(fwVersion: string, opts: { otaSupported?: boolean; manifest?: OtaManifest | null; fail?: boolean } = {}) {
  let t = 1_000_000
  let calls = 0
  return {
    deps: {
      manifest: opts.manifest === undefined ? manifest : opts.manifest,
      fetchStatus: async () => {
        calls++
        if (opts.fail) throw new Error('ECONN')
        return makeStatus(fwVersion, opts.otaSupported ?? true)
      },
      now: () => t,
    },
    advance: (ms: number) => { t += ms },
    callCount: () => calls,
  }
}

test('reportStatus: Update sichtbar nur bei aelterer Bridge MIT otaSupported', () => {
  const n1 = createFirmwareNotice(makeDeps('0.3.0').deps)
  n1.reportStatus(makeStatus('0.3.0', true))
  assert.equal(n1.updateAvailable.value, true)
  assert.equal(n1.visible.value, true)

  const n2 = createFirmwareNotice(makeDeps('0.3.2').deps)
  n2.reportStatus(makeStatus('0.3.2', true))
  assert.equal(n2.visible.value, false, 'aktuelle Bridge -> kein Hinweis')

  const n3 = createFirmwareNotice(makeDeps('0.2.0').deps)
  n3.reportStatus(makeStatus('0.2.0'))
  assert.equal(n3.visible.value, false, 'alte Firmware ohne OTA -> kein Banner (BOOTSEL-Hinweis in den Einstellungen)')

  const n4 = createFirmwareNotice({ ...makeDeps('0.3.0').deps, manifest: null })
  n4.reportStatus(makeStatus('0.3.0', true))
  assert.equal(n4.visible.value, false, 'nichts gebuendelt -> nichts anbieten')
})

test('dismiss blendet fuer die Sitzung aus; neue Instanz (App-Start) zeigt wieder', () => {
  const { deps } = makeDeps('0.3.0')
  const n = createFirmwareNotice(deps)
  n.reportStatus(makeStatus('0.3.0', true))
  n.dismiss()
  assert.equal(n.visible.value, false)
  assert.equal(n.updateAvailable.value, true, 'Zustand bleibt, nur der Hinweis ist weg')
  const fresh = createFirmwareNotice(deps)
  fresh.reportStatus(makeStatus('0.3.0', true))
  assert.equal(fresh.visible.value, true)
})

test('checkAfterContact: holt Status und drosselt Folge-Checks', async () => {
  const { deps, advance, callCount } = makeDeps('0.3.0')
  const n = createFirmwareNotice(deps)

  await n.checkAfterContact()
  assert.equal(callCount(), 1)
  assert.equal(n.visible.value, true)

  await n.checkAfterContact() // innerhalb der Drossel
  assert.equal(callCount(), 1, 'kein zweiter Request innerhalb des Intervalls')

  advance(CHECK_INTERVAL_MS + 1)
  await n.checkAfterContact()
  assert.equal(callCount(), 2, 'nach Ablauf der Drossel wieder erlaubt')
})

test('checkAfterContact: reportStatus setzt die Drossel (kein Doppel-Request nach Einstellungen)', async () => {
  const { deps, callCount } = makeDeps('0.3.0')
  const n = createFirmwareNotice(deps)
  n.reportStatus(makeStatus('0.3.0', true))
  await n.checkAfterContact()
  assert.equal(callCount(), 0, 'frisch gemeldeter Status -> kein Hintergrund-Request')
})

test('checkAfterContact: Fehler werden geschluckt, kein Hinweis', async () => {
  const { deps, callCount } = makeDeps('0.3.0', { fail: true })
  const n = createFirmwareNotice(deps)
  await n.checkAfterContact() // darf nicht werfen
  assert.equal(callCount(), 1)
  assert.equal(n.visible.value, false)
})

test('checkAfterContact: ohne gebuendeltes Manifest kein Request', async () => {
  const { deps, callCount } = makeDeps('0.3.0', { manifest: null })
  const n = createFirmwareNotice(deps)
  await n.checkAfterContact()
  assert.equal(callCount(), 0)
})

test('Notice-Schicht loggt nicht und nutzt keinen Browser-Storage (Quelltext)', () => {
  for (const f of ['firmwareNotice.ts', 'useFirmwareNotice.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), f)
  }
})
