// Auswahl der RICHTIGEN Ruecklinse fuer die Scanner (QR, Data Matrix, Packung).
//
// Anlass: auf manchen Android-Geraeten stellt die Kamera NIE scharf, weder beim Medikamentenplan noch
// beim Empfangen von Bausteinen. Ursache: alle drei Scanner forderten bisher nur
// `{ facingMode: 'environment' }` an - also „irgendeine rueckwaertige Kamera". Auf
// Mehrlinsen-Geraeten waehlt die WebView dann haeufig die ULTRAWEITWINKEL-Linse, und die hat auf
// vielen Geraeten FIXFOKUS. Sie kann prinzipbedingt nicht auf Scanabstand scharfstellen - kein
// Fokusproblem, sondern die falsche Linse. Das erklaert auch, warum es geraeteabhaengig ist.
//
// Diese Datei enthaelt NUR die Entscheidungslogik, ohne Browser-APIs - damit sie node-testbar ist.
// Das Einsammeln der Kandidaten (enumerateDevices + getCapabilities) steht in cameraProbe.ts.

/**
 * Gilt die Linsenwahl auf dieser Plattform? NUR auf Android.
 *
 * Auf iOS laeuft der Scan heute sehr gut und darf nicht angefasst werden. Drei Gruende, warum die
 * Linsenwahl dort nicht nur nutzlos, sondern schaedlich waere:
 *  1. WebKit meldet gar keinen focusMode (im Bestand an drei Stellen festgehalten, z.B.
 *     CodeScanOverlay.vue: „iOS-WebKit meldet kein focusMode"). canFocus() waere also fuer JEDE Linse
 *     false - und der ehrliche Hinweis „kann nicht scharfstellen" wuerde zur Falschaussage.
 *  2. Ohne Fokus-Signal entschieden Namensmuster und Aufloesung. iOS bietet aber ein VIRTUELLES
 *     Kombigeraet an („Back Dual/Triple Camera"), das selbst zwischen den Linsen umschaltet - genau
 *     das, was facingMode heute trifft und was iOS so gut macht. Eine einzelne physische Linse
 *     stattdessen zu waehlen waere ein Rueckschritt.
 *  3. Der Probelauf oeffnet jede Ruecklinse einzeln. Auf iOS waere das reine Wartezeit vor dem
 *     ersten Scan, ohne Gegenwert.
 *
 * Web auf dem Desktop bleibt bewusst ebenfalls beim alten Verhalten: das Problem ist dort nicht
 * gemeldet, und ein Probelauf ueber Webcams brauchen wir nicht.
 *
 * Der Umweg ueber den User-Agent ist Absicht: das Problem sitzt in Chromium AUF Android, nicht in der
 * Capacitor-Verpackung. Damit greift die Auswahl auch im mobilen Chrome - und genau dort laesst sich die
 * Diagnosezeile ohne Android-Studio-Build ablesen, was die Fehlersuche auf fremden Geraeten ueberhaupt
 * erst praktikabel macht. Ein Desktop-Chrome (Plattform 'web', kein Android im User-Agent) bleibt aussen vor.
 */
export function lensChoiceApplies(platform: string, userAgent = ''): boolean {
  if (platform === 'android') return true
  if (platform === 'ios') return false // nie, auch nicht ueber einen manipulierten User-Agent
  return /android/i.test(userAgent)
}

/** Was wir ueber eine Kamera wissen, nachdem wir sie kurz geoeffnet haben. */
export interface CameraCandidate {
  deviceId: string
  /** Geraetename, sofern die Plattform ihn preisgibt. Auf Android oft nur „camera2 0, facing back". */
  label?: string
  /** focusMode aus getCapabilities(). Leer/fehlend = die Linse kann nicht fokussieren (Fixfokus). */
  focusModes?: string[]
  /** Hoechste anfragbare Breite - grobes Mass fuer „Hauptkamera vs. Hilfslinse". */
  maxWidth?: number
}

/** Kann diese Linse ueberhaupt fokussieren? Genau das unterscheidet Haupt- von Ultraweitwinkel-Linse. */
export function canFocus(c: CameraCandidate): boolean {
  const m = c.focusModes ?? []
  return m.includes('continuous') || m.includes('single-shot') || m.includes('auto')
}

/** Linsen, die fuer einen Nahscan untauglich sind - am Namen erkennbar, soweit die Plattform ihn
 *  ueberhaupt liefert. Bewusst nur als NACHRANGIGES Kriterium: Android liefert oft gar keine
 *  sprechenden Namen, und „wide" steckt auch in „wide angle" der Hauptkamera. */
const UNGEEIGNET = /(ultra|depth|tof|monochrome|mono\b|telephoto|tele\b)/i

export function looksUnsuitable(c: CameraCandidate): boolean {
  return UNGEEIGNET.test(c.label ?? '')
}

/** Android-Chrome benennt Kameras als „camera2 <index>, facing back". Der niedrigste Index ist in
 *  aller Regel die Hauptkamera. Ohne erkennbaren Index -> Infinity (ans Ende sortieren). */
