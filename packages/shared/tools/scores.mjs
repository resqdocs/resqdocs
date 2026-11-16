// scores.mjs - pure Rechenmodule der Feld-Tools. Dependency-frei.
//
// MEDIZINISCHE SCHWELLENWERTE: nach den publizierten Originalquellen
// implementiert. PRIMÄRQUELLEN mit konkreten Fundstellen: docs/medical-sources.md
// (RCP NEWS2 2017, Llanes/Saver LAMS, Claudi FAST4D 2024, WHO TRS 894, DocCheck/Einthoven). Vor Release fachlich
// (Rettungsdienst) gegen die offiziellen Tabellen gegenzuprüfen - die App
// bleibt Hilfsmittel, keine Bewertung (docs/disclaimer.md).
//
// Vertrag: jede Funktion liefert { ...werte, text } - `text` ist die
// NIDA-tippbare deutsche Kurzform fürs Protokollfeld.

const fmt = (n, digits = 1) => Number(n).toFixed(digits).replace('.', ',');

// --- Pack-Years -----------------------------------------------------------------
// Definition: (Zigaretten/Tag ÷ 20) × Raucherjahre.

export function packYears({ cigarettesPerDay, years }) {
  const c = Number(cigarettesPerDay);
  const y = Number(years);
  if (!Number.isFinite(c) || !Number.isFinite(y) || c < 0 || y < 0) {
    throw new Error('Pack-Years: Zigaretten/Tag und Jahre müssen Zahlen >= 0 sein');
  }
  const value = (c / 20) * y;
  const rounded = Math.round(value * 10) / 10;
  // `text`/`value` bleiben unveraendert (Altsystem-Kompat); `raw` = exakter Wert fuer die
  // kaufmaennische Ganzzahl-Rundung des Rework-Formats (packYearsShort).
  return { value: rounded, raw: value, text: `Nikotinabusus ${fmt(rounded)} py (${c} Zig./Tag, ${y} J.)` };
}

// Rework-Kurzform der Packungsjahre: kaufmaennisch auf eine GANZE Zahl gerundet (round half up;
// Pack-Years sind stets >= 0); „ca. " davor, WENN gerundet wurde (exakte glatte Werte ohne Praefix).
// BEWUSST „ca." statt „≈": das Ungefaehr-Zeichen tippt die Bridge auf dem NIDA-Windows-Layout nicht
// sauber (nicht in der de_DE-Keystroke-Tabelle der Firmware).
export function packYearsShort(raw) {
  const r = Number(raw);
  const rounded = Math.round(r);
  return `${Math.abs(r - rounded) > 1e-9 ? 'ca. ' : ''}${rounded} py`;
}

// --- BMI ------------------------------------------------------------------------
// BMI = kg/m²; Klassifikation nach WHO.

export function bmi({ weightKg, heightCm }) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('BMI: Gewicht (kg) und Größe (cm) müssen Zahlen > 0 sein');
  }
  const value = Math.round((w / (h * h)) * 10) / 10;
  const klass =
    value < 18.5 ? 'Untergewicht' :
    value < 25 ? 'Normalgewicht' :
    value < 30 ? 'Präadipositas' :
    value < 35 ? 'Adipositas Grad I' :
    value < 40 ? 'Adipositas Grad II' : 'Adipositas Grad III';
  // body (Funktion): ohne „BMI"-Praefix - das Label liefert der Titel des Funktions-Knotens.
  const body = `${fmt(value)} (${klass}; ${fmt(w, 0)} kg, ${Math.round(h * 100)} cm)`;
  return { value, klass, text: `BMI ${body}`, body };
}

// --- LAMS (Los Angeles Motor Scale) ----------------------------------------------
// Llanes/Kidwell et al., Prehosp Emerg Care 2004. Items: Fazialisparese 0-1,
// Armhalteversuch 0-2, Händedruck 0-2; Summe 0-5. LAMS >= 4: Hinweis auf
// proximalen Gefäßverschluss (LVO).

const LAMS_FACE = { 0: 'Gesicht o. B.', 1: 'Fazialisparese' };
const LAMS_ARM = { 0: 'Arm o. B.', 1: 'Arm sinkt ab', 2: 'Arm fällt sofort' };
const LAMS_GRIP = { 0: 'Händedruck normal', 1: 'Händedruck schwach', 2: 'kein Händedruck' };

