// whatsNew.ts — Seite „Neu“ der Tour nach einem Update: welche Versionen sie zeigt und wann die Tour kommt.
//
// Reine Logik ohne Vite/Vue (im Node-Test nutzbar). Quelle sind die Release-Notes (release-notes/de), die
// mit der App ausgeliefert werden. Die Tour-Kennung leitet sich aus der neuesten gezeigten Version ab, damit
// erscheint die Tour nach JEDEM Update von selbst. Früher musste die Kennung bei jedem Release von Hand
// hochgezählt und die Seite „Neu“ von Hand geschrieben werden - bei 1.12.0 ging das unter.
import { compareVersions } from '@resqdocs/protocol-core/version'
import type { ReleaseNote } from './releaseNotes'

/** Wie viele Versionen die Seite „Neu“ zeigt (Maintainer: „was die letzten 3 Versionen neu war“). */
export const WHATS_NEW_COUNT = 3

/** Präfix aller Tour-Kennungen in settings.dismissedHints (alt: tab-guide-v2 … v6, neu: tab-guide-1.13.0). */
export const TOUR_HINT_PREFIX = 'tab-guide-'

/**
 * Die letzten `count` Versionen bis einschliesslich der installierten, neueste zuerst. Notes zu einer
 * neueren Version (Testbuild vor dem Release) bleiben aussen vor. Unbekannte Version: die neuesten.
 */
export function whatsNewNotes(history: readonly ReleaseNote[], installed: string, count = WHATS_NEW_COUNT): ReleaseNote[] {
  const upTo = installed ? history.filter((n) => compareVersions(n.version, installed) <= 0) : [...history]
  return upTo.slice(0, count)
}

/**
 * Tour-Kennung: hängt an der neuesten GEZEIGTEN Version, nicht an der App-Version. Ein Testbuild ohne eigene
 * Notes verbraucht so nicht die Tour, die mit den echten Notes dieser Version kommt. Ohne Notes: `fallback`.
 */
export function tourHintId(notes: readonly ReleaseNote[], fallback: string): string {
  return notes[0] ? `${TOUR_HINT_PREFIX}${notes[0].version}` : fallback
}

/** Bisheriger Nutzer = hat schon eine ANDERE Tour gesehen; er bekommt zuerst die Seite „Neu“. */
export function isReturningUser(hints: readonly string[], current: string): boolean {
  return hints.some((h) => h.startsWith(TOUR_HINT_PREFIX) && h !== current)
}
