// Tests fuer die Fortschrittslogik des Tippens (typingProgress.ts): Live-Meldungen der Bridge,
// Schaetzung ohne Verbindung bzw. mit aelterer Firmware, Anhalten/Fortsetzen/Abbrechen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTypingTracker, estimateMsPerChar, countChars, formatRemaining, shouldKeepAwake, POLL_LIVE_MS, POLL_RECONNECT_MS } from './typingProgress.ts'
import type { TypingControl, TypingStatus } from './picoTypes.ts'

const st = (over: Partial<TypingStatus> = {}): TypingStatus => ({ state: 'typing', done: 0, total: 100, delayMs: 10, jobId: 1, lastEnd: 'none', ...over })

/** Bridge-Attrappe mit steuerbarer Uhr. `next` = Antwort der naechsten Abfrage (Status, null oder Fehler). */
function rig(total = 100, delayMs = 10) {
  let now = 10_000
  let next: TypingStatus | null | Error = st({ total })
  const controls: TypingControl[] = []
  let controlAnswer: TypingStatus | null | Error = null
  const tracker = createTypingTracker(
    { total, delayMs },
    {
      now: () => now,
      fetchStatus: async () => {
        if (next instanceof Error) throw next
        return next
      },
      control: async (a) => {
        controls.push(a)
        if (controlAnswer instanceof Error) throw controlAnswer
        return controlAnswer
      },
    },
  )
  return {
    tracker,
    controls,
    advance: (ms: number) => { now += ms },
    answer: (v: TypingStatus | null | Error) => { next = v },
    controlAnswer: (v: TypingStatus | null | Error) => { controlAnswer = v },
  }
}

test('Schaetzung pro Zeichen: Untergrenze 2 USB-Abholungen, darueber Pause + 10 ms', () => {
  assert.equal(estimateMsPerChar(5), estimateMsPerChar(10), 'unter 10 ms wird es nicht schneller')
  assert.ok(estimateMsPerChar(10) >= 20)
  assert.ok(estimateMsPerChar(45) > estimateMsPerChar(10))
  assert.ok(Number.isFinite(estimateMsPerChar(Number.NaN)))
})

test('Zeichen zaehlen wie die Bridge: Umlaute und Emoji je ein Zeichen', () => {
  assert.equal(countChars('äöü€'), 4)
  assert.equal(countChars('a😀b'), 3)
  assert.equal(countChars(''), 0)
})

test('live: Balken folgt den Meldungen der Bridge, Steuerung ist moeglich', async () => {
  const r = rig()
  assert.equal(r.tracker.snapshot().pending, true, 'vor der ersten Antwort noch kein „geschaetzt"-Hinweis')
  r.answer(st({ done: 10 }))
  assert.equal(await r.tracker.poll(), true)
  let s = r.tracker.snapshot()
  assert.equal(s.source, 'live')
  assert.equal(s.pending, false)
  assert.equal(s.phase, 'typing')
  assert.equal(s.done, 10)
  assert.equal(s.canControl, true)
  assert.equal(r.tracker.nextPollInMs(), POLL_LIVE_MS)
  r.advance(500)
  r.answer(st({ done: 35 }))
  await r.tracker.poll()
  s = r.tracker.snapshot()
  assert.equal(s.done, 35)
  assert.ok(s.remainingMs !== null && s.remainingMs > 0)
})

test('live: Restzeit richtet sich nach dem gemessenen Tempo', async () => {
  const r = rig(1000, 10)
  r.answer(st({ total: 1000, done: 0 }))
  await r.tracker.poll()
  // 100 ms pro Zeichen gemessen (deutlich langsamer als die Schaetzung von ~23 ms)
  for (let i = 1; i <= 12; i++) {
    r.advance(500)
    r.answer(st({ total: 1000, done: i * 5 }))
    await r.tracker.poll()
  }
  const s = r.tracker.snapshot()
  const proZeichen = s.remainingMs! / (s.total - s.done)
  assert.ok(proZeichen > 80 && proZeichen < 110, `gemessenes Tempo uebernommen, ist ${proZeichen}`)
})

