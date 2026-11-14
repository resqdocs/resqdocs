// typingProgress.ts — Fortschritt des Tippens auf der Bridge, als reine Logik (ohne Vue, ohne Netz).
//
// Zwei Quellen:
//  - 'live':      die Bridge meldet „x von y Zeichen" (Firmware ab 0.4.0, Handy noch im Bridge-WLAN).
//  - 'estimated': keine Meldung (aeltere Firmware oder WLAN verlassen) → Schaetzung aus Zeichenzahl und
//                 Tempo. Die Bridge tippt in beiden Faellen unabhaengig vom Handy zu Ende.
//
// Datenschutz: hier laufen nur Zahlen durch (Zeichen getippt/gesamt), nie Text.
import type { TypingControl, TypingStatus } from './picoTypes'

/**
 * Geschaetzte Dauer pro Zeichen. Jedes Zeichen sind mindestens zwei USB-Meldungen (Taste gedrueckt,
 * Taste losgelassen); der Zielrechner holt sie im 10-ms-Takt ab (usb_hid_poll_interval des Cores).
 * Die eingestellte Pause laeuft parallel zum Abholen der zweiten Meldung, daher: max(Pause + 10, 20).
 * Der Zuschlag deckt Zeichen mit Umschalt-/AltGr-Taste und Akzente (mehr Meldungen) im Mittel ab.
 * Im Live-Betrieb ersetzt das gemessene Tempo diese Schaetzung.
 */
export function estimateMsPerChar(delayMs: number): number {
  const d = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 60
  return Math.max(d + 10, 20) * 1.15
}

/** Zeichen so zaehlen wie die Bridge (Code-Points, keine UTF-16-Einheiten). */
export function countChars(text: string): number {
  return Array.from(text).length
}

export type ProgressPhase = 'typing' | 'paused' | 'done' | 'cancelled'
export type ProgressSource = 'live' | 'estimated'

export interface ProgressSnapshot {
  phase: ProgressPhase
  source: ProgressSource
  /** 0…1 */
  fraction: number
  done: number
  total: number
  /** Restzeit in ms; null solange angehalten oder beendet */
  remainingMs: number | null
  /** Anhalten/Fortsetzen/Abbrechen moeglich (Bridge erreichbar und Firmware kann es) */
  canControl: boolean
  /** true, wenn die Firmware keinen Fortschritt meldet (vor 0.4.0) - dann bleibt es bei der Schaetzung */
  legacyFirmware: boolean
  /** true, solange noch keine Abfrage beantwortet ist (Anzeige: noch kein „geschaetzt"-Hinweis) */
  pending: boolean
}

export interface TrackerDeps {
  /** Fortschritt abfragen: Status, null = Firmware kennt es nicht; wirft bei Netzfehler. */
  fetchStatus: () => Promise<TypingStatus | null>
  /** Steuerung: neuer Status, null = kein Auftrag; wirft bei Netzfehler. */
  control: (action: TypingControl) => Promise<TypingStatus | null>
  now: () => number
}

/** Abstand der Abfragen: zuegig solange verbunden, ruhiger beim Wiederverbinden. */
export const POLL_LIVE_MS = 500
export const POLL_RECONNECT_MS = 2000
/** So viele fehlgeschlagene Abfragen in Folge, bis auf Schaetzung umgeschaltet wird. */
const FAILS_UNTIL_ESTIMATED = 2

/**
 * Verfolgt EINEN Tipp-Auftrag. Aufrufer: `poll()` regelmaessig (siehe `nextPollInMs`), `snapshot()`
 * fuer die Anzeige (beliebig oft, rechnet zwischen zwei Abfragen fluessig weiter).
 */
