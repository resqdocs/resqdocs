// Gemeinsame Kamera-Auswahl fuer ALLE drei Scanner (QR, Medikamentenplan, Packung).
//
// Anlass: auf manchen Android-Geraeten stellt die Kamera beim Scannen nie scharf - weder beim
// Medikamentenplan noch beim Empfangen von Bausteinen. Dass ALLE drei Scanner betroffen sind, ist der
// Hinweis: es liegt nicht am jeweiligen Decoder, sondern an der gemeinsamen Anforderung
// `{ facingMode: 'environment' }`. Die WebView darf sich damit irgendeine Ruecklinse aussuchen, und auf
// Mehrlinsen-Geraeten ist das oft die Ultraweitwinkel-Linse mit FIXFOKUS - die kann auf Scanabstand
// prinzipbedingt nicht scharfstellen.
//
// Deshalb liegt die Auswahl jetzt an EINER Stelle, statt sie dreimal zu wiederholen.
//
// Zwei bewusste Entscheidungen:
//  - Die gewaehlte Linse wird gemerkt, damit nur der allererste Scan den Probelauf bezahlt.
//  - Es gibt einen Umschalter (switchCamera). Die Auswahl ist eine begruendete Vermutung ueber fremde
//    Hardware; ohne Notausgang waere eine falsche Vermutung fuer den Nutzer endgueltig.

import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { nextCamera, describeChoice, describeActual, lensChoiceApplies, type CameraCandidate } from './cameraChoice.ts'
import { probeRearCameras, videoConstraints, androidVideoConstraints, CAMERA_CHOICE_KEY } from './cameraProbe.ts'

export function useRearCamera() {
  /** Kurztext fuer die Diagnosezeile: welche Linse laeuft, kann sie fokussieren, wie viele gibt es. */
  const diagnose = ref<string | null>(null)
  /** Keine einzige fokussierbare Linse gefunden -> Tap-to-Refocus ist wirkungslos, ehrlich sagen. */
  const keinFokus = ref(false)
  /** Erst ab zwei Linsen ist Umschalten sinnvoll; sonst waere der Knopf eine Luege. */
  const umschaltbar = ref(false)

  let alle: CameraCandidate[] = []
  let aktuelleId: string | undefined
  /** Der Teil der Diagnosezeile, der aus der Auswahl stammt - der Ist-Zustand kommt spaeter dazu. */
  let grundtext: string | null = null

  async function gemerkteLinse(): Promise<string | undefined> {
    try {
      return (await preferencesAdapter.get(CAMERA_CHOICE_KEY)) ?? undefined
    } catch {
      return undefined
    }
  }

  async function merke(id: string | undefined): Promise<void> {
    if (!id) return
    try {
      await preferencesAdapter.set(CAMERA_CHOICE_KEY, id)
    } catch {
      /* nicht merkbar -> beim naechsten Start eben erneut ermitteln, unkritisch */
    }
  }

  /**
   * Die Constraints fuer den Scanner-Start. Wird VOR dem Kamerastart aufgerufen.
   * Faellt bei jedem Fehlschlag auf das bisherige Verhalten zurueck - der Scanner muss starten.
   */
  async function constraintsFor(hiRes: boolean): Promise<MediaTrackConstraints> {
    // Nur Android. Auf iOS/Web bleibt es Zeichen fuer Zeichen beim bisherigen Verhalten - kein
    // Probelauf, keine Diagnosezeile, kein Umschalter (siehe lensChoiceApplies).
    if (!lensChoiceApplies(Capacitor.getPlatform(), navigator.userAgent)) return videoConstraints(undefined, hiRes)

    const probe = await probeRearCameras()
    alle = probe.all
    umschaltbar.value = alle.length > 1
    keinFokus.value = alle.length > 0 && !probe.anyFocusable

    // Eine frueher bewusst umgeschaltete Linse schlaegt die Heuristik - der Nutzer weiss es besser.
    const gemerkt = await gemerkteLinse()
    const treffer = gemerkt ? alle.find((c) => c.deviceId === gemerkt) : undefined
    const gewaehlt = treffer ?? probe.chosen

    aktuelleId = gewaehlt?.deviceId
    grundtext = alle.length ? describeChoice(gewaehlt, alle) : null
    diagnose.value = grundtext
    return androidVideoConstraints(aktuelleId, hiRes)
  }

  /**
   * Auf die naechste Linse umschalten und sie merken. Gibt die neuen Constraints zurueck; der Aufrufer
   * startet den Scanner damit neu (ein laufender getUserMedia-Stream laesst sich nicht auf ein anderes
   * Geraet umkonfigurieren - applyConstraints wechselt die Kamera nicht).
   */
  async function switchCamera(hiRes: boolean): Promise<MediaTrackConstraints | null> {
    const naechste = nextCamera(alle, aktuelleId)
    if (!naechste || naechste.deviceId === aktuelleId) return null
    aktuelleId = naechste.deviceId
    grundtext = describeChoice(naechste, alle)
    diagnose.value = grundtext
    await merke(aktuelleId)
    return androidVideoConstraints(aktuelleId, hiRes)
  }

  /**
   * Nach dem Kamerastart aufrufen: was ist tatsaechlich angekommen?
   *
   * Bis hierher ist alles nur eine ANFRAGE - die Aufloesung als `ideal`, die deviceId als `ideal`.
   * Der Browser darf beides uebergehen. Erst getSettings() sagt, was wirklich laeuft, und genau das
   * hat bisher niemand geprueft. Ohne diesen Abgleich sieht eine wirkungslose Anfrage exakt so aus
   * wie eine erfolgreiche.
   */
  function noteActualTrack(track: MediaStreamTrack | null): void {
    if (!grundtext || !track?.getSettings) return
    try {
      const s = track.getSettings() as { width?: number; height?: number; deviceId?: string }
      diagnose.value = `${grundtext} · ${describeActual(s, aktuelleId)}`
    } catch {
      /* getSettings nicht verfuegbar -> es bleibt beim Grundtext, kein Grund den Scan zu stoeren */
    }
  }

  return { diagnose, keinFokus, umschaltbar, constraintsFor, switchCamera, noteActualTrack }
}
