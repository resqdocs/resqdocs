// medplan.mjs - BMP-UKF-Parser (#9): Bundeseinheitlicher Medikationsplan.
//
// Parst das XML-Ultrakurzformat (UKF) aus dem BMP-Data-Matrix-Code und liefert
// die Medikationszeilen (S/M/W-Elemente), Seiteninfo sowie den AUSSTELLER
// (A-Element, #144 - nur Name/Ort/Nummer/Telefon, Uebernahme ist Opt-in).
//
// DATENMINIMIERUNG BY DESIGN (Art. 9 DSGVO, siehe Issue #9 / docs/data-flow.md):
// Die Elemente P (Patient), C (Custodian) und O (Observation, klinische
// Patientenparameter) werden NIE gelesen - ihre Attribute werden nicht
// extrahiert, nicht zurueckgegeben, nicht geloggt. Vom A-Element (Aussteller =
// Praxis/Apotheke/Krankenhaus, KEIN Patientendatum) werden NUR n (Name),
// c (Ort), lanr/idf/kik (Arzt-/Apotheken-/Krankenhaus-Nummer) und p (Telefon)
// gelesen (Maintainer-Entscheidung #144); Strasse/PLZ/E-Mail/Zeitstempel nicht.
// Der Aufrufer haelt Eingabe-String und Ergebnis nur fluechtig (kein Persistieren).
//
// Format-Referenz: KBV Anlage 3 "Spezifikation BMP" (XSD bmp_V2.x, oeffentliches
// Schema + Testpaket: github.com/tionu/BA-Model). Code-Tabellen:
// S_BMP_DOSIEREINHEIT_V1.01, S_BMP_DARREICHUNGSFORM_V1.02 (KBV-Schluesseltabellen).
// Dependency-frei (kein DOM/XML-Parser) - laeuft in Node-Tests UND in der App.

// --- KBV-Schluesseltabellen (Code -> Anzeigetext) ---------------------------

/** S_BMP_DOSIEREINHEIT_V1.01: Code -> Anzeigename (DN). */
export const DOSIEREINHEIT = Object.freeze({
  '#': 'Messlöffel', 0: 'Messbecher', 1: 'Stück', 2: 'Pkg.', 3: 'Flasche',
  4: 'Beutel', 5: 'Hub', 6: 'Tropfen', 7: 'Teelöffel', 8: 'Esslöffel', 9: 'E',
  a: 'Tasse', b: 'Applikatorfüllung', c: 'Augenbadewanne', d: 'Dosierbriefchen',
  e: 'Dosierpipette', f: 'Dosierspritze', g: 'Einzeldosis', h: 'Glas',
  i: 'Likörglas', j: 'Messkappe', k: 'Messschale', l: 'Mio E', m: 'Mio IE',
  n: 'Pipettenteilstrich', o: 'Sprühstoß', p: 'IE', q: 'cm', r: 'l', s: 'ml',
  t: 'g', u: 'kg', v: 'mg',
})

/** S_BMP_DARREICHUNGSFORM_V1.02: Code -> Kurz-Anzeigename (DN), haeufige Codes. */
export const DARREICHUNGSFORM = Object.freeze({
  AMP: 'Amp', BEU: 'Beutel', BTA: 'BrTabl', CRE: 'Creme', DOS: 'Spray',
  DRA: 'Dragees', FTA: 'Tabl', GEL: 'Gel', GLO: 'Globuli', GRA: 'Gran',
  INH: 'Inhalat', KAP: 'Kaps', KTA: 'KauTabl', LOE: 'Lösung', LOT: 'Lotion',
  LTA: 'Tabl', NDS: 'NasSpr', OEL: 'Öl', PEN: 'Pen', PFL: 'Pflast',
  PUL: 'Pulver', RED: 'RetDrag', REK: 'RetKaps', RET: 'RetTabl', SAF: 'Saft',
  SAL: 'Salbe', SIR: 'Sirup', SPR: 'Spray', SRI: 'Spritze', SUP: 'Supp',
  SUS: 'Susp', TAB: 'Tabl', TEE: 'Tee', TRO: 'Tropfen', TUB: 'Tube',
  UTA: 'Tabl', ZAM: 'Amp',
})

