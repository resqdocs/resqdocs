// Läuft mit:  node --test --experimental-strip-types
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compareVersions, bytesToBase64, runFirmwareUpdate } from './firmwareUpdate.ts'
import type { OtaManifest, PicoClient, PicoStatus } from './picoTypes.ts'

const firmware = new Uint8Array(20000).map((_, i) => i % 251)
const manifest: OtaManifest = {
  version: '0.3.0',
  size: firmware.length,
  sha256: 'ab'.repeat(32),
  sigB64: Buffer.alloc(64).toString('base64'),
}

interface OtaCall { kind: string; offset?: number; bytes?: number }

/** Fake-PicoClient für den OTA-Durchlauf; Verhalten über Optionen steuerbar. */
function createFakeClient(opts: {
  chunkMax?: number
  failChunkAt?: number
  rebooting?: boolean
  healthSequence?: boolean[]
  statusVersion?: string
  statusFailFirst?: number
} = {}): PicoClient & { calls: OtaCall[] } {
  const calls: OtaCall[] = []
  let received = 0
  let healthIdx = 0
  let statusFails = opts.statusFailFirst ?? 0
  const status: PicoStatus = {
    name: 'ResQDocs-7F3A91', fwVersion: opts.statusVersion ?? '0.3.0',
    apiVersion: '0.1.0', ready: true, defaultOs: 'win_de', otaSupported: true,
  }
  return {
    calls,
    async health() {
      calls.push({ kind: 'health' })
      const seq = opts.healthSequence ?? [true]
      const v = seq[Math.min(healthIdx, seq.length - 1)]
      healthIdx++
      return v
    },
    async status() {
      calls.push({ kind: 'status' })
      if (statusFails > 0) { statusFails--; throw new Error('boot') }
      return status
    },
    async typeText() { throw new Error('nicht erwartet') },
    async setConfig() { throw new Error('nicht erwartet') },
    async otaBegin(m) {
      calls.push({ kind: 'begin', bytes: m.size })
      return { ok: true, chunkMax: opts.chunkMax ?? 8192 }
    },
    async otaChunk({ offset, dataB64 }) {
      const bytes = Buffer.from(dataB64, 'base64')
      calls.push({ kind: 'chunk', offset, bytes: bytes.length })
      if (opts.failChunkAt !== undefined && offset >= opts.failChunkAt) {
        throw new Error('Update-Upload fehlgeschlagen (HTTP 500)')
      }
      if (offset !== received) throw new Error('bad_offset (Fake)')
      received += bytes.length
      return { received }
    },
    async otaCommit() {
      calls.push({ kind: 'commit' })
      return { rebooting: opts.rebooting ?? true }
    },
  }
}

const fastSleep = async (): Promise<void> => {}

test('compareVersions: numerischer Semver-Vergleich', () => {
  assert.ok(compareVersions('0.3.0', '0.2.0') > 0)
  assert.ok(compareVersions('0.2.0', '0.3.0') < 0)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0, 'numerisch, nicht lexikographisch')
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0)
  assert.ok(compareVersions('0.3.0', 'kaputt') > 0, 'unparsbar zaehlt als 0')
})

test('bytesToBase64: Roundtrip gegen Buffer, auch ueber Blockgrenzen', () => {
  for (const n of [0, 1, 2, 3, 100, 32768, 32769, 70000]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 7) % 256)
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'), `n=${n}`)
  }
})

test('runFirmwareUpdate: sequenzielle Offsets, kein Chunk ueber chunkMax aus begin', async () => {
  const client = createFakeClient({ chunkMax: 4096 })
  await runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep, pollIntervalMs: 1 })
  const chunks = client.calls.filter((c) => c.kind === 'chunk')
  assert.equal(chunks.length, Math.ceil(firmware.length / 4096))
  let expected = 0
  let total = 0
  for (const c of chunks) {
    assert.equal(c.offset, expected, 'Offsets strikt sequenziell')
    assert.ok((c.bytes ?? 0) <= 4096, 'Chunk ueber chunkMax')
    expected += c.bytes ?? 0
    total += c.bytes ?? 0
  }
  assert.equal(total, firmware.length, 'alle Bytes uebertragen')
  assert.equal(client.calls.filter((c) => c.kind === 'commit').length, 1)
})

test('runFirmwareUpdate: Progress monoton bis 100 %, Phasen in Reihenfolge', async () => {
  const client = createFakeClient({})
  const progress: number[] = []
  const phases: string[] = []
  await runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, {
    sleep: fastSleep,
    pollIntervalMs: 1,
    onProgress: (sent, totalBytes) => progress.push(sent / totalBytes),
    onPhase: (p) => phases.push(p),
  })
  for (let i = 1; i < progress.length; i++) assert.ok(progress[i] >= progress[i - 1], 'Progress monoton')
  assert.equal(progress.at(-1), 1)
  assert.deepEqual(phases, ['uploading', 'verifying', 'rebooting', 'done'])
})

test('runFirmwareUpdate: Fehler beim Chunk stoppt Folge-Requests (kein commit)', async () => {
  const client = createFakeClient({ failChunkAt: 8192 })
  await assert.rejects(
    () => runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep, pollIntervalMs: 1 }),
    /HTTP 500/,
  )
  assert.equal(client.calls.filter((c) => c.kind === 'chunk').length, 2, 'nach dem Fehler keine weiteren Chunks')
  assert.equal(client.calls.filter((c) => c.kind === 'commit').length, 0)
})

test('runFirmwareUpdate: Groessen-Mismatch zum Manifest wirft OHNE Request', async () => {
  const client = createFakeClient({})
  await assert.rejects(
    () => runFirmwareUpdate(client, { ...manifest, size: 999 }, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep }),
    /passt nicht zum Manifest/,
  )
  assert.equal(client.calls.length, 0)
})

test('runFirmwareUpdate: Polling ueberlebt Boot-Phase (health false, Status wirft)', async () => {
  const client = createFakeClient({ healthSequence: [false, false, true], statusFailFirst: 1 })
  await runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep, pollIntervalMs: 1 })
  assert.ok(client.calls.filter((c) => c.kind === 'health').length >= 3)
})

test('runFirmwareUpdate: alte Version nach Reboot -> Fehler', async () => {
  const client = createFakeClient({ statusVersion: '0.2.0' })
  await assert.rejects(
    () => runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep, pollIntervalMs: 1 }),
    /0\.2\.0 statt 0\.3\.0/,
  )
})

test('runFirmwareUpdate: Bridge kommt nicht zurueck -> Timeout-Fehler', async () => {
  const client = createFakeClient({ healthSequence: [false] })
  await assert.rejects(
    () => runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep, pollIntervalMs: 10, pollBudgetMs: 50 }),
    /nicht wieder erreichbar/,
  )
})

test('runFirmwareUpdate: commit ohne rebooting -> Fehler', async () => {
  const client = createFakeClient({ rebooting: false })
  await assert.rejects(
    () => runFirmwareUpdate(client, manifest, firmware.buffer.slice(0) as ArrayBuffer, { sleep: fastSleep }),
    /keinen Neustart/,
  )
})

test('Firmware-Update-Schicht loggt nicht und nutzt keinen Browser-Storage (Quelltext)', () => {
  for (const f of ['firmwareUpdate.ts', 'firmwareAsset.ts', 'useFirmwareUpdate.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    assert.ok(!/console\.|localStorage\.|sessionStorage\.|indexedDB\./.test(src), f)
  }
})
