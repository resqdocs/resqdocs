// Kandidaten einsammeln: welche Ruecklinsen gibt es, und welche kann fokussieren?
//
// Gehoert bewusst NICHT zu cameraChoice.ts - dort steht die reine Entscheidungslogik (node-testbar),
// hier die Browser-Anbindung, die sich ohne Geraet nicht pruefen laesst.
//
// Ablauf, und warum er so umstaendlich ist:
// getCapabilities() liefert focusMode erst, wenn die Kamera OFFEN ist. Und enumerateDevices() gibt
// die Geraetenamen erst preis, nachdem einmal eine Freigabe erteilt wurde. Wir muessen also jede
// Kandidatenlinse kurz oeffnen, ihre Faehigkeiten lesen und sofort wieder schliessen.
//
// Das kostet beim ERSTEN Scan einen Moment. Deshalb wird die Entscheidung gemerkt (siehe
// rememberCamera/recallCamera) und beim naechsten Mal direkt genutzt.

import { pickRearCamera, describeChoice, hasAnyFocusableCamera, type CameraCandidate } from './cameraChoice.ts'

export const CAMERA_CHOICE_KEY = 'scanner.rearCameraId'

export interface ProbeResult {
  /** Die gewaehlte Linse - oder null, wenn nichts ermittelbar war (Aufrufer nimmt dann facingMode). */
  chosen: CameraCandidate | null
  /** Alle gefundenen Ruecklinsen, fuer die Diagnosezeile. */
  all: CameraCandidate[]
  /** Nutzerlesbare Zusammenfassung fuer die Diagnosezeile im Scanner. */
  summary: string
  /** Konnte ueberhaupt eine Linse fokussieren? Wenn nein, ist Tap-to-Refocus wirkungslos. */
  anyFocusable: boolean
}

/** Faehigkeiten EINER Linse ermitteln: kurz oeffnen, auslesen, sofort schliessen. */
async function probeOne(deviceId: string, label: string): Promise<CameraCandidate> {
  let stream: MediaStream | undefined
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId } } })
    const track = stream.getVideoTracks()[0]
    const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[]; width?: { max?: number } }
    return { deviceId, label, focusModes: caps.focusMode ?? [], maxWidth: caps.width?.max }
  } catch {
    // Linse nicht oeffenbar (belegt, gesperrt, virtuell) - als nicht fokussierbar behandeln, nicht werfen.
    return { deviceId, label, focusModes: [] }
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
  }
}

/**
 * Alle rueckwaertigen Linsen durchprobieren und die beste auswaehlen.
 *
 * Fehlertoleranz ist hier wichtiger als Vollstaendigkeit: schlaegt irgendetwas fehl, liefern wir
 * `chosen: null` und der Aufrufer nutzt weiterhin `facingMode: 'environment'`. Ein misslungener
 * Probelauf darf NIE dazu fuehren, dass der Scanner gar nicht startet.
 */
let cached: ProbeResult | null = null

export async function probeRearCameras(): Promise<ProbeResult> {
  // Innerhalb eines App-Laufs genuegt EIN Durchlauf: die Linsen eines Geraets aendern sich nicht, und
  // jeder weitere Durchlauf kostet vor jedem Scan spuerbar Zeit (jede Linse wird kurz geoeffnet).
  if (cached) return cached
  const leer: ProbeResult = { chosen: null, all: [], summary: 'Kameraauswahl nicht verfuegbar', anyFocusable: true }
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return leer

    // Erst eine Freigabe holen, sonst sind die Geraetenamen leer und wir koennen Linsen nicht
    // unterscheiden. Der Stream wird sofort wieder geschlossen.
    let warmup: MediaStream | undefined
    try {
      warmup = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } })
    } catch {
      return leer // keine Freigabe -> der Aufrufer laeuft in seinen eigenen Fehlerpfad
    } finally {
      warmup?.getTracks().forEach((t) => t.stop())
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const rueck = devices.filter(
      (d) => d.kind === 'videoinput' && !/front|user|selfie|face/i.test(d.label),
    )
    if (!rueck.length) return leer

    const all: CameraCandidate[] = []
    for (const d of rueck) all.push(await probeOne(d.deviceId, d.label))

    const chosen = pickRearCamera(all)
    cached = { chosen, all, summary: describeChoice(chosen, all), anyFocusable: hasAnyFocusableCamera(all) }
    return cached
  } catch {
    return leer // bewusst NICHT cachen: ein einmaliger Fehlschlag soll den naechsten Versuch nicht blockieren
  }
}