export function lams({ face, arm, grip }) {
  const f = Number(face), a = Number(arm), g = Number(grip);
  if (![0, 1].includes(f) || ![0, 1, 2].includes(a) || ![0, 1, 2].includes(g)) {
    throw new Error('LAMS: face 0-1, arm 0-2, grip 0-2');
  }
  const score = f + a + g;
  const lvoSuspected = score >= 4;
  const detail = `${LAMS_FACE[f]}, ${LAMS_ARM[a]}, ${LAMS_GRIP[g]}`;
  // body (Funktion): ohne „LAMS"-Praefix - das Label liefert der Titel des Funktions-Knotens.
  // text (Alt-Tool): unveraendert mit Praefix.
  const body = `${score}/5 (${detail})${lvoSuspected ? ' - V. a. proximalen Verschluss (LVO)' : ''}`;
  return { score, lvoSuspected, text: `LAMS ${body}`, body };
}

// --- FAST4D -----------------------------------------------------------------------
// Claudi et al., J Clin Med 2024;13(17):5033: FAST erweitert um vier Zeichen der hinteren
// Zirkulation (Doppelbilder, Gesichtsfelddefekt, Dreh-/Schwankschwindel, Dysmetrie/Ataxie).
// KEIN Punktescore: jedes Zeichen ist auffaellig oder unauffaellig, FAST4D gilt als positiv
// ab EINEM auffaelligen Zeichen. Die Zeit (Symptombeginn) wird dokumentiert, aber nicht gewertet.
// Bewusst OHNE Schwelle/Zuweisungshinweis: die Studie nennt keinen Cut-off (docs/medical-sources.md).

const FAST4D_ITEMS = [
  ['face', 'Fazialisparese'],
  ['arm', 'Armabsinken'],
  ['speech', 'Sprachstörung'],
  ['diplopia', 'Doppelbilder'],
  ['field', 'Gesichtsfelddefekt'],
  ['vertigo', 'Dreh-/Schwankschwindel'],
  ['ataxia', 'Dysmetrie/Ataxie'],
];
const FAST4D_SIDE = { re: ' rechts', li: ' links' };
const FAST4D_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * FAST4D-Ergebnis.
 * @param {object} v - face, arm, speech, diplopia, field, vertigo, ataxia: 'neg' | 'pos' | 'na'
 *                     (unauffaellig | auffaellig | nicht pruefbar); faceSide/armSide: 're' | 'li' (optional,
 *                     nur bei auffaelligem Befund); timeMode: 'onset' | 'lsw' | 'unknown' (optional);
 *                     time: 'HH:MM' (optional, bei onset/lsw)
 */
export function fast4d(v) {
  for (const [key] of FAST4D_ITEMS) {
    if (!['neg', 'pos', 'na'].includes(v[key])) throw new Error(`FAST4D: ${key} muss neg|pos|na sein`);
  }
  const sideOf = (key) => (key === 'face' ? v.faceSide : key === 'arm' ? v.armSide : undefined);
  const findings = FAST4D_ITEMS.filter(([key]) => v[key] === 'pos').map(([key, out]) => out + (FAST4D_SIDE[sideOf(key)] ?? ''));
  const notTestable = FAST4D_ITEMS.filter(([key]) => v[key] === 'na').map(([, out]) => out);
  const count = findings.length;
  const positive = count > 0;
  const untestable = notTestable.length === FAST4D_ITEMS.length;

  const time = typeof v.time === 'string' && FAST4D_TIME.test(v.time) ? v.time : '';
  const timeText =
    v.timeMode === 'unknown' ? 'Symptombeginn unklar.' :
    v.timeMode === 'onset' && time ? `Symptombeginn ${time}.` :
    v.timeMode === 'lsw' && time ? `Zuletzt gesund gesehen ${time}.` : '';

  let body;
  if (untestable) body = 'nicht prüfbar.';
  else if (positive) body = `positiv (${count}/7): ${findings.join(', ')}${notTestable.length ? `; nicht prüfbar: ${notTestable.join(', ')}` : ''}.`;
  else body = `negativ${notTestable.length ? ` (nicht prüfbar: ${notTestable.join(', ')})` : ''}.`;
  if (timeText) body += ` ${timeText}`;

  // body (Funktion): ohne „FAST4D"-Praefix - das Label liefert der Titel des Funktions-Knotens.
  return { positive, count, untestable, findings, notTestable, timeText, text: `FAST4D ${body}`, body };
}

// --- ZOPS -------------------------------------------------------------------------
// Merkhilfe fuer die Orientierung: Zeit, Ort, Person, Situation. KEIN Score, keine Schwelle, keine
// Bewertung: jeder Punkt ist orientiert, nicht orientiert oder nicht pruefbar. Die Ausgabe nennt nur
// die Abweichung, damit der Normalfall ein Wort bleibt (docs/medical-sources.md).

