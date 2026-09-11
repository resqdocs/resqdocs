// Tippgeschwindigkeit: Reglerstellung <-> gespeicherte Verzoegerung.
//
// Das Problem, das diese Datei loest: gespeichert und an die Bridge geschickt wird eine VERZOEGERUNG
// (typingDelayMs, ms pro Zeichen - kleiner ist schneller). Der Regler in den Einstellungen heisst aber
// „Tippgeschwindigkeit". Beides direkt aneinandergebunden hiess: nach rechts ziehen macht langsamer.
// Das widerspricht der Erwartung an jeden Regler - rechts ist mehr von dem, was draufsteht.
//
// Gespeichert wird weiterhin die Verzoegerung. Das ist Absicht und darf nicht geaendert werden:
// picoTypes.ts:45-47 schickt delayMs so an die Firmware, und bestehende Einstellungen bleiben gueltig.
// Umgedreht wird ausschliesslich die ANZEIGE.

/** Reglergrenzen in Millisekunden Verzoegerung. Entsprechen den bisherigen min/max des Reglers. */
export const DELAY_MIN_MS = 20
export const DELAY_MAX_MS = 70

export function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return 60 // Default, siehe DEFAULT_SETTINGS
  return Math.max(DELAY_MIN_MS, Math.min(DELAY_MAX_MS, Math.round(ms)))
}

/**
 * Verzoegerung -> Reglerstellung. Die Spiegelung an der Mitte des Bereichs: aus der kleinsten
 * Verzoegerung wird die groesste Reglerstellung. Dadurch bedeutet „weiter rechts" schneller.
 *
 * Bewusst dieselbe Skala (20-70) statt einer Prozentskala: so bleiben min/max/step des Reglers
 * unveraendert, und die Abbildung ist ihre eigene Umkehrung (zweimal angewandt = Ausgangswert).
 */
export function speedFromDelay(delayMs: number): number {
  return DELAY_MIN_MS + DELAY_MAX_MS - clampDelay(delayMs)
}

/** Reglerstellung -> Verzoegerung. Dieselbe Spiegelung; siehe speedFromDelay. */
export function delayFromSpeed(speed: number): number {
  return DELAY_MIN_MS + DELAY_MAX_MS - clampDelay(speed)
}

/**
 * Stufen-Label zur Verzoegerung.
 *
 * Die Schwellen sind an den TATSAECHLICHEN Reglerbereich angepasst. Vorher lauteten sie
 * „<=30 Schnell, <=90 Normal, sonst Langsam" - bei einem Regler, der bei 70 endet, war „Langsam"
 * damit unerreichbar. Ganz rechts stand als Endbeschriftung „Langsam", waehrend die Anzeige darueber
 * „Normal" meldete: ein Widerspruch auf demselben Bildschirm.
 *
 * 60 ms ist der Firmware-Default und muss „Normal" ergeben, sonst liest sich der Auslieferungszustand
 * wie eine Fehleinstellung.
 */
export function typingSpeedLabel(delayMs: number): string {
  const ms = clampDelay(delayMs)
  if (ms <= 30) return 'Schnell'
  if (ms <= 60) return 'Normal'
  return 'Langsam'
}