// --- XML-Hilfen (minimal, nur was das UKF braucht) ---------------------------

/** Dekodiert die XML-Standard-Entities inkl. numerischer (&#196; / &#xE4;). */
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9A-Fa-f]+);/g, (all, e) => {
    if (e === 'amp') return '&'
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : all
  })
}

/** Attribute eines Tag-Inhalts -> Objekt (Werte entity-dekodiert). */
function parseAttrs(tagBody) {
  const attrs = {}
  for (const m of tagBody.matchAll(/([A-Za-z_][\w]*)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1]] = decodeEntities(m[2])
  }
  return attrs
}

// --- Parser -------------------------------------------------------------------

/** Elemente, deren Attribute NIE gelesen werden (Patient/Custodian/Observation). */
const SKIPPED_ELEMENTS = new Set(['P', 'C', 'O'])

/**
 * Parst einen gescannten BMP-UKF-String: Medikation + Seiteninfo + Aussteller
 * (A-Element, nur Name/Ort/Nummer/Telefon, #144). Wirft, wenn die Eingabe kein
 * BMP-UKF ist (keine MP-Wurzel).
 */
export function parseMedplanMedications(ukf) {
  if (typeof ukf !== 'string' || !/<MP[\s>]/.test(ukf)) {
    throw new Error('Kein BMP-Code: MP-Wurzelelement fehlt')
  }

  /** @type {{current:number,total:number}} */
  let page = { current: 1, total: 1 }
  const medications = []
  let aussteller // { name, ort?, nummer?: {typ, wert}, telefon? } aus dem A-Element (#144)

  let sectionTitle // aktuelle Zwischenueberschrift (S t="...")
  let sectionCode // aktueller Zwischenueberschrift-Code (S c="...")
  let currentMed = null // offenes <M ...> ... </M> (fuer W-Kinder)

  // Tag-Stream: <Name attr="..."/> | <Name ...> | </Name>
  for (const m of ukf.matchAll(/<(\/?)([A-Za-z]+)((?:\s+[\w]+\s*=\s*"[^"]*")*)\s*(\/?)>/g)) {
    const [, closing, name, attrBody, selfClosing] = m
    if (closing) {
      if (name === 'M') currentMed = null
      if (name === 'S') { sectionTitle = undefined; sectionCode = undefined }
      continue
    }
    // Datenminimierung: P/A/C/O komplett ueberspringen, Attribute nie parsen.
    if (SKIPPED_ELEMENTS.has(name)) continue

    if (name === 'A') {
      // Aussteller (#144): bewusst NUR diese vier Angaben, Rest wird verworfen.
      const a = parseAttrs(attrBody)
      if (a.n) {
        aussteller = { name: a.n }
        if (a.c) aussteller.ort = a.c
        if (a.lanr) aussteller.nummer = { typ: 'LANR', wert: a.lanr }
        else if (a.idf) aussteller.nummer = { typ: 'Apotheken-IDF', wert: a.idf }
        else if (a.kik) aussteller.nummer = { typ: 'Krankenhaus-IK', wert: a.kik }
        if (a.p) aussteller.telefon = a.p
      }
      continue
    }

    if (name === 'MP') {
      const a = parseAttrs(attrBody)
      page = { current: parseInt(a.a ?? '1', 10) || 1, total: parseInt(a.z ?? '1', 10) || 1 }
    } else if (name === 'S') {
      const a = parseAttrs(attrBody)
      sectionTitle = a.t
      sectionCode = a.c
    } else if (name === 'M') {
      const a = parseAttrs(attrBody)
      const med = {
        pzn: a.p,
        name: a.a,
        wirkstoffe: [],
        darreichungsform: a.fd ?? (a.f ? (DARREICHUNGSFORM[a.f] ?? a.f) : undefined),
        dosierung: {
          morgens: a.m,
          mittags: a.d,
          abends: a.v,
          zurNacht: a.h,
          freitext: a.t,
        },
        dosiereinheit: a.dud ?? (a.du ? (DOSIEREINHEIT[a.du] ?? a.du) : undefined),
        hinweis: a.i,
        grund: a.r,
        zusatzzeile: a.x,
        abschnitt: sectionTitle,
        abschnittCode: sectionCode,
      }
      medications.push(med)
      currentMed = selfClosing ? null : med
    } else if (name === 'W' && currentMed) {
      const a = parseAttrs(attrBody)
      if (a.w) currentMed.wirkstoffe.push({ wirkstoff: a.w, staerke: a.s })
    }
  }

  return { page, medications, aussteller }
}

// --- Anzeige-/Tipp-Text --------------------------------------------------------

/** Dosierschema als klassisches "m-d-v-h" (oder Freitext, wenn gesetzt). */
export function dosierungToText(d) {
  if (!d) return ''
  if (d.freitext) return d.freitext
  const parts = [d.morgens, d.mittags, d.abends, d.zurNacht]
  if (parts.every((p) => p === undefined)) return ''
  return parts.map((p) => p ?? '0').join('-')
}

/**
 * Eine Medikationszeile als Klartext fuer das Protokoll (NIDA-tippbar).
 * Beispiele:
 *   "Ibuprofen 600 mg (Tabl): 1-0-1-0 Stück - Grund: Schmerzen"
 *   "PZN 02223945: 1-0-0-0 Stück - Grund: Blutdruck"
 */
function medicationParts(med) {
  const wirkstoffe = med.wirkstoffe
    .map((w) => (w.staerke ? `${w.wirkstoff} ${w.staerke}` : w.wirkstoff))
    .join(' + ')
  let head = med.name ?? wirkstoffe
  if (!head) head = med.pzn ? `PZN ${med.pzn}` : 'Unbekanntes Medikament'
  else if (med.name && wirkstoffe) head = `${med.name} (${wirkstoffe})`
  if (med.darreichungsform) head += ` (${med.darreichungsform})`

  const dosis = dosierungToText(med.dosierung)
  const dosisVoll = dosis ? `${dosis}${med.dosiereinheit ? ` ${med.dosiereinheit}` : ''}` : ''

  const extras = []
  if (med.hinweis) extras.push(med.hinweis)
  if (med.grund) extras.push(`Grund: ${med.grund}`)
  if (med.zusatzzeile) extras.push(med.zusatzzeile)
  return { head, dosisVoll, extras }
}

export function medicationToText(med) {
  const { head, dosisVoll, extras } = medicationParts(med)
  return `${head}${dosisVoll ? `: ${dosisVoll}` : ''}${extras.length ? ` - ${extras.join(' - ')}` : ''}`
}

/**
 * Eine Medikationszeile als strukturierte Zeile fuer das medikamente-Element
 * (#146): { name, dosierung, kommentar } - gleiche Inhalte wie medicationToText,
 * nur aufgeteilt (Name inkl. Wirkstoffstaerke/Form, Dosierung inkl. Einheit,
 * Kommentar = Hinweis/Grund/Zusatzzeile).
 */
export function medicationToRow(med) {
  const { head, dosisVoll, extras } = medicationParts(med)
  const row = { name: head, dosierung: dosisVoll, kommentar: extras.join(' - ') }
  // Roh-PZN „im Hintergrund" mitführen (#184): bleibt am Eintrag, auch wenn der
  // Name überschrieben wird; nur für den bewussten Einzel-Transfer in die Bibliothek.
  if (med.pzn) row.pzn = med.pzn
  return row
}

/** Alle Zeilen eines geparsten Plans als Textblock (eine Zeile pro Medikament). */
export function medplanToText(parsed) {
  return parsed.medications.map(medicationToText).join('\n')
}

/**
 * Aussteller-Zeile fuers Protokoll (#144), z. B.
 *   "Hausarzt: Praxis Dr. Beispiel, Berlin, LANR 123456789, Tel. 030-1234567"
 * @param {{name:string, ort?:string, nummer?:{typ:string,wert:string}, telefon?:string}} aussteller
 * @param {string} rolle z. B. "Hausarzt" oder "Facharzt" (waehlt der Nutzer, #144)
 */
export function ausstellerToText(aussteller, rolle) {
  const parts = [aussteller.name]
  if (aussteller.ort) parts.push(aussteller.ort)
  if (aussteller.nummer) parts.push(`${aussteller.nummer.typ} ${aussteller.nummer.wert}`)
  if (aussteller.telefon) parts.push(`Tel. ${aussteller.telefon}`)
  return `${rolle}: ${parts.join(', ')}`
}