const ZOPS_ITEMS = [
  ['time', 'Zeit'],
  ['place', 'Ort'],
  ['person', 'Person'],
  ['situation', 'Situation'],
];

/**
 * ZOPS-Ergebnis.
 * @param {object} v - time, place, person, situation: 'ok' | 'no' | 'na'
 *                     (orientiert | nicht orientiert | nicht pruefbar)
 */
export function zops(v) {
  for (const [key] of ZOPS_ITEMS) {
    if (!['ok', 'no', 'na'].includes(v[key])) throw new Error(`ZOPS: ${key} muss ok|no|na sein`);
  }
  const names = (state) => ZOPS_ITEMS.filter(([key]) => v[key] === state).map(([, out]) => out);
  const orientedTo = names('ok');
  const notOriented = names('no');
  const notTestable = names('na');
  const oriented = orientedTo.length === ZOPS_ITEMS.length;
  const untestable = notTestable.length === ZOPS_ITEMS.length;
  const rest = notTestable.length ? `; nicht prüfbar: ${notTestable.join(', ')}` : '';

  let body;
  if (untestable) body = 'nicht prüfbar.';
  else if (notOriented.length) body = `nicht orientiert zu: ${notOriented.join(', ')}${rest}.`;
  else if (oriented) body = 'orientiert.';
  // Nichts auffaellig, aber nicht alles pruefbar: genau sagen, wozu die Orientierung feststeht.
  else body = `orientiert zu: ${orientedTo.join(', ')}${rest}.`;

  // body (Funktion): ohne „ZOPS"-Praefix - das Label liefert der Titel des Funktions-Knotens.
  return { oriented, untestable, orientedTo, notOriented, notTestable, text: `ZOPS ${body}`, body };
}

// --- Sgarbossa (modifiziert nach Smith) --------------------------------------------
// Infarktzeichen im EKG bei Linksschenkelblock (Sgarbossa et al., N Engl J Med 1996;334:481-487) in
// der Fassung von Smith et al., Ann Emerg Med 2012;60:766-776: das dritte Kriterium ist die diskordante
// ST-Hebung im Verhaeltnis zur S-Zacke (ST/S, Grenzwert -0,25) statt fester 5 mm; die Regel ist
// UNGEWICHTET, ein erfuelltes Kriterium genuegt. Kein Punktwert.
// Wichtig: Ein negatives Ergebnis schliesst einen akuten Koronarverschluss NICHT aus (Sensitivitaet der
// modifizierten Kriterien 80 % bei Meyers et al., Am Heart J 2015;170:1255-1264). Der Hinweis dazu
// steht in der App (SGARBOSSA_NEGATIVE_HINT), nie im Protokolltext (docs/medical-sources.md).

const SGARBOSSA_ITEMS = [
  ['concordantElevation', 'konkordante ST-Hebung'],
  ['concordantDepression', 'konkordante ST-Senkung in V1-V3'],
  ['discordantElevation', 'diskordante ST-Hebung (ST/S ab 0,25)'],
];

/** Pflicht-Hinweis der App bei negativem Ergebnis (Wortlaut vom Maintainer). */
export const SGARBOSSA_NEGATIVE_HINT = 'Negative Sgarbossa-Kriterien schließen einen akuten Koronarverschluss nicht aus.';

/**
 * Ergebnis der modifizierten Sgarbossa-Kriterien.
 * @param {object} v - concordantElevation, concordantDepression, discordantElevation: 'pos' | 'neg' | 'na'
 *                     (erfuellt | nicht erfuellt | nicht beurteilbar)
 * @param {string} [lineEnd] - Zeichen am Ende der Zeile; fehlt -> '.', leer -> nichts
 */