test('live: zwischen zwei Meldungen laeuft der Balken weiter, behauptet aber nie „fertig"', async () => {
  const r = rig(100, 10)
  r.answer(st({ done: 98 }))
  await r.tracker.poll()
  r.advance(5000)
  const s = r.tracker.snapshot()
  assert.equal(s.phase, 'typing')
  assert.ok(s.done <= 99 && s.fraction < 1)
})

test('fertig: Bridge meldet idle + done → 100 %, keine weitere Abfrage', async () => {
  const r = rig()
  r.answer(st({ done: 50 }))
  await r.tracker.poll()
  r.answer(st({ state: 'idle', done: 100, lastEnd: 'done' }))
  assert.equal(await r.tracker.poll(), false)
  const s = r.tracker.snapshot()
  assert.equal(s.phase, 'done')
  assert.equal(s.fraction, 1)
  assert.equal(s.done, 100)
  assert.equal(s.remainingMs, null)
  assert.equal(s.canControl, false)
})

test('kurzer Text: schon bei der ersten Abfrage fertig', async () => {
  const r = rig(5)
  r.answer(st({ state: 'idle', done: 5, total: 5, lastEnd: 'done' }))
  assert.equal(await r.tracker.poll(), false)
  assert.equal(r.tracker.snapshot().phase, 'done')
})

test('anhalten und weitertippen: Zustand kommt von der Bridge, Balken steht waehrend der Pause', async () => {
  const r = rig()
  r.answer(st({ done: 20 }))
  await r.tracker.poll()
  r.controlAnswer(st({ state: 'paused', done: 21 }))
  assert.equal(await r.tracker.control('pause'), true)
  let s = r.tracker.snapshot()
  assert.equal(s.phase, 'paused')
  assert.equal(s.remainingMs, null)
  r.advance(60_000)
  assert.equal(r.tracker.snapshot().done, 21, 'waehrend der Pause laeuft nichts weiter')
  r.controlAnswer(st({ state: 'typing', done: 21 }))
  assert.equal(await r.tracker.control('resume'), true)
  s = r.tracker.snapshot()
  assert.equal(s.phase, 'typing')
  assert.deepEqual(r.controls, ['pause', 'resume'])
})

test('abbrechen: Phase cancelled, Balken bleibt beim erreichten Stand', async () => {
  const r = rig()
  r.answer(st({ done: 40 }))
  await r.tracker.poll()
  r.controlAnswer(st({ state: 'idle', done: 41, lastEnd: 'cancelled' }))
  assert.equal(await r.tracker.control('cancel'), true)
  const s = r.tracker.snapshot()
  assert.equal(s.phase, 'cancelled')
  assert.equal(s.done, 41)
  assert.ok(s.fraction < 1)
  assert.equal(await r.tracker.poll(), false)
})

test('Steuerung, wenn die Bridge schon fertig ist (409): gilt als fertig', async () => {
  const r = rig()
  r.answer(st({ done: 99 }))
  await r.tracker.poll()
  r.controlAnswer(null)
  assert.equal(await r.tracker.control('pause'), false)
  assert.equal(r.tracker.snapshot().phase, 'done')
})

test('aeltere Firmware (404): Schaetzung aus Zeichenzahl und Tempo, keine Steuerung, endet von selbst', async () => {
  const r = rig(100, 10)
  r.answer(null)
  assert.equal(await r.tracker.poll(), true)
  let s = r.tracker.snapshot()
  assert.equal(s.source, 'estimated')
  assert.equal(s.legacyFirmware, true)
  assert.equal(s.canControl, false)
  assert.equal(await r.tracker.control('cancel'), false)
  assert.deepEqual(r.controls, [], 'aelterer Firmware wird keine Steuerung geschickt')
  r.advance(1000)
  s = r.tracker.snapshot()
  assert.ok(s.done > 20 && s.done < 100, `laeuft geschaetzt weiter, ist ${s.done}`)
  r.advance(60_000)
  assert.equal(await r.tracker.poll(), false)
  assert.equal(r.tracker.snapshot().phase, 'done')
})

