// registry.ts — reine Funktions-Registry (Vue-frei, node-testbar). Jede Funktion liefert Anzeige-Label,
// Body-Render (Klartext der Daten, OHNE Titel) + hasData. Die Einsatz-Komponente (Vue) liegt getrennt
// (EinsatzFunction.vue), damit der pure Kern (render.ts/deviations.ts) testbar bleibt. Erweiterbar:
// eine neue Funktion = ein neuer FunctionKind + ein Eintrag hier (Kern bleibt unberuehrt).
import type { FunctionKind, FunctionNode, FieldFill, MedikamenteRow, ArztRow, PackYearsRow, NEWS2Row, LAMSRow, FAST4DRow, ZOPSRow, SgarbossaRow, EGSYSRow, BMIRow, FunctionRow, FunctionConfig } from '../model.ts'
import { DEFAULT_HEADING } from '../model.ts'
import { packYears, packYearsShort, bmi, news2, lams, fast4d, zops, sgarbossa, egsys, EGSYS_DEFAULT_TEXT } from '../tools/scores.mjs'
import { fast4dComplete, fast4dInput, type Fast4dCompleteRow } from '../tools/fast4dDefs.mjs'

/** Inline-Default fuer FUNKTIONS-Zeilen: Semikolon statt DEFAULT_SEPARATOR ", " - das Komma ist
 *  seit dem Zeilenformat "Name Staerke, Schema" die Grenze INNERHALB einer Zeile; als
 *  Zeilen-Trenner waere es ambig (genau das ISMP-Fehlermuster, das das Format vermeidet).
 *  Das Semikolon ist die uebliche Trennung von Eintraegen, die selbst Kommas enthalten, und auf jeder
 *  Tastaturbelegung tippbar. Frueher stand hier der Mittelpunkt " · "; ihn kann die Bridge nicht tippen
 *  (am Zielgeraet kam [?] an, vom Maintainer am Geraet geprueft, 2026-11-24). */
export const FUNCTION_ROW_INLINE_SEPARATOR = '; '

/** Der fruehere Standard-Trenner. Vorlagen, die genau ihn ausdruecklich gespeichert haben (aus der Zeit, als
 *  er Standard war, auch aus aelteren Beispielen der KI-Doku), meinen „Standard" und sollen nicht mit [?]
 *  am Zielgeraet enden. */
export const LEGACY_ROW_INLINE_SEPARATOR = ' · '

/** Der Trenner, der fuer diese Konfiguration gilt. DIE EINE Stelle fuer Standard und frueheren Standard:
 *  nicht gesetzt oder genau der fruehere Standard -> "; ". Jeder andere ausdruecklich gesetzte Trenner
 *  bleibt, wie er ist (auch ein leerer oder ein Mittelpunkt ohne Leerzeichen). */
export function rowSeparatorOf(config?: FunctionConfig): string {
  const own = config?.rowSeparator
  return own === undefined || own === LEGACY_ROW_INLINE_SEPARATOR ? FUNCTION_ROW_INLINE_SEPARATOR : own
}

export interface FunctionDef {
  /** Anzeige-Label (Editor-Knopf, Badge). */
  label: string
  /** Klartext der Funktions-Daten (OHNE Titel/Heading - das macht renderFunction). Leer -> entfaellt.
   *  config steuert Zeilen-Layout (untereinander/hintereinander, Trenner, Praefix/Suffix). */
  renderBody(fill: FieldFill | undefined, config?: FunctionConfig): string
  /** Hat die Funktion erfasste Daten? (Abweichungs-Zaehlung, Ausgabe-Filter.) */
  hasData(fill: FieldFill | undefined): boolean
  /** Einzeilige Funktion? Scores (Pack-Years/NEWS2) geben GENAU EINE Zeile aus -> inline-faehig wie ein
   *  Feld. Listen-Funktionen (Medikamentenplan/Aerzte) sind mehrzeilig -> fehlt/false -> immer Block. */
  singleLine?: boolean
  /** Feste Beispiel-Eingabe NUR fuer die Editor-Vorschau: der Nutzer gibt im Editor nichts ein,
   *  darum zeigt die Vorschau mit diesem Demo-Fill, WIE der Score mit Werten aussieht. Im Einsatz / der
   *  echten Ausgabe ungenutzt. Fehlt -> die Funktion erscheint in der Vorschau leer (wie ein Feld ohne
   *  Default). */
  sampleFill?(): FieldFill
  /** Optionaler Ampel-Farbakzent fuer die EINSATZ-Anzeige (daisyUI-Semantik). Nur Scores mit Risiko-Stufe
   *  (NEWS2: niedrig->success, mittel->warning, hoch->error). Rein visuell in der App - die Text-/Export-
   *  Ausgabe traegt keine Farbe. Fehlt/undefined -> kein Farbakzent. */
  accent?(fill: FieldFill | undefined): 'success' | 'warning' | 'error' | undefined
  /** Optional: Der Score haengt ab seiner Schwelle einen Text an, den die Vorlage aendern darf
   *  (config.thresholdText). `standard` = Text ohne eigene Angabe, `label` = Beschriftung im Editor. */
  thresholdText?: { standard: string; label: string }
  /** Optional: Das Zeichen am Ende der Ergebniszeile darf die Vorlage waehlen (config.lineEnd).
   *  `standard` gilt ohne eigene Angabe, `label` = Beschriftung im Editor. */
  lineEnd?: { standard: string; label: string }
  /** Optionale Start-Formatierung des Titels beim ANLEGEN der Funktion (createFunction mischt sie ein).
   *  Als Funktion, damit jeder neue Knoten ein eigenes heading-Objekt bekommt (keine geteilte Referenz).
   *  Fehlt -> Titel als Banner in eigener Zeile (wie bisher). Im Editor frei aenderbar. */
  createDefaults?(): Partial<Pick<FunctionNode, 'titleInline' | 'heading'>>
}