export function sgarbossa(v, lineEnd) {
  for (const [key] of SGARBOSSA_ITEMS) {
    if (!['pos', 'neg', 'na'].includes(v[key])) throw new Error(`Sgarbossa: ${key} muss pos|neg|na sein`);
  }
  const findings = SGARBOSSA_ITEMS.filter(([key]) => v[key] === 'pos').map(([, out]) => out);
  const notAssessable = SGARBOSSA_ITEMS.filter(([key]) => v[key] === 'na').map(([, out]) => out);
  const count = findings.length;
  const positive = count > 0;
  const untestable = notAssessable.length === SGARBOSSA_ITEMS.length;

  // Zeilenende frei waehlbar (Maintainer): genau das, was die Vorlage vorgibt.
  const end = typeof lineEnd === 'string' ? lineEnd : '.';
  let body;
  if (untestable) body = 'nicht beurteilbar';
  else if (positive) body = `positiv: ${findings.join(', ')}${notAssessable.length ? `; nicht beurteilbar: ${notAssessable.join(', ')}` : ''}`;
  else body = `negativ${notAssessable.length ? ` (nicht beurteilbar: ${notAssessable.join(', ')})` : ''}`;
  body += end;

  // body (Funktion): ohne Praefix - das Label liefert der Titel des Funktions-Knotens.
  return { positive, negative: !positive && !untestable, count, untestable, findings, notAssessable, text: `Sgarbossa (mod. nach Smith) ${body}`, body };
}

// --- EGSYS -------------------------------------------------------------------------
// Del Rosso et al., Heart 2008;94:1620-1626 (Evaluation of Guidelines in Syncope Study): Punktwert aus
// der Anamnese fuer die Frage, ob eine Synkope kardial bedingt ist. Sechs Punkte mit Werten von +4 bis
// -1; „A score >=3 identified cardiac syncope" (Sensitivitaet 95 %/92 %, Spezifitaet 61 %/69 %).
// Punktwerte je Punkt nach Kariman et al., Emerg Med Int 2015;2015:515370, Tabelle 2 (EGSYS-M).
// Wichtig: Unter 3 Punkten ist eine kardiale Synkope NICHT ausgeschlossen - der Hinweis dazu steht in
// der App (EGSYS_LOW_HINT), nie im Protokolltext (docs/medical-sources.md).

const EGSYS_ITEMS = [
  ['palpitations', 4, 'Palpitationen vor Synkope'],
  ['heartDisease', 3, 'Herzerkrankung/EKG auffällig'],
  ['effort', 3, 'Synkope bei Belastung'],
  ['supine', 2, 'Synkope im Liegen'],
  ['triggers', -1, 'Auslöser vorhanden'],
  ['prodromes', -1, 'vegetative Prodromi'],
];
/** Ab diesem Wert nennt die Studie eine kardiale Synkope wahrscheinlich. */
export const EGSYS_THRESHOLD = 3;
/** Hinweis der App bei einem Ergebnis unter der Schwelle. */
export const EGSYS_LOW_HINT = 'Ein EGSYS unter 3 Punkten schließt eine kardiale Synkope nicht aus.';
/** Standardtext ab der Schwelle; in der Vorlage frei aenderbar (config.thresholdText, Maintainer). */
export const EGSYS_DEFAULT_TEXT = '- kardiale Synkope wahrscheinlich';

/**
 * EGSYS-Ergebnis.
 * @param {object} v - palpitations, heartDisease, effort, supine, triggers, prodromes: 'yes' | 'no'
 * @param {string} [thresholdText] - Text ab 3 Punkten; fehlt oder leer -> EGSYS_DEFAULT_TEXT
 * @param {string} [lineEnd] - Zeichen am Ende der Zeile; fehlt -> '.', leer -> nichts
 */
export function egsys(v, thresholdText, lineEnd) {
  for (const [key] of EGSYS_ITEMS) {
    if (v[key] !== 'yes' && v[key] !== 'no') throw new Error(`EGSYS: ${key} muss yes|no sein`);
  }
  const hits = EGSYS_ITEMS.filter(([key]) => v[key] === 'yes');
  const score = hits.reduce((sum, [, points]) => sum + points, 0);
  const findings = hits.map(([, , out]) => out);
  const cardiacSuspected = score >= EGSYS_THRESHOLD;
  const unit = Math.abs(score) === 1 ? 'Punkt' : 'Punkte';

  const own = typeof thresholdText === 'string' ? thresholdText.trim() : '';
  const extra = cardiacSuspected ? own || EGSYS_DEFAULT_TEXT : '';
  // Zeilenende frei waehlbar (Maintainer): genau das, was die Vorlage vorgibt - keine Automatik.
  const end = typeof lineEnd === 'string' ? lineEnd : '.';
  const body = `${score} ${unit}${findings.length ? ` (${findings.join(', ')})` : ''}${extra ? ` ${extra}` : ''}${end}`;
  // body (Funktion): ohne „EGSYS"-Praefix - das Label liefert der Titel des Funktions-Knotens.
  return { score, cardiacSuspected, findings, text: `EGSYS ${body}`, body };
}