export function cameraIndex(c: CameraCandidate): number {
  const m = /camera2\s+(\d+)/i.exec(c.label ?? '')
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

/**
 * Die beste Ruecklinse fuer einen Nahscan.
 *
 * Reihenfolge der Kriterien, bewusst so und nicht anders:
 *  1. FOKUSFAEHIG zuerst. Das ist das einzige harte, plattformunabhaengige Signal - eine Fixfokus-
 *     Linse ist fuer einen Scan aus 10-20 cm unbrauchbar, egal wie gut sie sonst ist.
 *  2. Namentlich ungeeignete Linsen nach hinten (Ultraweitwinkel, Tele, Tiefensensor).
 *  3. Niedrigster camera2-Index - auf Android praktisch immer die Hauptkamera.
 *  4. Hoechste Aufloesung als letzter Stichentscheid.
 *
 * Gibt null zurueck, wenn es keine Kandidaten gibt - der Aufrufer faellt dann auf das bisherige
 * `facingMode: 'environment'` zurueck. Lieber das alte Verhalten als gar keine Kamera.
 */
export function rankRearCameras(candidates: readonly CameraCandidate[]): CameraCandidate[] {
  return [...candidates].sort((a, b) => {
    const focus = Number(canFocus(b)) - Number(canFocus(a))
    if (focus) return focus
    const suit = Number(looksUnsuitable(a)) - Number(looksUnsuitable(b))
    if (suit) return suit
    const idx = cameraIndex(a) - cameraIndex(b)
    if (idx) return idx
    return (b.maxWidth ?? 0) - (a.maxWidth ?? 0)
  })
}

export function pickRearCamera(candidates: readonly CameraCandidate[]): CameraCandidate | null {
  return rankRearCameras(candidates)[0] ?? null
}

/**
 * Die naechste Linse in der Rangfolge - der Notausgang, wenn die Heuristik danebenliegt.
 *
 * Nicht wegzudenken: die Auswahl oben ist eine begruendete Vermutung ueber fremde Hardware. Ohne
 * Umschalter waere eine falsche Vermutung fuer den Nutzer endgueltig, und wir wuessten nie, welche
 * Linse tatsaechlich funktioniert haette. Zyklisch, damit man wieder beim Ausgangspunkt landet.
 */
export function nextCamera(
  candidates: readonly CameraCandidate[],
  currentId: string | undefined,
): CameraCandidate | null {
  const ranked = rankRearCameras(candidates)
  if (!ranked.length) return null
  const i = ranked.findIndex((c) => c.deviceId === currentId)
  return ranked[(i + 1) % ranked.length] // i === -1 (unbekannt) -> Index 0, also die beste
}

/**
 * Warum wurde so entschieden - fuer die Diagnose-Zeile im Scanner.
 * Ohne diese Rueckmeldung ist am fremden Geraet nicht feststellbar, WELCHE Linse laeuft; der Nutzer
 * sieht nur ein unscharfes Bild und wir raten.
 */
export function describeChoice(chosen: CameraCandidate | null, all: readonly CameraCandidate[]): string {
  if (!chosen) return 'keine Kamera gefunden'
  const fokus = canFocus(chosen) ? 'fokussierbar' : 'FIXFOKUS'
  const name = (chosen.label ?? '').trim() || chosen.deviceId.slice(0, 8)
  return `${name} · ${fokus} · ${all.length} Kamera(s) erkannt`
}

/** Gibt es ueberhaupt eine fokussierbare Linse? Ist das nein, hilft auch Tap-to-Refocus nicht und der
 *  Nutzer braucht einen ehrlichen Hinweis statt eines wirkungslosen Tipps. */
export function hasAnyFocusableCamera(candidates: readonly CameraCandidate[]): boolean {
  return candidates.some(canFocus)
}

/** Was die Kamera nach dem Start TATSAECHLICH liefert (aus track.getSettings()). */
export interface ActualSettings {
  width?: number
  height?: number
  deviceId?: string
}

/**
 * Der Abgleich zwischen dem, was wir angefordert haben, und dem, was ankam.
 *
 * Warum das eine eigene Ausgabe verdient: bisher hat niemand geprueft, was die Kamera liefert -
 * getSettings() kam im ganzen App-Quelltext nicht vor. Damit konnten zwei Fehlerbilder unbemerkt
 * bleiben, die beide zu „scannt nicht" fuehren und beide NICHTS mit der Linsenwahl zu tun haben:
 *
 *  - Eine zu kleine Aufloesung. Ohne Vorgabe liefert eine WebView ihren Default. Ein dichtes
 *    Data-Matrix-Symbol hat dann so wenige Pixel pro Modul, dass kein Decoder es lesen kann - egal
 *    wie scharf das Bild ist. Ein stark heruntergerechnetes Bild sieht ausserdem unscharf aus, was
 *    die Fehlersuche zuverlaessig in die falsche Richtung schickt.
 *  - Eine ignorierte deviceId. Wir fordern sie bewusst als `ideal` an; der Browser DARF sie
 *    uebergehen. Tut er das, ist die gesamte Linsenwahl wirkungslos, ohne dass es auffaellt.
 *
 * Beides steht jetzt in der Diagnosezeile, damit ein einziger Screenshot vom Geraet die Frage
 * beantwortet, statt sie zu vertagen.
 */
export function describeActual(actual: ActualSettings, requestedId: string | undefined): string {
  const teile: string[] = []
  teile.push(actual.width && actual.height ? `liefert ${actual.width}x${actual.height}` : 'Aufloesung unbekannt')
  if (requestedId && actual.deviceId && actual.deviceId !== requestedId) {
    teile.push('ANDERE LINSE als angefordert')
  }
  return teile.join(' · ')
}
