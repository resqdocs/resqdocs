import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickRearCamera, rankRearCameras, nextCamera, lensChoiceApplies, describeActual, canFocus, looksUnsuitable, cameraIndex, hasAnyFocusableCamera, describeChoice, type CameraCandidate } from './cameraChoice.ts'
import { videoConstraints, androidVideoConstraints } from './cameraProbe.ts'

const cam = (over: Partial<CameraCandidate>): CameraCandidate => ({ deviceId: 'id', ...over })

test('canFocus: nur mit echtem Fokus-Modus', () => {
  assert.equal(canFocus(cam({ focusModes: ['continuous'] })), true)
  assert.equal(canFocus(cam({ focusModes: ['single-shot'] })), true)
  assert.equal(canFocus(cam({ focusModes: ['auto'] })), true)
  assert.equal(canFocus(cam({ focusModes: [] })), false, 'leere Liste = Fixfokus')
  assert.equal(canFocus(cam({})), false, 'gar keine Angabe = Fixfokus annehmen')
  assert.equal(canFocus(cam({ focusModes: ['manual'] })), false, 'manuell zaehlt nicht als Autofokus')
})

test('DER GEMELDETE FALL: Ultraweitwinkel ohne Fokus verliert gegen die Hauptkamera', () => {
  // Das gemeldete Bild: die WebView greift zur Ultraweitwinkel-Linse, die nicht scharfstellen kann,
  // und nichts laesst sich scannen.
  const kameras = [
    cam({ deviceId: 'ultra', label: 'camera2 2, facing back', focusModes: [], maxWidth: 4000 }),
    cam({ deviceId: 'haupt', label: 'camera2 0, facing back', focusModes: ['continuous', 'single-shot'], maxWidth: 4000 }),
  ]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'haupt')
})

test('Fokusfaehigkeit schlaegt Aufloesung - eine scharfe kleine ist besser als eine unscharfe grosse', () => {
  const kameras = [
    cam({ deviceId: 'gross', focusModes: [], maxWidth: 8000 }),
    cam({ deviceId: 'klein', focusModes: ['continuous'], maxWidth: 1280 }),
  ]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'klein')
})

test('unter fokusfaehigen Linsen gewinnt die namentlich geeignete', () => {
  const kameras = [
    cam({ deviceId: 'tele', label: 'Telephoto Camera', focusModes: ['continuous'] }),
    cam({ deviceId: 'haupt', label: 'Back Camera', focusModes: ['continuous'] }),
  ]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'haupt')
})

test('bei Gleichstand entscheidet der camera2-Index (auf Android die Hauptkamera)', () => {
  const kameras = [
    cam({ deviceId: 'b', label: 'camera2 3, facing back', focusModes: ['continuous'] }),
    cam({ deviceId: 'a', label: 'camera2 0, facing back', focusModes: ['continuous'] }),
  ]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'a')
})

test('zuletzt entscheidet die Aufloesung', () => {
  const kameras = [
    cam({ deviceId: 'klein', focusModes: ['continuous'], maxWidth: 1280 }),
    cam({ deviceId: 'gross', focusModes: ['continuous'], maxWidth: 3840 }),
  ]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'gross')
})

test('keine Kandidaten -> null, damit der Aufrufer auf das bisherige Verhalten zurueckfaellt', () => {
  assert.equal(pickRearCamera([]), null)
})

test('nur Fixfokus vorhanden -> es wird trotzdem eine gewaehlt (besser als gar keine Kamera)', () => {
  const kameras = [cam({ deviceId: 'nur-die', focusModes: [] })]
  assert.equal(pickRearCamera(kameras)?.deviceId, 'nur-die')
  assert.equal(hasAnyFocusableCamera(kameras), false, 'aber der Nutzer bekommt einen ehrlichen Hinweis')
})

test('Namens-Heuristik erkennt untaugliche Linsen, ohne bei fehlendem Namen zu raten', () => {
  assert.equal(looksUnsuitable(cam({ label: 'Ultra Wide Camera' })), true)
  assert.equal(looksUnsuitable(cam({ label: 'Depth Camera' })), true)
  assert.equal(looksUnsuitable(cam({ label: 'Telephoto' })), true)
  assert.equal(looksUnsuitable(cam({ label: 'Back Camera' })), false)
  assert.equal(looksUnsuitable(cam({})), false, 'ohne Namen wird nichts unterstellt')
})