/** Zeilenende aus der Vorlage (config.lineEnd) auf eine fertige Ergebniszeile anwenden: das Standard-
 *  Ende der Funktion abschneiden und das gewaehlte anhaengen. Ohne Angabe bleibt die Zeile wie sie ist
 *  (rueckwaerts kompatibel). Fuer Funktionen, deren Rechenkern das Zeilenende nicht selbst kennt. */
function applyLineEnd(body: string, standard: string, config?: FunctionConfig): string {
  if (!body || config?.lineEnd === undefined) return body
  const base = standard && body.endsWith(standard) ? body.slice(0, -standard.length) : body
  return base + config.lineEnd
}

/** Start-Formatierung der Befund-Funktionen (LAMS/FAST4D/ZOPS): Titel OHNE Markdown-Praefix inline vor dem
 *  Ergebnis -> eine Zeile „LAMS 4/5 (…)" statt Banner + Zeile. So steht die Zeile im Freitext des
 *  Protokolls wie von Hand geschrieben. */
function inlineTitleDefaults(): Partial<Pick<FunctionNode, 'titleInline' | 'heading'>> {
  return { titleInline: true, heading: { ...DEFAULT_HEADING, prefix: '', suffix: ' ' } }
}

function rowsOf(fill: FieldFill | undefined): FunctionRow[] {
  return fill?.state === 'function' ? fill.rows : []
}

/** Block/Inline-Layout (gemeinsam fuer alle Funktionen): inline = eine Zeile mit Trenner,
 *  block (Default) = je Zeile, optional Praefix/Suffix. */
function layoutRows(texts: string[], config?: FunctionConfig): string {
  if (!texts.length) return ''
  if (config?.rowLayout === 'inline') {
    return texts.join(rowSeparatorOf(config))
  }
  const pre = config?.rowPrefix ?? ''
  const suf = config?.rowSuffix ?? ''
  return texts.map((t) => `${pre}${t}${suf}`).join('\n')
}

/** Eine Medikamenten-Zeile als Klartext: "Name Staerke, Schema (Hinweis)". Quellenbelegt:
 *  Reihenfolge = BMP-Spaltenfolge (KBV Anlage 3 zur BMP-Vereinbarung); Name+Staerke bilden eine
 *  feste Einheit (Leerzeichen); das Komma setzt das Dosierschema IMMER sichtbar ab - auch ohne
 *  Staerke ("Ramipril 5, 1-0-0"): die KBV-Rezept-FAQ verlangt eine sichtbare Abtrennung der
 *  Dosierung, und zwei nackte Zahlengruppen nebeneinander sind ein belegtes Fehlermuster (ISMP).
 *  Namenlos-robust: keine fuehrenden Trenner; die AUSGABE filtert namenlose weiterhin. */
export function formatMedikament(r: MedikamenteRow): string {
  const kopf = [r.name.trim(), r.staerke?.trim()].filter(Boolean).join(' ')
  const dos = r.dosierung?.trim()
  const kom = r.kommentar?.trim()
  let s = kopf
  if (dos) s += s ? `, ${dos}` : dos
  if (kom) s += s ? ` (${kom})` : `(${kom})`
  return s
}