export function createTypingTracker(input: { total: number; delayMs: number }, deps: TrackerDeps) {
  const startedAt = deps.now()
  let total = Math.max(0, Math.floor(input.total))
  let msPerChar = estimateMsPerChar(input.delayMs)
  let phase: ProgressPhase = total === 0 ? 'done' : 'typing'
  let source: ProgressSource = 'estimated'
  let legacyFirmware = false
  let jobId: number | null = null
  // Letzter gesicherter Stand: Zeichen und Zeitpunkt. Von hier aus wird fortgeschrieben.
  let anchorDone = 0
  let anchorAt = startedAt
  let fails = 0
  let inFlight = false
  let answered = false

  function projectedDone(now: number): number {
    if (phase === 'done') return total
    if (phase !== 'typing') return anchorDone
    const ahead = Math.max(0, now - anchorAt) / msPerChar
    // Live: hoechstens bis kurz vor die naechste Meldung laufen lassen, nie „fertig" behaupten.
    const cap = source === 'live' ? Math.min(total - 1, anchorDone + (POLL_LIVE_MS * 3) / msPerChar) : total
    return Math.max(anchorDone, Math.min(anchorDone + ahead, Math.max(cap, anchorDone)))
  }

  function applyLive(st: TypingStatus): void {
    const now = deps.now()
    fails = 0
    // Fremder Auftrag (z. B. ein spaeter gesendeter): unseren als beendet ansehen.
    if (jobId !== null && st.jobId !== jobId) {
      phase = 'done'
      source = 'live'
      return
    }
    jobId = st.jobId
    total = Math.max(total, st.total)
    const wasTyping = phase === 'typing' && source === 'live'
    // Tempo aus zwei aufeinanderfolgenden Live-Meldungen (nur waehrend getippt wird).
    if (wasTyping && st.state === 'typing' && st.done > anchorDone && now > anchorAt) {
      const measured = (now - anchorAt) / (st.done - anchorDone)
      if (measured > 1 && measured < 2000) msPerChar = msPerChar * 0.6 + measured * 0.4
    }
    source = 'live'
    anchorDone = st.done
    anchorAt = now
    if (st.state === 'typing') phase = 'typing'
    else if (st.state === 'paused') phase = 'paused'
    else phase = st.lastEnd === 'cancelled' ? 'cancelled' : 'done'
  }

  function toEstimated(): void {
    if (source === 'estimated') return
    // Vom zuletzt gemeldeten Stand aus weiterschaetzen. Ein angehaltener Auftrag bleibt angehalten:
    // ohne Verbindung laesst er sich nicht fortsetzen, die Bridge verwirft ihn nach ihrem Zeitlimit.
    const now = deps.now()
    anchorDone = projectedDone(now)
    anchorAt = now
    source = 'estimated'
  }

  /** Eine Abfrage. Gibt zurueck, ob weiter abgefragt werden soll. */
  async function poll(): Promise<boolean> {
    if (isFinished()) return false
    if (inFlight) return true
    if (legacyFirmware) return finishEstimateIfDue()
    inFlight = true
    try {
      const st = await deps.fetchStatus()
      answered = true
      if (st === null) {
        legacyFirmware = true
        source = 'estimated'
      } else {
        applyLive(st)
      }
    } catch {
      fails++
      if (fails >= FAILS_UNTIL_ESTIMATED) {
        answered = true
        toEstimated()
      }
    } finally {
      inFlight = false
    }
    return finishEstimateIfDue()
  }

  /** In der Schaetzung endet der Auftrag, wenn die geschaetzte Zeit um ist. */
  function finishEstimateIfDue(): boolean {
    if (source === 'estimated' && phase === 'typing' && projectedDone(deps.now()) >= total) phase = 'done'
    return !isFinished()
  }

  function isFinished(): boolean {
    return phase === 'done' || phase === 'cancelled'
  }

  async function control(action: TypingControl): Promise<boolean> {
    if (isFinished() || source !== 'live' || legacyFirmware) return false
    try {
      const st = await deps.control(action)
      if (st === null) {
        // Kein Auftrag mehr auf der Bridge: er ist inzwischen fertig geworden.
        phase = 'done'
        return false
      }
      applyLive(st)
      return true
    } catch {
      fails = FAILS_UNTIL_ESTIMATED
      toEstimated()
      return false
    }
  }

  function snapshot(): ProgressSnapshot {
    const now = deps.now()
    if (source === 'estimated') finishEstimateIfDue()
    const done = Math.min(total, projectedDone(now))
    const fraction = total > 0 ? Math.min(1, done / total) : 1
    return {
      phase,
      source,
      fraction: phase === 'done' ? 1 : fraction,
      done: Math.floor(phase === 'done' ? total : done),
      total,
      remainingMs: phase === 'typing' ? Math.max(0, (total - done) * msPerChar) : null,
      canControl: source === 'live' && !legacyFirmware && !isFinished(),
      legacyFirmware,
      pending: !answered,
    }
  }

  function nextPollInMs(): number {
    return source === 'live' || fails < FAILS_UNTIL_ESTIMATED ? POLL_LIVE_MS : POLL_RECONNECT_MS
  }

  return { poll, control, snapshot, nextPollInMs, isFinished }
}

export type TypingTracker = ReturnType<typeof createTypingTracker>

/**
 * Soll der Bildschirm anbleiben? Nur solange die Anzeige offen ist UND die Bridge nachweislich gerade
 * tippt (Live-Meldung). Angehalten, beendet, geschaetzt oder weggeklickt: der Bildschirm darf ausgehen.
 * Das Tippen selbst haengt nie am Bildschirm - die Bridge tippt auch bei gesperrtem Handy zu Ende.
 */
export function shouldKeepAwake(snapshot: ProgressSnapshot | null, visible: boolean): boolean {
  return !!snapshot && visible && snapshot.phase === 'typing' && snapshot.source === 'live'
}

/** Restzeit lesbar: „noch etwa 25 s", „noch etwa 2 min". */
export function formatRemaining(ms: number | null): string {
  if (ms === null) return ''
  const s = Math.ceil(ms / 1000)
  if (s <= 1) return 'gleich fertig'
  if (s < 60) return `noch etwa ${s} s`
  const min = Math.round(s / 60)
  return `noch etwa ${min} min`
}