// --- NEWS2 ----------------------------------------------------------------------
// Royal College of Physicians: "National Early Warning Score (NEWS) 2" (2017).
// SpO2-Skala 2 NUR bei dokumentierter hyperkapnischer respiratorischer
// Insuffizienz (z. B. COPD) auf ärztliche Festlegung.

function scoreRespRate(rr) {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3;
}

function scoreSpo2Scale1(s) {
  if (s <= 91) return 3;
  if (s <= 93) return 2;
  if (s <= 95) return 1;
  return 0;
}

function scoreSpo2Scale2(s, onOxygen) {
  if (s <= 83) return 3;
  if (s <= 85) return 2;
  if (s <= 87) return 1;
  if (s <= 92) return 0;
  // >= 93:
  if (!onOxygen) return 0; // Raumluft
  if (s <= 94) return 1;
  if (s <= 96) return 2;
  return 3;
}

function scoreSystolic(bp) {
  if (bp <= 90) return 3;
  if (bp <= 100) return 2;
  if (bp <= 110) return 1;
  if (bp <= 219) return 0;
  return 3;
}

function scorePulse(hr) {
  if (hr <= 40) return 3;
  if (hr <= 50) return 1;
  if (hr <= 90) return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3;
}

function scoreTemp(t) {
  if (t <= 35.0) return 3;
  if (t <= 36.0) return 1;
  if (t <= 38.0) return 0;
  if (t <= 39.0) return 1;
  return 2;
}

/**
 * NEWS2-Gesamtscore.
 * @param {object} v - rr (AF/min), spo2 (%), scale2 (bool), onOxygen (bool),
 *                     systolic (mmHg), pulse (/min), temp (°C),
 *                     consciousness: 'A' | 'C' | 'V' | 'P' | 'U' (ACVPU)
 */
export function news2(v) {
  for (const k of ['rr', 'spo2', 'systolic', 'pulse', 'temp']) {
    if (!Number.isFinite(Number(v[k]))) throw new Error(`NEWS2: ${k} fehlt oder ist keine Zahl`);
  }
  const acvpu = String(v.consciousness ?? '').toUpperCase();
  if (!['A', 'C', 'V', 'P', 'U'].includes(acvpu)) throw new Error('NEWS2: consciousness muss A/C/V/P/U sein');

  const items = {
    atemfrequenz: scoreRespRate(Number(v.rr)),
    spo2: v.scale2 ? scoreSpo2Scale2(Number(v.spo2), Boolean(v.onOxygen)) : scoreSpo2Scale1(Number(v.spo2)),
    sauerstoffgabe: v.onOxygen ? 2 : 0,
    rrSystolisch: scoreSystolic(Number(v.systolic)),
    herzfrequenz: scorePulse(Number(v.pulse)),
    bewusstsein: acvpu === 'A' ? 0 : 3,
    temperatur: scoreTemp(Number(v.temp)),
  };
  const score = Object.values(items).reduce((a, b) => a + b, 0);
  const anySingle3 = Object.values(items).some((s) => s === 3);
  // Risiko-Einstufung rein nach dem AGGREGAT-Score: 0-4 niedrig, 5-6 mittel, >=7 hoch.
  // Bewusst OHNE die RCP-Einzelparameter-Eskalation (ein einzelner Wert = 3 -> niedrig-mittel): die einzelnen
  // Vitalwerte stehen im Protokoll ohnehin separat, entscheidend ist, was der Gesamtscore ergibt.
  // anySingle3 bleibt informativ im Rueckgabewert, fliesst aber nicht mehr in risk ein.
  const risk =
    score >= 7 ? 'hoch' :
    score >= 5 ? 'mittel' :
    'niedrig';

  // Rework-Ausgabe (body): NUR Score + Risiko - die Vitalwerte stehen im Protokoll
  // ohnehin separat, daher hier keine Wiederholung. Alt-Tool (text): voll, mit „NEWS2"-Praefix + Kernwerten.
  const risikoTeil = `Risiko ${risk}${v.scale2 ? ', SpO2-Skala 2' : ''}`;
  const kernwerte =
    `AF ${v.rr}/min, SpO2 ${v.spo2}%${v.onOxygen ? ' unter O2' : ''}, ` +
    `RR ${v.systolic} mmHg syst., HF ${v.pulse}/min, Temp ${fmt(v.temp)} °C, ${acvpu} (ACVPU)`;
  // body (Rework): Score + ausgeschriebene Risikostufe (im Protokoll deutlich
  // lesbar, da reiner Text keine Farbe tragen kann). text (Alt-Tool): unveraendert, mit Kernwerten.
  const risikoLang = { niedrig: 'niedriges Risiko', mittel: 'mittleres Risiko', hoch: 'hohes Risiko' }[risk] ?? `Risiko ${risk}`;
  const body = `${score} — ${risikoLang}${v.scale2 ? ' (SpO2-Skala 2)' : ''}`;
  const text = `NEWS2 ${score} (${risikoTeil}) - ${kernwerte}`;

  return { score, items, risk, anySingle3, text, body };
}