test('cameraIndex liest den Android-Namen, sonst ans Ende', () => {
  assert.equal(cameraIndex(cam({ label: 'camera2 0, facing back' })), 0)
  assert.equal(cameraIndex(cam({ label: 'camera2 12, facing back' })), 12)
  assert.equal(cameraIndex(cam({ label: 'Back Camera' })), Number.POSITIVE_INFINITY)
})

test('describeChoice benennt die Linse und ob sie fokussieren kann', () => {
  const alle = [cam({ deviceId: 'a', focusModes: [] }), cam({ deviceId: 'b', label: 'Back Camera', focusModes: ['continuous'] })]
  assert.match(describeChoice(alle[1], alle), /Back Camera/)
  assert.match(describeChoice(alle[1], alle), /fokussierbar/)
  assert.match(describeChoice(alle[0], alle), /FIXFOKUS/, 'der Problemfall muss im Text auffallen')
  assert.match(describeChoice(null, []), /keine Kamera/)
})

// --- Constraints-Bau (reine Funktion aus cameraProbe) ---------------------------------------------

test('videoConstraints: mit gemerkter Linse ideal statt exact', () => {
  const c = videoConstraints('abc', false) as { deviceId?: { ideal?: string }; facingMode?: string }
  assert.equal(c.deviceId?.ideal, 'abc', 'ideal, damit ein fehlendes Geraet den Start nicht abbricht')
  assert.equal(c.facingMode, 'environment', 'facingMode bleibt als Rueckfallebene stehen')
})

test('videoConstraints: ohne gemerkte Linse exakt das bisherige Verhalten', () => {
  assert.deepEqual(videoConstraints(undefined, false), { facingMode: 'environment' })
})

test('videoConstraints: hohe Aufloesung nur im optimierten Modus', () => {
  const hi = videoConstraints(undefined, true) as { width?: { ideal?: number } }
  assert.equal(hi.width?.ideal, 1920)
  assert.equal((videoConstraints(undefined, false) as { width?: unknown }).width, undefined)
})

// --- Umschalten (Notausgang, wenn die Heuristik danebenliegt) --------------------------------------

test('nextCamera zykliert in der Rangfolge und kommt zum Ausgangspunkt zurueck', () => {
  const kameras = [
    cam({ deviceId: 'ultra', label: 'camera2 2, facing back', focusModes: [] }),
    cam({ deviceId: 'haupt', label: 'camera2 0, facing back', focusModes: ['continuous'] }),
    cam({ deviceId: 'tele', label: 'camera2 1, facing back', focusModes: ['continuous'] }),
  ]
  const rang = rankRearCameras(kameras).map((c) => c.deviceId)
  assert.deepEqual(rang, ['haupt', 'tele', 'ultra'], 'fokussierbar zuerst, dann camera2-Index')

  assert.equal(nextCamera(kameras, 'haupt')?.deviceId, 'tele')
  assert.equal(nextCamera(kameras, 'tele')?.deviceId, 'ultra')
  assert.equal(nextCamera(kameras, 'ultra')?.deviceId, 'haupt', 'zyklisch - man kommt nie in eine Sackgasse')
})

test('nextCamera ohne bekannte aktuelle Linse liefert die beste', () => {
  const kameras = [cam({ deviceId: 'a', focusModes: [] }), cam({ deviceId: 'b', focusModes: ['continuous'] })]
  assert.equal(nextCamera(kameras, undefined)?.deviceId, 'b')
  assert.equal(nextCamera(kameras, 'nicht-vorhanden')?.deviceId, 'b')
})

test('nextCamera bei nur einer Linse liefert genau diese (der Aufrufer blendet den Knopf dann aus)', () => {
  const kameras = [cam({ deviceId: 'einzig', focusModes: ['continuous'] })]
  assert.equal(nextCamera(kameras, 'einzig')?.deviceId, 'einzig')
  assert.equal(nextCamera([], 'x'), null)
})

test('rankRearCameras laesst die Eingabe unangetastet', () => {
  const kameras = [cam({ deviceId: 'a', focusModes: [] }), cam({ deviceId: 'b', focusModes: ['continuous'] })]
  rankRearCameras(kameras)
  assert.deepEqual(kameras.map((c) => c.deviceId), ['a', 'b'])
})

