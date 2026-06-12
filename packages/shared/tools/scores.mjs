// scores.mjs - pure Rechenmodule der Feld-Tools (#55). Dependency-frei.
//
// MEDIZINISCHE SCHWELLENWERTE: nach den publizierten Originalquellen
// implementiert. PRIMÄRQUELLEN mit konkreten Fundstellen: docs/medical-sources.md
// (RCP NEWS2 2017, Llanes/Saver LAMS, WHO TRS 894, DocCheck/Einthoven). Vor Release vom Maintainer
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
  return { value: rounded, text: `Nikotinabusus ${fmt(rounded)} py (${c} Zig./Tag, ${y} J.)` };
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
  return { value, klass, text: `BMI ${fmt(value)} (${klass}; ${fmt(w, 0)} kg, ${Math.round(h * 100)} cm)` };
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
  return {
    score,
    lvoSuspected,
    text: `LAMS ${score}/5 (${detail})${lvoSuspected ? ' - V. a. proximalen Verschluss (LVO)' : ''}`,
  };
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
  const risk =
    score >= 7 ? 'hoch' :
    score >= 5 ? 'mittel' :
    anySingle3 ? 'niedrig-mittel (Einzelwert 3)' : 'niedrig';

  const text =
    `NEWS2 ${score} (Risiko ${risk}${v.scale2 ? ', SpO2-Skala 2' : ''}) - ` +
    `AF ${v.rr}/min, SpO2 ${v.spo2}%${v.onOxygen ? ' unter O2' : ''}, ` +
    `RR ${v.systolic} mmHg syst., HF ${v.pulse}/min, Temp ${fmt(v.temp)} °C, ${acvpu} (ACVPU)`;

  return { score, items, risk, anySingle3, text };
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

// --- Unterschriftsblock (#97) ---------------------------------------------------
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