/** Kontakt-Rollen (Angehörige/Betreuer): eigener Feldsatz Name/Telefon + zwei Rechts-Flags, KEINE
 *  Arztnummer/Ort. Alles andere (Hausarzt/Facharzt/ohne Rolle) = Arzt-Feldsatz. */
const KONTAKT_ROLLEN = new Set<ArztRow['rolle']>(['Angehöriger', 'Betreuer'])

/** Eine Kontaktperson als Klartext: Name (Rolle)[, Tel. ...][, Patientenverfügung [+ Vollmacht/Betreuung]
 *  vorhanden]. Namenlos-robust (gleiche s-Guard-Idiomatik wie formatArzt). */
function formatKontakt(r: ArztRow): string {
  let s = r.name.trim()
  if (r.rolle) s += s ? ` (${r.rolle})` : `(${r.rolle})`
  const details: string[] = []
  const tel = r.telefon?.trim()
  if (tel) details.push(`Tel. ${tel}`)
  const flags: string[] = []
  if (r.patientenverfuegung) flags.push('Patientenverfügung')
  if (r.vollmacht) flags.push('Vollmacht/Betreuung')
  if (flags.length) details.push(`${flags.join(' + ')} vorhanden`)
  if (details.length) s += s ? `, ${details.join(', ')}` : details.join(', ')
  return s
}

/** Eine Zeile als Klartext. Arzt: Name [(Rolle)][, Ort, Tel. ..., Arztnr. ...]. Kontaktperson
 *  (Angehörige/Betreuer): eigener Feldsatz (formatKontakt). Namenlos-robust. */
export function formatArzt(r: ArztRow): string {
  if (KONTAKT_ROLLEN.has(r.rolle)) return formatKontakt(r)
  let s = r.name.trim()
  if (r.rolle) s += s ? ` (${r.rolle})` : `(${r.rolle})`
  const details: string[] = []
  const ort = r.ort?.trim()
  const tel = r.telefon?.trim()
  const nr = r.arztnummer?.trim()
  if (ort) details.push(ort)
  if (tel) details.push(`Tel. ${tel}`)
  if (nr) details.push(`Arztnr. ${nr}`)
  if (details.length) s += s ? `, ${details.join(', ')}` : details.join(', ')
  return s
}

/** Traegt die Zeile IRGENDEINE Nutzereingabe? Basis fuer Loesch-Schutz UND Aufraeum-Filter der
 *  Einsatz-Komponenten: Zeilen mit Eingaben nie stumm verwerfen. Bewusst breiter als hasData/renderBody
 *  (die auf den Namen filtern): eine namenlose Zeile mit Dosierung ist in der AUSGABE unsichtbar,
 *  in UI/Entwurf aber vorhandene Nutzerarbeit. */
export function medikamentRowHasData(r: MedikamenteRow): boolean {
  return !!(r.name.trim() || r.staerke?.trim() || r.dosierung?.trim() || r.kommentar?.trim() || r.pzn?.trim())
}

/** Staerke-Vorschlag aus der Bibliothek nur uebernehmen, wenn der Name sie nicht schon traegt
 *  (Label "Ibuflam 400 mg" + staerke "400 mg" wuerde sonst doppelt dokumentiert). */
export function staerkeOhneDuplikat(name: string, staerke: string | undefined): string | undefined {
  const st = staerke?.trim()
  if (!st) return undefined
  return name.toLowerCase().includes(st.toLowerCase()) ? undefined : st
}

export function arztRowHasData(r: ArztRow): boolean {
  return !!(r.name.trim() || r.rolle || r.ort?.trim() || r.telefon?.trim() || r.arztnummer?.trim() || r.patientenverfuegung || r.vollmacht)
}

const medikamentenplan: FunctionDef = {
  label: 'Medikationsplan',
  // Editor-Vorschau: 3 Muster-Medikamente (KEINE echten Praeparate/Dosierungen) - zeigen das Zeilenformat
  // „Name Staerke, Schema (Hinweis)" inkl. der Variante ohne Staerke.
  sampleFill: () => ({
    state: 'function',
    rows: [
      { name: 'Beispiel-Wirkstoff A', staerke: '500 mg', dosierung: '1-0-1' },
      { name: 'Beispiel-Wirkstoff B', staerke: '10 mg', dosierung: '1-0-0', kommentar: 'nüchtern' },
      { name: 'Beispiel-Tropfen', dosierung: 'bei Bedarf' },
    ],
  }),
  renderBody(fill, config) {
    const texts = (rowsOf(fill) as MedikamenteRow[]).filter((r) => r.name?.trim()).map(formatMedikament)
    return layoutRows(texts, config)
  },
  hasData(fill) {
    return (rowsOf(fill) as MedikamenteRow[]).some((r) => r.name?.trim())
  },
}

