// fast4dDefs.mjs — die EINE Quelle fuer die Definitionen der Funktion „FAST4D".
//
// Vorher standen Schluessel, Werte, Uhrzeit-Pruefung und die Zuordnung Zeile -> Rechenkern an vier Stellen
// (Rechenkern scores.mjs, Registry, Entwurf caseDraft.ts, Eingabeblatt Fast4dSheet.vue). Wer ein Zeichen
// ergaenzte oder umbenannte und eine Stelle vergass, liess das Feld still aus dem Entwurf fallen. Jetzt
// importieren alle diese Stellen von hier. Plain JS (wie scores.mjs), damit der Rechenkern ohne
// TypeScript-Werkzeug laeuft; Typen in fast4dDefs.d.mts.
//
// Fachliche Grundlage unveraendert: Claudi et al., J Clin Med 2024;13(17):5033 (siehe scores.mjs).

/** Befund eines Zeichens: unauffaellig / auffaellig / nicht pruefbar. */
export const FAST4D_BEFUNDE = Object.freeze(['neg', 'pos', 'na'])
/** Seite eines auffaelligen Befunds (nur Face und Arm). */
export const FAST4D_SEITEN = Object.freeze(['re', 'li'])
/** Art der Zeitangabe: Symptombeginn / zuletzt gesund gesehen / unklar. */
export const FAST4D_ZEITARTEN = Object.freeze(['onset', 'lsw', 'unknown'])
/** Uhrzeit: ausschliesslich HH:MM (00:00-23:59), kein Freitext. */
export const FAST4D_UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Die sieben Zeichen in fester Reihenfolge (so erscheinen sie im Protokolltext):
 *   id      Schluessel im Rechenkern (scores.fast4d)
 *   rowKey  Feld der gespeicherten Zeile (FAST4DRow) und des Entwurfs
 *   sideKey Feld der Seite, nur bei Face und Arm
 *   text    Name im Protokolltext
 */
export const FAST4D_ZEICHEN = Object.freeze([
  Object.freeze({ id: 'face', rowKey: 'fastFace', sideKey: 'fastFaceSide', text: 'Fazialisparese' }),
  Object.freeze({ id: 'arm', rowKey: 'fastArm', sideKey: 'fastArmSide', text: 'Armabsinken' }),
  Object.freeze({ id: 'speech', rowKey: 'fastSpeech', text: 'Sprachstörung' }),
  Object.freeze({ id: 'diplopia', rowKey: 'fastDiplopia', text: 'Doppelbilder' }),
  Object.freeze({ id: 'field', rowKey: 'fastField', text: 'Gesichtsfelddefekt' }),
  Object.freeze({ id: 'vertigo', rowKey: 'fastVertigo', text: 'Dreh-/Schwankschwindel' }),
  Object.freeze({ id: 'ataxia', rowKey: 'fastAtaxia', text: 'Dysmetrie/Ataxie' }),
])

/** Felder der Zeitangabe in der gespeicherten Zeile. */
export const FAST4D_ZEIT_KEYS = Object.freeze({ mode: 'fastTimeMode', time: 'fastTime' })

/** Sind alle sieben Befunde gewaehlt? Seite und Zeit sind freiwillig. scores.fast4d wirft sonst - darum
 *  VOR dem Aufruf pruefen. */
export function fast4dComplete(row) {
  return !!row && FAST4D_ZEICHEN.every((z) => FAST4D_BEFUNDE.includes(row[z.rowKey]))
}

/** Gespeicherte Zeile (fast…-Felder) -> Eingabe des Rechenkerns (face, arm, …, faceSide, time …). */
export function fast4dInput(row) {
  const input = {}
  for (const z of FAST4D_ZEICHEN) {
    input[z.id] = row[z.rowKey]
    if (z.sideKey) input[`${z.id}Side`] = row[z.sideKey]
  }
  input.timeMode = row[FAST4D_ZEIT_KEYS.mode]
  input.time = row[FAST4D_ZEIT_KEYS.time]
  return input
}

/** Erlaubte Werte je Feld der Zeile, fuer die Allowlist des Entwurfs (caseDraft.ts). Die Uhrzeit prueft
 *  FAST4D_UHRZEIT gesondert. */
export function fast4dEnumFields() {
  const out = {}
  for (const z of FAST4D_ZEICHEN) out[z.rowKey] = FAST4D_BEFUNDE
  for (const z of FAST4D_ZEICHEN) if (z.sideKey) out[z.sideKey] = FAST4D_SEITEN
  out[FAST4D_ZEIT_KEYS.mode] = FAST4D_ZEITARTEN
  return out
}