// --- iOS bleibt unangetastet ----------------------------------------------------------------------

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 16; SM-S931B) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'

test('die Linsenwahl gilt NUR auf Android', () => {
  assert.equal(lensChoiceApplies('android'), true, 'die gebaute Android-App')
  assert.equal(lensChoiceApplies('ios'), false, 'auf iOS laeuft der Scan gut und darf nicht angefasst werden')
  assert.equal(lensChoiceApplies('ios', UA_ANDROID), false, 'iOS bleibt aussen vor, auch bei geschummeltem User-Agent')
  assert.equal(lensChoiceApplies('web', UA_DESKTOP), false, 'Desktop-Chrome hat das Problem nicht')
  assert.equal(lensChoiceApplies('web', UA_IPHONE), false)
  assert.equal(lensChoiceApplies('', ''), false, 'nichts bekannt -> altes Verhalten, nie experimentieren')
})

test('im mobilen Chrome auf Android greift sie ebenfalls', () => {
  // Das Problem sitzt in Chromium AUF Android, nicht in der Capacitor-Verpackung. Praktisch wichtig:
  // so laesst sich die Diagnosezeile auf einem fremden Geraet ohne Android-Studio-Build ablesen.
  assert.equal(lensChoiceApplies('web', UA_ANDROID), true)
})

test('iOS bekaeme sonst die Falschaussage „kann nicht scharfstellen"', () => {
  // WebKit meldet gar keinen focusMode. Ohne die Plattform-Sperre waere jede iOS-Linse „FIXFOKUS" -
  // auf einem Geraet, das einwandfrei fokussiert. Dieser Test haelt fest, WARUM die Sperre noetig ist.
  const wieIosSieAusgibt = [cam({ deviceId: 'a', label: 'Back Camera' }), cam({ deviceId: 'b', label: 'Back Dual Wide Camera' })]
  assert.equal(hasAnyFocusableCamera(wieIosSieAusgibt), false)
  assert.match(describeChoice(pickRearCamera(wieIosSieAusgibt), wieIosSieAusgibt), /FIXFOKUS/)
})

test('auf gesperrten Plattformen sind die Constraints identisch mit dem Stand vor der Aenderung', () => {
  // Das ist die eigentliche Zusage an iOS: exakt dieselben zwei Objekte wie bisher im Code standen.
  assert.deepEqual(videoConstraints(undefined, false), { facingMode: 'environment' })
  assert.deepEqual(videoConstraints(undefined, true), {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  })
})

// --- Mindestaufloesung auf Android ---------------------------------------------------------------

test('DER ZWEITE BEFUND: der Standardmodus forderte gar keine Aufloesung an', () => {
  // webview_standard ist der ausgelieferte Default (storage/types.ts). hiRes ist dort false, und
  // videoConstraints setzt width/height nur bei hiRes -> die WebView liefert ihren eigenen Default.
  // Bei einem dichten Data-Matrix reichen die Pixel pro Modul dann nicht zum Dekodieren, ganz gleich
  // welche Linse laeuft. Auf Android bekommt deshalb JEDER Modus eine Vorgabe.
  const std = androidVideoConstraints(undefined, false) as { width?: { ideal?: number } }
  const opt = androidVideoConstraints(undefined, true) as { width?: { ideal?: number } }
  assert.equal(std.width?.ideal, 1920, 'Standardmodus: Vorgabe statt WebView-Default')
  assert.equal(opt.width?.ideal, 2560, 'optimierter Modus: mehr Reserve')
  assert.ok((opt.width?.ideal ?? 0) > (std.width?.ideal ?? 0), 'die beiden Modi bleiben unterscheidbar')
})