const aerzte: FunctionDef = {
  label: 'Kontakte/Ärzte',
  // Editor-Vorschau: Muster-Arzt + Muster-Kontaktperson (KEINE echten Personen) - zeigt beide Zeilen-
  // formate: „Name (Rolle), Ort, Tel. …" (Arzt) und „Name (Rolle), Tel. …, … vorhanden" (Kontakt).
  sampleFill: () => ({
    state: 'function',
    rows: [
      { name: 'Dr. med. Muster', rolle: 'Hausarzt', ort: 'Musterstadt', telefon: '01234 56789' },
      { name: 'Erika Muster', rolle: 'Angehöriger', telefon: '0170 1234567', patientenverfuegung: true, vollmacht: true },
    ],
  }),
  renderBody(fill, config) {
    const texts = (rowsOf(fill) as ArztRow[]).filter((r) => r.name?.trim()).map(formatArzt)
    return layoutRows(texts, config)
  },
  hasData(fill) {
    return (rowsOf(fill) as ArztRow[]).some((r) => r.name?.trim())
  },
}

/** Genau die eine Score-Zeile eines Funktions-Fills (oder undefined). */
function scoreRow<T>(fill: FieldFill | undefined): T | undefined {
  return rowsOf(fill)[0] as T | undefined
}
/** Vollstaendige Pack-Years-Eingabe? (beide Zahlen >= 0). */
function packYearsComplete(r: PackYearsRow | undefined): r is Required<PackYearsRow> {
  return !!r && Number.isFinite(r.cigarettesPerDay) && r.cigarettesPerDay! >= 0 && Number.isFinite(r.years) && r.years! >= 0
}

/** Pack-Years: Eingaben Zigaretten/Tag + Jahre -> abgeleitete Packungsjahre. Ausgabe „mit
 *  Kernwerten": „22,5 py (30/Tag, 15 J.)"; der Titel kommt wie bei jedem Knoten
 *  aus dem FunctionNode (renderFunction). Rechenkern scores.packYears bleibt unveraendert. */
const packYearsFn: FunctionDef = {
  label: 'Pack-Years',
  lineEnd: { standard: '', label: 'Zeilenende' },
  singleLine: true,
  // Editor-Vorschau: 30 Zig./Tag × 15 J. = 22,5 -> „ca. 23 py" (zeigt das gerundete Format inkl. „ca.").
  sampleFill: () => ({ state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] }),
  renderBody(fill, config) {
    const r = scoreRow<PackYearsRow>(fill)
    if (!packYearsComplete(r)) return ''
    const { raw } = packYears({ cigarettesPerDay: r.cigarettesPerDay, years: r.years })
    return applyLineEnd(`${packYearsShort(raw)} (${r.cigarettesPerDay}/Tag, ${r.years} J.)`, '', config)
  },
  hasData(fill) {
    return packYearsComplete(scoreRow<PackYearsRow>(fill))
  },
}

/** Vollstaendige NEWS2-Eingabe? (5 Vitalzahlen endlich UND ACVPU gesetzt). scores.news2 wirft sonst -
 *  darum VOR dem Aufruf pruefen (wie packYearsComplete). onOxygen/scale2 sind optionale Booleans. */
function news2Complete(r: NEWS2Row | undefined): r is NEWS2Row & Required<Pick<NEWS2Row, 'rr' | 'spo2' | 'systolic' | 'pulse' | 'temp' | 'consciousness'>> {
  if (!r) return false
  if (![r.rr, r.spo2, r.systolic, r.pulse, r.temp].every((n) => Number.isFinite(n))) return false
  return !!r.consciousness && ['A', 'C', 'V', 'P', 'U'].includes(r.consciousness)
}

/** NEWS2: die RCP-2017-Parameter -> Aggregat-Score + Risiko. Ausgabe NUR Score + Risiko:
 *  die Vitalwerte stehen im Protokoll ohnehin separat, daher keine Wiederholung.
 *  Rechenkern + Schwellen sind quellenbelegt (docs/medical-sources.md, RCP 2017) und bleiben unveraendert;
 *  scale2 = SpO2-Skala 2 (aerztlich dokumentiertes Ziel 88-92 %, z. B. COPD; als Risiko-Zusatz vermerkt).
 *  Der Titel kommt wie bei jedem Knoten aus dem FunctionNode (renderFunction). */