/** Die getroffene Wahl merken, damit der naechste Scan nicht wieder alle Linsen durchprobiert. */
export async function rememberCamera(
  set: (k: string, v: string) => Promise<void>,
  deviceId: string | undefined,
): Promise<void> {
  if (!deviceId) return
  try {
    await set(CAMERA_CHOICE_KEY, deviceId)
  } catch {
    /* nicht merkbar -> beim naechsten Mal eben erneut probieren, unkritisch */
  }
}

/**
 * Video-Constraints fuer den Scanner bauen.
 * Bewusst `ideal` statt `exact` bei der deviceId: waehlt der Nutzer das Geraet oder ist die gemerkte
 * Linse verschwunden (anderes Handy, Kamera belegt), faellt der Browser selbst auf eine andere zurueck,
 * statt den Start mit OverconstrainedError abzubrechen.
 */
export function videoConstraints(deviceId: string | undefined, hiRes: boolean): MediaTrackConstraints {
  const res = hiRes ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : {}
  return deviceId
    ? { deviceId: { ideal: deviceId }, facingMode: 'environment', ...res }
    : { facingMode: 'environment', ...res }
}

/**
 * Aufloesung auf Android - bemessen an der GROESSE des Symbols, nicht am Gefuehl.
 *
 * Ausgangspunkt: der Standardmodus forderte gar keine Aufloesung an (hiRes=false -> leeres res-Objekt),
 * und `webview_standard` ist der ausgelieferte Default. Chromium liefert dann seinen eigenen, kleinen
 * Default.
 *
 * Wie klein das ist, zeigt die Rechnung an einem echten Bundeseinheitlichen Medikationsplan. Eine
 * Analyse eines gedruckten BMP ergab ein Symbol von 96x96 Modulen (ECC200, 4x4 Regionen a 24x24) -
 * ein sehr grosses Symbol. Mit Ruhezone sind das rund 98 Module ueber die Breite. Im Hochformat
 * bildet `object-cover` die Video-Hoehe auf die Container-Hoehe ab; bei einem Container von etwa
 * 390x724 CSS-Pixeln und einem formatfuellend gehaltenen Code ergibt das:
 *
 *    640x480   ->  ca. 2,2 px/Modul   aussichtslos
 *   1280x720   ->  ca. 3,4 px/Modul   zu knapp
 *   1920x1080  ->  ca. 5,1 px/Modul   brauchbar
 *   2560x1440  ->  ca. 6,7 px/Modul   komfortabel
 *
 * Zu beachten: begrenzend ist nicht die kurze Videokante, sondern die BESCHNITTENE Breite. Das Bild
 * ist im Querformat, der Container im Hochformat; `object-cover` skaliert auf die Hoehe und schneidet
 * seitlich ab. Genau diese Kuerzung macht 720p unbrauchbar. Die Rechnung steht als Test in
 * cameraChoice.test.ts, damit sie nachvollziehbar bleibt.
 *
 * Deshalb bekommt auch der Standardmodus 1920x1080 - 1280x720 waere fuer ein 96x96-Symbol zu knapp
 * gewesen. Der optimierte Modus geht auf 2560x1440 und behaelt damit seinen Zweck.
 *
 * `ideal` und nicht `exact`: eine Kamera ohne diese Aufloesung muss trotzdem starten.
 *
 * Wichtige Einschraenkung, damit die Zahlen nicht ueberschaetzt werden: Aufloesung ist eine
 * NOTWENDIGE, keine hinreichende Bedingung. Dieselbe Analyse scheiterte bei 15-17 px/Modul immer noch
 * an verschmiertem Nadel-/Thermodruck und Papierwoelbung. Ein schlecht gedruckter Plan wird durch
 * keine Kameraeinstellung lesbar.
 */
const ANDROID_RES_STANDARD = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const ANDROID_RES_HIGH = { width: { ideal: 2560 }, height: { ideal: 1440 } }

/**
 * Constraints fuer Android. Bewusst getrennt von videoConstraints: dessen Ausgabe ist die Zusage an
 * iOS und Web („exakt wie vor der Aenderung") und per Test festgenagelt. Die Mindestaufloesung darf
 * diese Zusage nicht aufweichen, deshalb liegt sie hier und nicht dort.
 */
export function androidVideoConstraints(deviceId: string | undefined, hiRes: boolean): MediaTrackConstraints {
  const basis = videoConstraints(deviceId, hiRes)
  return { ...basis, ...(hiRes ? ANDROID_RES_HIGH : ANDROID_RES_STANDARD) }
}
