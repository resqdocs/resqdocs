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

/**
 * Reglergrenzen in Millisekunden Verzoegerung. Die schnellste Stufe ist 10 ms; Firmware vor 0.4.0 rundet
 * Werte unter 20 auf 20 auf (rueckwaertskompatibel, tippt dann nur nicht schneller).
 */
export const DELAY_MIN_MS = 10
export const DELAY_MAX_MS = 55
/** Schrittweite des Reglers. 5 ms, damit jede Stufe (10 ... 55, auch der Standard 45) erreichbar ist. */
export const DELAY_STEP_MS = 5
/** Standard der App (Maintainer-Vorgabe): 45 ms, Stufe „Normal". Die Firmware nimmt ohne delayMs 60. */
export const DELAY_DEFAULT_MS = 45

export function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return DELAY_DEFAULT_MS
  return Math.max(DELAY_MIN_MS, Math.min(DELAY_MAX_MS, Math.round(ms)))
}

/**
 * Verzoegerung -> Reglerstellung. Die Spiegelung an der Mitte des Bereichs: aus der kleinsten
 * Verzoegerung wird die groesste Reglerstellung. Dadurch bedeutet „weiter rechts" schneller.
 *
 * Bewusst dieselbe Skala (10-55) statt einer Prozentskala: so bleiben min/max/step des Reglers
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
 * Der Standard (45 ms) muss „Normal" ergeben, sonst liest sich der Auslieferungszustand wie eine
 * Fehleinstellung. Bereich 10-55: 10-25 Schnell, 30-45 Normal, 50-55 Langsam.
 */
export function typingSpeedLabel(delayMs: number): string {
  const ms = clampDelay(delayMs)
  if (ms <= 25) return 'Schnell'
  if (ms <= 45) return 'Normal'
  return 'Langsam'
}