const news2Fn: FunctionDef = {
  label: 'NEWS2',
  lineEnd: { standard: '', label: 'Zeilenende' },
  singleLine: true,
  // Editor-Vorschau: moderate Beispielwerte -> „6 (Risiko mittel)".
  sampleFill: () => ({ state: 'function', rows: [{ rr: 22, spo2: 92, systolic: 108, pulse: 95, temp: 37.0, consciousness: 'A', onOxygen: false, scale2: false }] }),
  renderBody(fill, config) {
    const r = scoreRow<NEWS2Row>(fill)
    if (!news2Complete(r)) return ''
    // .body = NUR Score + Risiko (die Vitalwerte stehen separat im Protokoll); der FunctionNode-Titel liefert das Label.
    return applyLineEnd(news2({ rr: r.rr, spo2: r.spo2, systolic: r.systolic, pulse: r.pulse, temp: r.temp, consciousness: r.consciousness, onOxygen: r.onOxygen, scale2: r.scale2 }).body, '', config)
  },
  hasData(fill) {
    return news2Complete(scoreRow<NEWS2Row>(fill))
  },
  // Ampel fuer die Einsatz-Anzeige: niedrig -> gruen, mittel -> gelb, hoch -> rot (nur App, nicht der Text).
  accent(fill) {
    const r = scoreRow<NEWS2Row>(fill)
    if (!news2Complete(r)) return undefined
    const { risk } = news2({ rr: r.rr, spo2: r.spo2, systolic: r.systolic, pulse: r.pulse, temp: r.temp, consciousness: r.consciousness, onOxygen: r.onOxygen, scale2: r.scale2 })
    return risk === 'hoch' ? 'error' : risk === 'mittel' ? 'warning' : 'success'
  },
}

/** Vollstaendige LAMS-Eingabe? (alle drei Befunde gewaehlt, je im gueltigen Bereich). scores.lams wirft
 *  sonst - darum VOR dem Aufruf pruefen (wie news2Complete). */
function lamsComplete(r: LAMSRow | undefined): r is Required<LAMSRow> {
  return !!r && [0, 1].includes(r.lamsFace as number) && [0, 1, 2].includes(r.lamsArm as number) && [0, 1, 2].includes(r.lamsGrip as number)
}

/** LAMS (Los Angeles Motor Scale): drei motorische Befunde -> Summe 0-5, ab 4 Hinweis auf proximalen
 *  Gefaessverschluss. Ausgabe MIT Befunden: „4/5 (Fazialisparese, Arm fällt sofort, Händedruck schwach)
 *  - V. a. proximalen Verschluss (LVO)". Rechenkern + Schwelle sind quellenbelegt
 *  (docs/medical-sources.md, Llanes 2004 / Nour 2018) und bleiben unveraendert. */
const lamsFn: FunctionDef = {
  label: 'LAMS',
  lineEnd: { standard: '', label: 'Zeilenende' },
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  // Editor-Vorschau: 1 + 2 + 1 = 4 -> zeigt Befunde UND den LVO-Hinweis.
  sampleFill: () => ({ state: 'function', rows: [{ lamsFace: 1, lamsArm: 2, lamsGrip: 1 }] }),
  renderBody(fill, config) {
    const r = scoreRow<LAMSRow>(fill)
    if (!lamsComplete(r)) return ''
    return applyLineEnd(lams({ face: r.lamsFace, arm: r.lamsArm, grip: r.lamsGrip }).body, '', config)
  },
  hasData(fill) {
    return lamsComplete(scoreRow<LAMSRow>(fill))
  },
  // Ampel fuer die Einsatz-Anzeige: 0 -> gruen, 1-3 -> gelb, ab 4 (LVO-Hinweis) -> rot (nur App, nicht der Text).
  accent(fill) {
    const r = scoreRow<LAMSRow>(fill)
    if (!lamsComplete(r)) return undefined
    const { score, lvoSuspected } = lams({ face: r.lamsFace, arm: r.lamsArm, grip: r.lamsGrip })
    return lvoSuspected ? 'error' : score >= 1 ? 'warning' : 'success'
  },
}

