// haptics.ts — Haptik der App (@capacitor/haptics), eine dünne Schicht.
//
// Bedienelemente aus HTML geben von sich aus keine Rückmeldung wie die Bauteile des Systems. Diese Schicht holt
// das an wenigen, benannten Stellen nach. WAS wann auslöst, steht in hapticsRules.ts (Tabelle HAPTIC_EVENTS); die
// Stufe kommt aus den Einstellungen (Regler „Vibration“, 0 = aus).
//
//   haptic('sendOk')        aus dem Code, für Ergebnisse einer Aktion
//   data-haptic="…"         am Bedienelement, für Tipps (auch in den gemeinsamen Bauteilen: ohne App-Code)
//
// Still im Browser und bei jedem Fehler: Haptik darf nie stören oder etwas aufhalten. Die Einstellungen des Geräts
// (Haptik aus, Lautlos-Regeln) wertet das System selbst aus; die App umgeht sie nicht. Nur Impact und
// Notification, nie die alte Einmal-Vibration.
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { topLayer } from '@resqdocs/protocol-core-ui/backLayer'
import { useStorage } from '@/storage/useStorage'
import {
  eventForClick,
  HAPTIC_DRAG_HANDLE,
  HAPTIC_DRAG_SLOP,
  HAPTIC_SETTING_SWITCH,
  hapticFor,
  previewKind,
  type HapticEvent,
  type HapticKind,
} from './hapticsRules'

/** Rückmeldung abspielen. Im Browser (Vorschau der App) nur ein Ereignis am Dokument, an dem sich prüfen lässt,
 *  was ausgelöst hätte; dort vibriert nichts. */
function play(kind: HapticKind, event: string): void {
  if (!Capacitor.isNativePlatform()) {
    document.dispatchEvent(new CustomEvent('resq-haptic', { detail: { event, kind } }))
    return
  }
  try {
    const done =
      kind === 'light'
        ? Haptics.impact({ style: ImpactStyle.Light })
        : kind === 'medium'
          ? Haptics.impact({ style: ImpactStyle.Medium })
          : Haptics.notification({ type: kind === 'success' ? NotificationType.Success : kind === 'warning' ? NotificationType.Warning : NotificationType.Error })
    void done.catch(() => {
      /* Gerät ohne Haptik oder vom System abgeschaltet: still */
    })
  } catch {
    /* Plugin fehlt in einer älteren App-Hülle: still */
  }
}

function level(): number {
  return useStorage().settings.hapticsLevel
}

/** Ein benanntes Ereignis melden. Löst nur aus, wenn die eingestellte Stufe es vorsieht (Rückgabe: ausgelöst).
 *  Wirft nie. */
export function haptic(event: HapticEvent): boolean {
  const kind = hapticFor(event, level())
  if (kind) play(kind, event)
  return kind !== null
}

/** Vorschau beim Verstellen des Reglers „Vibration“: einmal kurz, außer bei „Aus“. */
export function previewHaptics(newLevel: number): void {
  const kind = previewKind(newLevel)
  if (kind) play(kind, 'preview')
}

/** Einmal beim Start der App: Tipps auf gekennzeichnete Bedienelemente, Verschieben, Schalter, Fenster. */
export function installAppHaptics(): void {
  // Capture-Phase: vor den Bedienelementen selbst, also mit dem Zustand im Moment des Tipps (z. B. welcher Tab
  // gerade aktiv ist). Gesperrte Knöpfe lösen kein click aus und geben damit auch keine Rückmeldung.
  document.addEventListener(
    'click',
    (e) => {
      const event = eventForClick(e.target as Element | null)
      watchWindows(event ? haptic(event) : false)
    },
    true,
  )
  document.addEventListener(
    'change',
    (e) => {
      if ((e.target as Element | null)?.matches?.(HAPTIC_SETTING_SWITCH)) haptic('settingSwitch')
    },
    true,
  )
  // Verschieben: Greifen beim Aufsetzen auf den Griff, Ablegen beim Loslassen nach einer Bewegung.
  let grab: { x: number; y: number } | null = null
  document.addEventListener(
    'pointerdown',
    (e) => {
      grab = (e.target as Element | null)?.closest?.(HAPTIC_DRAG_HANDLE) ? { x: e.clientX, y: e.clientY } : null
      if (grab) haptic('dragGrab')
    },
    true,
  )
  document.addEventListener(
    'pointerup',
    (e) => {
      const g = grab
      grab = null
      if (g && Math.hypot(e.clientX - g.x, e.clientY - g.y) > HAPTIC_DRAG_SLOP) haptic('dragDrop')
    },
    true,
  )
  document.addEventListener('pointercancel', () => (grab = null), true)
  // „Zurück“ auf Android schließt Fenster ohne Tipp.
  document.addEventListener('backbutton', () => watchWindows(false))
}

// Fenster öffnet oder schließt (nur Stufe „Viel“): Nach einem Tipp wird die Seite gefragt, ob jetzt ein anderes
// Fenster zuoberst liegt als vorher. Hat der Tipp selbst schon eine Rückmeldung gegeben, kommt keine zweite.
let shownLayer: Element | null = null
let windowTimer: ReturnType<typeof setTimeout> | undefined
function watchWindows(alreadyPlayed: boolean): void {
  if (!hapticFor('windowOpen', level())) return
  clearTimeout(windowTimer)
  windowTimer = setTimeout(() => {
    const now = topLayer()
    if (now === shownLayer) return
    const opened = now !== null
    shownLayer = now
    if (!alreadyPlayed) haptic(opened ? 'windowOpen' : 'windowClose')
  }, 80)
}
