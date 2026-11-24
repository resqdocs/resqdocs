// „Mit Bridge-WLAN verbinden“: Zuordnung der Systemantwort zum Ergebnis für die Oberfläche (rein, ohne Gerät).
// Verbunden heißt erst, wenn die Bridge antwortet. Ohne nativen Weg (Browser, ältere App-Hülle, Android vor 10)
// lautet das Ergebnis „unsupported“, damit die Oberfläche auf „Von Hand verbinden“ zurückfällt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRIDGE_WIFI_PASSWORD,
  BRIDGE_WIFI_PREFIX,
  JOIN_CHECK_PAUSE_MS,
  JOIN_WAIT_MS,
  MSG_FAILED,
  MSG_NO_BRIDGE,
  MSG_NO_WIFI_FOUND,
  MSG_WIFI_OFF,
  failedMessage,
  joinBridgeWifiWith,
  wifiStatusWith,
  type BridgeWifiNative,
  type JoinDeps,
  type NativeJoinReply,
} from './bridgeWifiJoin.ts'

interface Rig {
  deps: JoinDeps
  joins: { ssidPrefix: string; passphrase: string }[]
  checks: boolean[]
  waits: number[]
}

/** `answers`: Antworten der Bridge-Prüfung der Reihe nach; danach bleibt es bei „nicht erreichbar“. */
function rig(platform: string, reply: NativeJoinReply | Error, answers: boolean[] = []): Rig {
  const r: Rig = { joins: [], checks: [], waits: [], deps: undefined as unknown as JoinDeps }
  let clock = 0
  const native: BridgeWifiNative = {
    async join(options) {
      r.joins.push(options)
      if (reply instanceof Error) throw reply
      return reply
    },
    async leave() {},
    async status() {
      return { supported: true, held: false }
    },
  }
  r.deps = {
    platform,
    native,
    async check(force) {
      r.checks.push(force)
      return answers[r.checks.length - 1] ?? false
    },
    async wait(ms) {
      r.waits.push(ms)
      clock += ms
    },
    now: () => clock,
  }
  return r
}

test('Zugangsdaten: Präfix und das öffentliche Passwort der Bridge', () => {
  assert.equal(BRIDGE_WIFI_PREFIX, 'ResQDocs-')
  assert.equal(BRIDGE_WIFI_PASSWORD, 'resqdocs2026')
})

test('Browser: nicht unterstützt, das Plugin wird gar nicht gefragt', async () => {
  const r = rig('web', { status: 'connected' }, [true])
  assert.deepEqual(await joinBridgeWifiWith(r.deps), { status: 'unsupported' })
  assert.equal(r.joins.length, 0)
  assert.equal(r.checks.length, 0)
})

test('Beitritt fragt mit Präfix und Passwort; verbunden erst, wenn die Bridge antwortet', async () => {
  for (const [platform, status] of [['android', 'connected'], ['ios', 'applied']] as const) {
    const r = rig(platform, { status }, [false, false, true])
    assert.deepEqual(await joinBridgeWifiWith(r.deps), { status: 'connected' })
    assert.deepEqual(r.joins, [{ ssidPrefix: 'ResQDocs-', passphrase: 'resqdocs2026' }])
    assert.deepEqual(r.checks, [true, true, true], 'jede Prüfung umgeht die Drossel')
    assert.deepEqual(r.waits, [JOIN_CHECK_PAUSE_MS, JOIN_CHECK_PAUSE_MS])
  }
})

test('System meldet Erfolg, die Bridge antwortet aber nicht: Fehler mit kurzem Text, nach begrenzter Zeit', async () => {
  const r = rig('ios', { status: 'applied' })
  assert.deepEqual(await joinBridgeWifiWith(r.deps), { status: 'error', message: MSG_NO_BRIDGE })
  const waited = r.waits.reduce((a, b) => a + b, 0)
  assert.ok(waited >= JOIN_WAIT_MS && waited < JOIN_WAIT_MS + 2 * JOIN_CHECK_PAUSE_MS, `gewartet: ${waited} ms`)
  assert.equal(r.checks.length, r.waits.length + 1)
})

test('Abgebrochen bzw. abgelehnt: kein Fehler, keine Prüfung der Bridge', async () => {
  const r = rig('android', { status: 'cancelled' })
  assert.deepEqual(await joinBridgeWifiWith(r.deps), { status: 'cancelled' })
  assert.equal(r.checks.length, 0)
})

test('Rückfall: Android vor 10 und fehlendes Plugin gelten als nicht unterstützt', async () => {
  assert.deepEqual(await joinBridgeWifiWith(rig('android', { status: 'unsupported' }).deps), { status: 'unsupported' })
  const missing = Object.assign(new Error('"ResQBridgeWifi" plugin is not implemented on android'), { code: 'UNIMPLEMENTED' })
  assert.deepEqual(await joinBridgeWifiWith(rig('android', missing).deps), { status: 'unsupported' })
})

test('Fehler bekommen einen kurzen Text', async () => {
  assert.deepEqual(await joinBridgeWifiWith(rig('android', { status: 'wifiOff' }).deps), { status: 'error', message: MSG_WIFI_OFF })
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', { status: 'failed', detail: 'internal' }).deps), {
    status: 'error',
    message: `${MSG_FAILED} (internal)`,
  })
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', { status: 'failed' }).deps), { status: 'error', message: MSG_FAILED })
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', {}).deps), { status: 'error', message: MSG_FAILED }, 'unbekannte Antwort')
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', new Error('kaputt')).deps), { status: 'error', message: MSG_FAILED })
  assert.ok(failedMessage('x'.repeat(200)).length < 100, 'Systemcode wird gekürzt')
  for (const m of [MSG_WIFI_OFF, MSG_NO_BRIDGE, MSG_NO_WIFI_FOUND, MSG_FAILED]) assert.ok(m.length <= 60, m)
})

test('Status: im Browser nie unterstützt; ein Fehler des Plugins heißt nicht unterstützt', async () => {
  const native = rig('web', {}).deps.native
  assert.deepEqual(await wifiStatusWith('web', native), { supported: false, held: false })
  assert.deepEqual(await wifiStatusWith('android', native), { supported: true, held: false })
  const broken: BridgeWifiNative = { ...native, status: async () => { throw new Error('fehlt') } }
  assert.deepEqual(await wifiStatusWith('ios', broken), { supported: false, held: false })
  const old: BridgeWifiNative = { ...native, status: async () => ({ supported: false, held: false }) }
  assert.deepEqual(await wifiStatusWith('android', old), { supported: false, held: false })
})

test('iOS ohne Bridge in Reichweite: „unknown“ wird zu einem klaren Satz, andere Fehler behalten ihren Code', async () => {
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', { status: 'failed', detail: 'unknown' }).deps), { status: 'error', message: MSG_NO_WIFI_FOUND })
  assert.doesNotMatch(MSG_NO_WIFI_FOUND, /unknown|\(/, 'kein Systemcode im Text')
  // Nur iOS und nur dieser Fehler: alles andere bleibt bei der allgemeinen Meldung mit Code.
  assert.deepEqual(await joinBridgeWifiWith(rig('android', { status: 'failed', detail: 'unknown' }).deps), { status: 'error', message: `${MSG_FAILED} (unknown)` })
  assert.deepEqual(await joinBridgeWifiWith(rig('ios', { status: 'failed', detail: 'internal' }).deps), { status: 'error', message: `${MSG_FAILED} (internal)` })
})