// Zeichen, Werte und die Zuordnung Zeile -> Rechenkern kommen aus der einen Quelle (tools/fast4dDefs.mjs).
function fast4dResult(r: Fast4dCompleteRow): ReturnType<typeof fast4d> {
  return fast4d(fast4dInput(r))
}

/** FAST4D (Schlaganfall-Screening): sieben Befunde, positiv ab EINEM auffaelligen. KEIN Punktescore und
 *  bewusst OHNE Schwelle/Zuweisungshinweis (die Studie nennt keinen Cut-off, docs/medical-sources.md,
 *  Claudi et al. 2024). Ausgabe MIT Befunden: „positiv (3/7): Fazialisparese rechts, …; nicht prüfbar:
 *  …. Symptombeginn 14:30." Die Zeit steht in der Zeile, zaehlt aber nicht zum Ergebnis. */
const fast4dFn: FunctionDef = {
  label: 'FAST4D',
  lineEnd: { standard: '.', label: 'Zeilenende' },
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  // Editor-Vorschau: zeigt Befunde mit Seite, „nicht prüfbar" und die Zeitangabe.
  sampleFill: () => ({
    state: 'function',
    rows: [{
      fastFace: 'pos', fastArm: 'pos', fastSpeech: 'neg', fastDiplopia: 'pos', fastField: 'neg', fastVertigo: 'neg', fastAtaxia: 'na',
      fastFaceSide: 're', fastArmSide: 're', fastTimeMode: 'onset', fastTime: '14:30',
    }],
  }),
  renderBody(fill, config) {
    const r = scoreRow<FAST4DRow>(fill)
    if (!fast4dComplete(r)) return ''
    return applyLineEnd(fast4dResult(r).body, '.', config)
  },
  hasData(fill) {
    return fast4dComplete(scoreRow<FAST4DRow>(fill))
  },
  // Ampel fuer die Einsatz-Anzeige: mindestens ein Zeichen auffaellig -> gelb; ALLE sieben unauffaellig
  // -> gruen; nichts auffaellig, aber etwas nicht pruefbar -> keine Farbe (Gruen hiesse sonst „Screening
  // unauffaellig", obwohl es nur zum Teil stattfand). Kein Rot: ohne belegte Schwelle gibt es keine
  // Abstufung nach Anzahl. Nur App, nicht der Text.
  accent(fill) {
    const r = scoreRow<FAST4DRow>(fill)
    if (!fast4dComplete(r)) return undefined
    const { positive, notTestable } = fast4dResult(r)
    if (positive) return 'warning'
    return notTestable.length === 0 ? 'success' : undefined
  },
}

const ZOPS_KEYS = ['zopsTime', 'zopsPlace', 'zopsPerson', 'zopsSituation'] as const
type ZopsCompleteRow = ZOPSRow & Required<Pick<ZOPSRow, (typeof ZOPS_KEYS)[number]>>

/** Vollstaendige ZOPS-Eingabe? (alle vier Punkte gewaehlt). scores.zops wirft sonst - darum VOR dem
 *  Aufruf pruefen (wie fast4dComplete). */
function zopsComplete(r: ZOPSRow | undefined): r is ZopsCompleteRow {
  return !!r && ZOPS_KEYS.every((k) => ['ok', 'no', 'na'].includes(r[k] as string))
}
function zopsResult(r: ZopsCompleteRow): ReturnType<typeof zops> {
  return zops({ time: r.zopsTime, place: r.zopsPlace, person: r.zopsPerson, situation: r.zopsSituation })
}

/** ZOPS (Orientierung zu Zeit, Ort, Person, Situation): vier Befunde, KEIN Punktwert, keine Schwelle.
 *  Die Ausgabe nennt nur die Abweichung: „orientiert." im Normalfall, sonst „nicht orientiert zu: Zeit;
 *  nicht prüfbar: Situation." (docs/medical-sources.md). */
const zopsFn: FunctionDef = {
  label: 'ZOPS',
  lineEnd: { standard: '.', label: 'Zeilenende' },
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  // Editor-Vorschau: zeigt eine Abweichung und einen nicht pruefbaren Punkt.
  sampleFill: () => ({
    state: 'function',
    rows: [{ zopsTime: 'no', zopsPlace: 'ok', zopsPerson: 'ok', zopsSituation: 'na' }],
  }),
  renderBody(fill, config) {
    const r = scoreRow<ZOPSRow>(fill)
    if (!zopsComplete(r)) return ''
    return applyLineEnd(zopsResult(r).body, '.', config)
  },
  hasData(fill) {
    return zopsComplete(scoreRow<ZOPSRow>(fill))
  },
  // Ampel wie bei FAST4D: mindestens ein Punkt nicht orientiert -> gelb; zu ALLEN vier orientiert ->
  // gruen; nichts auffaellig, aber etwas nicht pruefbar -> keine Farbe. Kein Rot: es gibt keine
  // Abstufung nach Anzahl. Nur App, nicht der Text.
  accent(fill) {
    const r = scoreRow<ZOPSRow>(fill)
    if (!zopsComplete(r)) return undefined
    const { oriented, notOriented } = zopsResult(r)
    if (notOriented.length) return 'warning'
    return oriented ? 'success' : undefined
  },
}

