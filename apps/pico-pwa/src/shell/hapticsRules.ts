// Regeln zur Haptik ohne Abhängigkeit von Capacitor (in Node prüfbar). Verwendet von haptics.ts, den
// Einstellungen und dem Speicher.
//
// Haptik ist sparsam und abschaltbar. Der Regler „Vibration“ in den Einstellungen stellt nicht die Stärke ein,
// sondern an wie vielen Stellen die App eine Rückmeldung gibt. Jede höhere Stufe enthält die niedrigeren.
// Die ganze Zuordnung steht in der Tabelle HAPTIC_EVENTS: Ereignis → ab welcher Stufe, welche Art.
// Nie beim Schreiben in Textfeldern und nie beim Scrollen.

export type HapticsLevel = 0 | 1 | 2 | 3

/** Stufen des Reglers, von links nach rechts. */
export const HAPTICS_LEVEL_MIN: HapticsLevel = 0
export const HAPTICS_LEVEL_MAX: HapticsLevel = 3
/** Auslieferungszustand: „Normal“. */
export const HAPTICS_LEVEL_DEFAULT: HapticsLevel = 2

const LABELS: Record<HapticsLevel, string> = { 0: 'Aus', 1: 'Wenig', 2: 'Normal', 3: 'Viel' }

/** Gespeicherten Wert auf eine gültige Stufe bringen: fehlend oder ungültig → Standard. */
export function normalizeHapticsLevel(value: unknown): HapticsLevel {
  if (typeof value !== 'number' || !Number.isInteger(value)) return HAPTICS_LEVEL_DEFAULT
  if (value < HAPTICS_LEVEL_MIN || value > HAPTICS_LEVEL_MAX) return HAPTICS_LEVEL_DEFAULT
  return value as HapticsLevel
}

/** Name der Stufe, wie er über dem Regler steht. */
export function hapticsLevelLabel(value: unknown): string {
  return LABELS[normalizeHapticsLevel(value)]
}

/**
 * Art der Rückmeldung. Auf dem Gerät: light/medium = kurzer Impuls (Impact), success/warning/error = die
 * Meldungs-Rückmeldungen des Systems (Notification). Nie die alte Einmal-Vibration.
 */
export type HapticKind = 'light' | 'medium' | 'success' | 'warning' | 'error'

interface HapticRule {
  /** Ab dieser Stufe des Reglers. */
  from: 1 | 2 | 3
  kind: HapticKind
  /** Wo es auslöst, in Worten (für Doku und Bericht). */
  where: string
}

/** Die Zuordnung: Ereignis → ab welcher Stufe, welche Art von Rückmeldung. */
export const HAPTIC_EVENTS = {
  // Stufe 1 „Wenig“: nur das Ergebnis einer Aktion, auf das man wartet.
  sendOk: { from: 1, kind: 'success', where: 'Senden an die Bridge gelungen („An Gerät übertragen“)' },
  sendFailed: { from: 1, kind: 'error', where: 'Senden an die Bridge fehlgeschlagen' },
  bridgeConnected: { from: 1, kind: 'success', where: 'Fenster „Mit ResQDocs-Bridge verbinden“ meldet „Verbunden“' },
  // Stufe 2 „Normal“: dazu die Stellen, an denen ein Systembauteil von selbst Rückmeldung gäbe.
  confirmDelete: { from: 2, kind: 'warning', where: 'löschende Bestätigung (roter Knopf einer Rückfrage)' },
  statusToggle: { from: 2, kind: 'light', where: 'Zustandsschalter ✓ / ✎ / − eines Felds, Abschnitts oder einer Funktion' },
  dragGrab: { from: 2, kind: 'medium', where: 'Greifen beim Verschieben (Griff ≡ in der Optionsliste)' },
  dragDrop: { from: 2, kind: 'light', where: 'Ablegen beim Verschieben' },
  // Stufe 3 „Viel“: dazu leichte Tipps bei häufigen Bedienungen.
  tabSwitch: { from: 3, kind: 'light', where: 'Wechsel des Tabs in der Tab-Leiste' },
  settingSwitch: { from: 3, kind: 'light', where: 'Schalter in den Einstellungen' },
  windowOpen: { from: 3, kind: 'light', where: 'ein Fenster öffnet' },
  windowClose: { from: 3, kind: 'light', where: 'ein Fenster schließt' },
} as const satisfies Record<string, HapticRule>

export type HapticEvent = keyof typeof HAPTIC_EVENTS

export function isHapticEvent(name: unknown): name is HapticEvent {
  return typeof name === 'string' && Object.hasOwn(HAPTIC_EVENTS, name)
}

/** Welche Rückmeldung ein Ereignis bei dieser Stufe gibt; null = keine. */
export function hapticFor(event: unknown, level: unknown): HapticKind | null {
  if (!isHapticEvent(event)) return null
  const rule: HapticRule = HAPTIC_EVENTS[event]
  return normalizeHapticsLevel(level) >= rule.from ? rule.kind : null
}

/** Vorschau beim Verstellen des Reglers: die neue Stufe ist einmal kurz zu spüren, außer bei „Aus“. */
export function previewKind(level: unknown): HapticKind | null {
  return normalizeHapticsLevel(level) === 0 ? null : 'light'
}

// --- Wo die Ereignisse in der Oberfläche hängen -------------------------------------------------------------------
// Bedienelemente melden ihr Ereignis über ein Attribut; die gemeinsamen Bauteile bleiben frei von App-Code
// (der Online-Editor kennt das Attribut nicht und tut nichts).

/** `data-haptic="<Ereignis>"` an einem Bedienelement: ein Tipp darauf ist dieses Ereignis. */
export const HAPTIC_ATTR = 'data-haptic'

/** Tipps, die sich ohne Attribut erkennen lassen (gleicher Aufbau in allen Rückfragen bzw. in der Tab-Leiste). */
export const HAPTIC_CLICK_TARGETS: ReadonlyArray<{ selector: string; event: HapticEvent }> = [
  { selector: '.modal-open .modal-action .btn-error', event: 'confirmDelete' },
  { selector: 'nav.dock button:not(.dock-active)', event: 'tabSwitch' },
]
/** Griff zum Verschieben: Greifen beim Aufsetzen, Ablegen beim Loslassen nach einer Bewegung. */
export const HAPTIC_DRAG_HANDLE = '[data-option-handle]'
/** Ab dieser Strecke (px) zählt Loslassen als Ablegen und nicht als Tipp auf den Griff. */
export const HAPTIC_DRAG_SLOP = 8
/** Schalter in den Einstellungen (Ereignis `change`). */
export const HAPTIC_SETTING_SWITCH = '[data-tab-scroll="einstellungen"] input.toggle'

/** Die wenigen DOM-Fähigkeiten, die die Zuordnung braucht (in Tests durch einfache Objekte ersetzbar). */
export interface HapticTarget {
  closest(selector: string): { getAttribute(name: string): string | null } | null
}

/** Ereignis zu einem Tipp auf `target`; null, wenn der Tipp keine Rückmeldung bekommt. */
export function eventForClick(target: HapticTarget | null | undefined): HapticEvent | null {
  if (!target) return null
  const marked = target.closest(`[${HAPTIC_ATTR}]`)?.getAttribute(HAPTIC_ATTR)
  if (isHapticEvent(marked)) return marked
  for (const t of HAPTIC_CLICK_TARGETS) if (target.closest(t.selector)) return t.event
  return null
}