// --- EKG-Lagetyp (Tabelle nach Hauptausschlag I/II/III + R-Zacken-Vergleich) ----
// Massgebend ist die Hauptausschlagsrichtung des QRS je Ableitung I, II, III
// (positiv | negativ). Bei allseits positivem Ausschlag entscheidet der Vergleich
// der R-Zacke in I vs. III (Indifferenz- vs. Steiltyp). Nicht abbildbare/uneindeutige
// Konstellationen liefern KEINEN Typ, sondern den Hinweis "Angaben kontrollieren".
// Eigene Umsetzung. VERIFIZIERT gegen:
//  - DocCheck Flexikon "Lagetyp" (6 Standardtypen, I/II/III pos/neg, Gradbereiche)
//    https://flexikon.doccheck.com/de/Lagetyp
//  - Wikibooks Elektrokardiographie (S-I-S-II-S-III-/Sagittaltyp = alle negativ)
//    https://de.wikibooks.org/wiki/Elektrokardiographie:_Ableitungen_der_Frontalebene_und_Achsen
//  - Indifferenz vs. Steiltyp via R-Zacken-Vergleich I/III (DocCheck).
// Unmoegliche Konstellationen folgen aus dem Einthoven-Gesetz (II = I + III):
//   pos|neg|pos und neg|pos|neg koennen nicht auftreten -> "Angaben kontrollieren".
//
//   I+ II- III-                      überdrehter Linkstyp
//   I+ II+ III-                      Linkstyp
//   I+ II+ III+  & R(I) > R(III)     Indifferenztyp (Normaltyp)
//   I+ II+ III+  & R(III) > R(I)     Steiltyp
//   I- II+ III+                      Rechtstyp
//   I- II- III+                      überdrehter Rechtstyp
//   I- II- III-                      Sagittaltyp (S-I-S-II-S-III)
//   sonst / R-Vergleich uneindeutig  -> Angaben kontrollieren

export function ekgAxisTable({ leadI, leadII, leadIII, rLarger }) {
  for (const [name, v] of [['I', leadI], ['II', leadII], ['III', leadIII]]) {
    if (v !== 'pos' && v !== 'neg') throw new Error(`EKG-Lagetyp: Ableitung ${name} muss pos|neg sein`);
  }
  const unklar = { typ: null, text: 'Angaben kontrollieren - Konstellation nicht eindeutig.' };
  const key = `${leadI}|${leadII}|${leadIII}`;
  if (key === 'pos|neg|neg') return done('überdrehter Linkstyp');
  if (key === 'pos|pos|neg') return done('Linkstyp');
  if (key === 'pos|pos|pos') {
    if (rLarger === 'I') return done('Indifferenztyp');
    if (rLarger === 'III') return done('Steiltyp');
    return unklar; // R-Vergleich noetig/uneindeutig
  }
  if (key === 'neg|pos|pos') return done('Rechtstyp');
  if (key === 'neg|neg|pos') return done('überdrehter Rechtstyp');
  if (key === 'neg|neg|neg') return done('Sagittaltyp (S-I-S-II-S-III)');
  return unklar;

  function done(typ) { return { typ, text: `Lagetyp: ${typ}` }; }
}

// --- Unterschriftsblock ---------------------------------------------------------
// Erzeugt einen tippbaren Block: je Rolle eine Zeile, etwas Abstand, dann eine
// Unterschriftslinie aus '_'. Fuer Mitfahrt-/Transportverweigerung etc.
// Reiner Text fuers Zielsystem - KEINE digitale Signatur.

export function signatureBlock({ roles, lineLength = 40, gap = 3 } = {}) {
  const list = Array.isArray(roles) && roles.length ? roles : ['Patient'];
  const blank = '\n'.repeat(Math.max(1, gap));
  const line = '_'.repeat(Math.max(10, Math.min(80, lineLength)));
  return list
    .map((role) => `${role}:${blank}${line}`)
    .join('\n\n\n');
}