const SGARBOSSA_KEYS = ['sgbConcordantElevation', 'sgbConcordantDepression', 'sgbDiscordantElevation'] as const
type SgarbossaCompleteRow = SgarbossaRow & Required<Pick<SgarbossaRow, (typeof SGARBOSSA_KEYS)[number]>>

/** Vollstaendige Sgarbossa-Eingabe? (alle drei Kriterien gewaehlt). scores.sgarbossa wirft sonst. */
function sgarbossaComplete(r: SgarbossaRow | undefined): r is SgarbossaCompleteRow {
  return !!r && SGARBOSSA_KEYS.every((k) => ['pos', 'neg', 'na'].includes(r[k] as string))
}
function sgarbossaResult(r: SgarbossaCompleteRow, config?: FunctionConfig): ReturnType<typeof sgarbossa> {
  return sgarbossa({
    concordantElevation: r.sgbConcordantElevation,
    concordantDepression: r.sgbConcordantDepression,
    discordantElevation: r.sgbDiscordantElevation,
  }, config?.lineEnd)
}

/** Sgarbossa-Kriterien, modifiziert nach Smith (Infarktzeichen bei Linksschenkelblock oder
 *  Schrittmacher-Rhythmus): drei gleichwertige Kriterien, positiv ab EINEM, kein Punktwert
 *  (docs/medical-sources.md: Sgarbossa 1996, Smith 2012). Ein negatives Ergebnis schliesst einen
 *  Verschluss nicht aus - darum wird negativ nie gruen, und das Eingabeblatt zeigt dann den Hinweis
 *  (SGARBOSSA_NEGATIVE_HINT) bei der Auswertung. */
const sgarbossaFn: FunctionDef = {
  label: 'Sgarbossa (mod. nach Smith)',
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  lineEnd: { standard: '.', label: 'Zeilenende' },
  // Editor-Vorschau: ein erfuelltes und ein nicht beurteilbares Kriterium.
  sampleFill: () => ({
    state: 'function',
    rows: [{ sgbConcordantElevation: 'pos', sgbConcordantDepression: 'neg', sgbDiscordantElevation: 'na' }],
  }),
  renderBody(fill, config) {
    const r = scoreRow<SgarbossaRow>(fill)
    if (!sgarbossaComplete(r)) return ''
    return sgarbossaResult(r, config).body
  },
  hasData(fill) {
    return sgarbossaComplete(scoreRow<SgarbossaRow>(fill))
  },
  // Ampel: mindestens ein Kriterium erfuellt -> rot (belegte Regel: ein Kriterium genuegt). Negativ
  // bekommt KEINE Farbe und nie Gruen: es schliesst einen Verschluss nicht aus. Nur App, nicht der Text.
  accent(fill) {
    const r = scoreRow<SgarbossaRow>(fill)
    if (!sgarbossaComplete(r)) return undefined
    return sgarbossaResult(r).positive ? 'error' : undefined
  },
}

const EGSYS_KEYS = ['egsysPalpitations', 'egsysHeartDisease', 'egsysEffort', 'egsysSupine', 'egsysTriggers', 'egsysProdromes'] as const
type EgsysCompleteRow = EGSYSRow & Required<Pick<EGSYSRow, (typeof EGSYS_KEYS)[number]>>

/** Vollstaendige EGSYS-Eingabe? (alle sechs Punkte beantwortet). scores.egsys wirft sonst. */
function egsysComplete(r: EGSYSRow | undefined): r is EgsysCompleteRow {
  return !!r && EGSYS_KEYS.every((k) => r[k] === 'yes' || r[k] === 'no')
}
function egsysResult(r: EgsysCompleteRow, config?: FunctionConfig): ReturnType<typeof egsys> {
  return egsys({
    palpitations: r.egsysPalpitations,
    heartDisease: r.egsysHeartDisease,
    effort: r.egsysEffort,
    supine: r.egsysSupine,
    triggers: r.egsysTriggers,
    prodromes: r.egsysProdromes,
  }, config?.thresholdText, config?.lineEnd)
}