test('WLAN verlassen: nach zwei Fehlern Schaetzung ab dem letzten Stand, ruhigeres Abfragen', async () => {
  const r = rig(1000, 10)
  r.answer(st({ total: 1000, done: 100 }))
  await r.tracker.poll()
  r.answer(new Error('offline'))
  await r.tracker.poll()
  assert.equal(r.tracker.snapshot().source, 'live', 'ein einzelner Aussetzer schaltet noch nicht um')
  await r.tracker.poll()
  let s = r.tracker.snapshot()
  assert.equal(s.source, 'estimated')
  assert.equal(s.canControl, false)
  assert.equal(r.tracker.nextPollInMs(), POLL_RECONNECT_MS)
  assert.ok(s.done >= 100)
  r.advance(2000)
  s = r.tracker.snapshot()
  assert.ok(s.done > 150, 'Schaetzung laeuft weiter')
  // Wieder im WLAN: die Bridge-Meldung gilt sofort wieder.
  r.answer(st({ total: 1000, done: 300 }))
  await r.tracker.poll()
  s = r.tracker.snapshot()
  assert.equal(s.source, 'live')
  assert.equal(s.done, 300)
  assert.equal(s.canControl, true)
})

test('angehalten und WLAN verlassen: bleibt angehalten, laeuft nicht geschaetzt weiter', async () => {
  const r = rig()
  r.answer(st({ state: 'paused', done: 30 }))
  await r.tracker.poll()
  r.answer(new Error('offline'))
  await r.tracker.poll()
  await r.tracker.poll()
  r.advance(120_000)
  const s = r.tracker.snapshot()
  assert.equal(s.phase, 'paused')
  assert.equal(s.done, 30)
  // Zurueck im WLAN: die Bridge hat den Auftrag nach ihrem Zeitlimit verworfen.
  r.answer(st({ state: 'idle', done: 30, lastEnd: 'cancelled' }))
  await r.tracker.poll()
  assert.equal(r.tracker.snapshot().phase, 'cancelled')
})

test('langer Text in Teilen: die Gesamtzahl der App gilt, auch wenn die Bridge erst einen Teil kennt', async () => {
  const r = rig(20_000, 10)
  r.answer(st({ total: 16_384, done: 100 }))
  await r.tracker.poll()
  assert.equal(r.tracker.snapshot().total, 20_000)
})

test('neuer Auftrag auf der Bridge (andere jobId): der verfolgte gilt als beendet', async () => {
  const r = rig()
  r.answer(st({ done: 10, jobId: 4 }))
  await r.tracker.poll()
  r.answer(st({ done: 2, jobId: 5 }))
  assert.equal(await r.tracker.poll(), false)
  assert.equal(r.tracker.snapshot().phase, 'done')
})

test('leerer Text: sofort fertig, keine Abfrage noetig', async () => {
  const r = rig(0)
  assert.equal(r.tracker.snapshot().phase, 'done')
  assert.equal(await r.tracker.poll(), false)
})

test('Restzeit lesbar', () => {
  assert.equal(formatRemaining(null), '')
  assert.equal(formatRemaining(400), 'gleich fertig')
  assert.equal(formatRemaining(24_300), 'noch etwa 25 s')
  assert.equal(formatRemaining(125_000), 'noch etwa 2 min')
})

test('Bildschirm bleibt nur an, solange die Bridge nachweislich tippt und die Anzeige offen ist', async () => {
  const r = rig()
  assert.equal(shouldKeepAwake(null, true), false)
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), false, 'vor der ersten Meldung noch nicht')
  r.answer(st({ done: 10 }))
  await r.tracker.poll()
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), true, 'tippt + Live-Meldung + Anzeige offen')
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), false), false, 'Anzeige weggeklickt')
  r.controlAnswer(st({ state: 'paused', done: 11 }))
  await r.tracker.control('pause')
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), false, 'angehalten')
  r.controlAnswer(st({ state: 'typing', done: 11 }))
  await r.tracker.control('resume')
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), true)
  r.answer(new Error('offline'))
  await r.tracker.poll()
  await r.tracker.poll()
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), false, 'keine Verbindung: nur noch geschaetzt')
  r.answer(st({ state: 'idle', done: 100, lastEnd: 'done' }))
  await r.tracker.poll()
  assert.equal(shouldKeepAwake(r.tracker.snapshot(), true), false, 'fertig')
})