test('die Aufloesung reicht fuer ein 96x96-Symbol - daran ist sie bemessen', () => {
  // Ein analysierter Bundeseinheitlicher Medikationsplan trug ein Symbol von 96x96 Modulen; mit
  // Ruhezone rund 98 Module ueber die Breite. Der Wert im Code ist keine gefuehlte Zahl, sondern
  // faellt aus dieser Rechnung - dieser Test haelt die Herleitung fest, damit niemand die
  // Aufloesung spaeter "aus Performancegruenden" senkt, ohne den Preis zu kennen.
  const MODULE_MIT_RUHEZONE = 98
  const KLEINSTE_BRAUCHBARE_PX_PRO_MODUL = 5
  const CONTAINER_B = 390 // CSS-Pixel, uebliches Handy im Hochformat
  const CONTAINER_H = 724

  // Entscheidend ist NICHT die kurze Videokante. Das Videobild ist im Querformat, der Container im
  // Hochformat, und `object-cover` skaliert so, dass die Hoehe passt - die Breite wird dabei
  // BESCHNITTEN. Sichtbar ist also nur ein Ausschnitt, und dessen Breite in Videopixeln begrenzt,
  // wie viele Pixel je Modul ankommen. Genau diese Kuerzung macht 720p unbrauchbar.
  const sichtbareBreiteInVideoPx = (w: number, h: number) =>
    CONTAINER_B / Math.max(CONTAINER_B / w, CONTAINER_H / h)

  const pxProModul = (w: number, h: number, anteilDenDerCodeFuellt = 0.85) =>
    (sichtbareBreiteInVideoPx(w, h) * anteilDenDerCodeFuellt) / MODULE_MIT_RUHEZONE

  for (const hiRes of [false, true]) {
    const c = androidVideoConstraints(undefined, hiRes) as { width?: { ideal?: number }; height?: { ideal?: number } }
    const px = pxProModul(c.width?.ideal ?? 0, c.height?.ideal ?? 0)
    assert.ok(px >= KLEINSTE_BRAUCHBARE_PX_PRO_MODUL, `hiRes=${hiRes}: ${px.toFixed(1)} px/Modul zu wenig`)
  }

  // Gegenprobe: die frueheren Werte haetten die Schwelle gerissen - deshalb wurde sie angehoben.
  assert.ok(pxProModul(640, 480) < KLEINSTE_BRAUCHBARE_PX_PRO_MODUL, 'WebView-Default war aussichtslos')
  assert.ok(pxProModul(1280, 720) < KLEINSTE_BRAUCHBARE_PX_PRO_MODUL, 'auch 720p war fuer 96x96 zu knapp')
})

test('die Mindestaufloesung gilt NUR auf Android - videoConstraints bleibt die Zusage an iOS', () => {
  // Diese beiden Zeilen sind der Grund, warum die Untergrenze in einer eigenen Funktion liegt:
  // videoConstraints ist das, was iOS und Web bekommen, und es darf sich nicht mitveraendern.
  assert.deepEqual(videoConstraints(undefined, false), { facingMode: 'environment' })
  assert.notDeepEqual(androidVideoConstraints(undefined, false), videoConstraints(undefined, false))
})

test('die gemerkte Linse ueberlebt die Mindestaufloesung', () => {
  const c = androidVideoConstraints('linse-7', false) as { deviceId?: { ideal?: string }; height?: { ideal?: number } }
  assert.equal(c.deviceId?.ideal, 'linse-7')
  assert.equal(c.height?.ideal, 1080)
})

// --- Ist-Zustand: was ist tatsaechlich angekommen? ------------------------------------------------

test('describeActual nennt die gelieferte Aufloesung', () => {
  assert.equal(describeActual({ width: 640, height: 480 }, undefined), 'liefert 640x480')
  assert.equal(describeActual({}, undefined), 'Aufloesung unbekannt', 'lieber ehrlich als eine erfundene Zahl')
})

test('describeActual deckt eine ignorierte deviceId auf', () => {
  // Wir fordern die Linse als `ideal` an - der Browser DARF sie uebergehen. Tut er das, ist die
  // ganze Auswahl wirkungslos, und ohne diesen Abgleich saehe das aus wie ein Erfolg.
  assert.match(describeActual({ width: 1280, height: 720, deviceId: 'andere' }, 'gewuenschte'), /ANDERE LINSE/)
  assert.doesNotMatch(describeActual({ width: 1280, height: 720, deviceId: 'gleiche' }, 'gleiche'), /ANDERE LINSE/)
  assert.doesNotMatch(
    describeActual({ width: 1280, height: 720 }, 'gewuenschte'),
    /ANDERE LINSE/,
    'ohne gemeldete deviceId wird nichts unterstellt',
  )
})