/** EGSYS (Synkope: Hinweise auf kardiale Ursache): sechs Anamnese-Punkte, Summe -2 bis +12, ab 3 Punkten
 *  einen Text, standardmaessig „- kardiale Synkope wahrscheinlich", in der Vorlage frei aenderbar
 *  (config.thresholdText; Del Rosso et al. 2008, docs/medical-sources.md). Ausgabe MIT Befunden wie bei
 *  LAMS. Unter 3 Punkten ist nichts ausgeschlossen - darum gibt es kein Gruen, und das Eingabeblatt
 *  zeigt dann den Hinweis (EGSYS_LOW_HINT) bei der Auswertung. */
const egsysFn: FunctionDef = {
  label: 'EGSYS',
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  thresholdText: { standard: EGSYS_DEFAULT_TEXT, label: 'Text ab 3 Punkten' },
  lineEnd: { standard: '.', label: 'Zeilenende' },
  // Editor-Vorschau: ueber der Schwelle, mit zwei Befunden.
  sampleFill: () => ({
    state: 'function',
    rows: [{ egsysPalpitations: 'yes', egsysHeartDisease: 'yes', egsysEffort: 'no', egsysSupine: 'no', egsysTriggers: 'no', egsysProdromes: 'no' }],
  }),
  renderBody(fill, config) {
    const r = scoreRow<EGSYSRow>(fill)
    if (!egsysComplete(r)) return ''
    return egsysResult(r, config).body
  },
  hasData(fill) {
    return egsysComplete(scoreRow<EGSYSRow>(fill))
  },
  // Ampel: ab 3 Punkten rot (belegte Schwelle). Darunter KEINE Farbe und nie Gruen: ein niedriger Wert
  // schliesst eine kardiale Synkope nicht aus. Nur App, nicht der Text.
  accent(fill) {
    const r = scoreRow<EGSYSRow>(fill)
    if (!egsysComplete(r)) return undefined
    return egsysResult(r).cardiacSuspected ? 'error' : undefined
  },
}

/** Vollstaendige BMI-Eingabe? Gewicht und Groesse endlich und > 0. scores.bmi wirft sonst. */
function bmiComplete(r: BMIRow | undefined): r is BMIRow & Required<BMIRow> {
  return !!r && Number.isFinite(r.bmiWeight) && r.bmiWeight! > 0 && Number.isFinite(r.bmiHeight) && r.bmiHeight! > 0
}

/** BMI (Body-Mass-Index): kg/m² mit WHO-Klasse fuer Erwachsene (docs/medical-sources.md, WHO TRS 894).
 *  Ausgabe wie der fruehere BMI-Rechner: „BMI 24,7 (Normalgewicht; 80 kg, 180 cm)". Keine Farbe: die
 *  Klasse ist eine Einordnung, keine Warnstufe. */
const bmiFn: FunctionDef = {
  label: 'BMI',
  singleLine: true,
  createDefaults: inlineTitleDefaults,
  lineEnd: { standard: '', label: 'Zeilenende' },
  sampleFill: () => ({ state: 'function', rows: [{ bmiWeight: 80, bmiHeight: 180 }] }),
  renderBody(fill, config) {
    const r = scoreRow<BMIRow>(fill)
    if (!bmiComplete(r)) return ''
    return applyLineEnd(bmi({ weightKg: r.bmiWeight, heightCm: r.bmiHeight }).body, '', config)
  },
  hasData(fill) {
    return bmiComplete(scoreRow<BMIRow>(fill))
  },
}

export const FUNCTION_REGISTRY: Record<FunctionKind, FunctionDef> = {
  medikamentenplan,
  aerzte,
  packYears: packYearsFn,
  news2: news2Fn,
  lams: lamsFn,
  fast4d: fast4dFn,
  zops: zopsFn,
  sgarbossa: sgarbossaFn,
  egsys: egsysFn,
  bmi: bmiFn,
}

/** Alle Funktionsarten in Anzeige-Reihenfolge - EINE Quelle für das ＋-Menü der App und den Katalog des
 *  Online-Editors (vorher drei getrennt gepflegte Listen). Reihenfolge = Reihenfolge in FUNCTION_REGISTRY. */
export const FUNCTION_KINDS = Object.keys(FUNCTION_REGISTRY) as FunctionKind[]
