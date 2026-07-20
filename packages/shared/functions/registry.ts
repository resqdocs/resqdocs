// registry.ts — reine Funktions-Registry (Vue-frei, node-testbar). Jede Funktion liefert Anzeige-Label,
// Body-Render (Klartext der Daten, OHNE Titel) + hasData. Die Einsatz-Komponente (Vue) liegt getrennt
// (EinsatzFunction.vue), damit der pure Kern (render.ts/deviations.ts) testbar bleibt. Erweiterbar:
// eine neue Funktion = ein neuer FunctionKind + ein Eintrag hier (Kern bleibt unberuehrt).
import type { FunctionKind, FieldFill, MedikamenteRow, ArztRow, PackYearsRow, NEWS2Row, FunctionRow, FunctionConfig } from '../model.ts'
import { packYears, packYearsShort, news2 } from '../tools/scores.mjs'

/** Inline-Default fuer FUNKTIONS-Zeilen: Mittelpunkt statt DEFAULT_SEPARATOR ", " - das Komma ist
 *  seit dem Zeilenformat "Name Staerke, Schema" (#262) die Grenze INNERHALB einer Zeile; als
 *  Zeilen-Trenner waere es ambig (genau das ISMP-Fehlermuster, das das Format vermeidet). */
export const FUNCTION_ROW_INLINE_SEPARATOR = ' · '

export interface FunctionDef {
  /** Anzeige-Label (Editor-Knopf, Badge). */
  label: string
  /** Klartext der Funktions-Daten (OHNE Titel/Heading - das macht renderFunction). Leer -> entfaellt.
   *  config steuert Zeilen-Layout (untereinander/hintereinander, Trenner, Praefix/Suffix). */
  renderBody(fill: FieldFill | undefined, config?: FunctionConfig): string
  /** Hat die Funktion erfasste Daten? (Abweichungs-Zaehlung, Ausgabe-Filter.) */
  hasData(fill: FieldFill | undefined): boolean
  /** Einzeilige Funktion? Scores (Pack-Years/NEWS2) geben GENAU EINE Zeile aus -> inline-faehig wie ein
   *  Feld (#55). Listen-Funktionen (Medikamentenplan/Aerzte) sind mehrzeilig -> fehlt/false -> immer Block. */
  singleLine?: boolean
  /** Feste Beispiel-Eingabe NUR fuer die Editor-Vorschau (#55): der Nutzer gibt im Editor nichts ein,
   *  darum zeigt die Vorschau mit diesem Demo-Fill, WIE der Score mit Werten aussieht. Im Einsatz / der
   *  echten Ausgabe ungenutzt. Fehlt -> die Funktion erscheint in der Vorschau leer (wie ein Feld ohne
   *  Default). */
  sampleFill?(): FieldFill
  /** Optionaler Ampel-Farbakzent fuer die EINSATZ-Anzeige (daisyUI-Semantik). Nur Scores mit Risiko-Stufe
   *  (NEWS2: niedrig->success, mittel->warning, hoch->error). Rein visuell in der App - die Text-/Export-
   *  Ausgabe traegt keine Farbe. Fehlt/undefined -> kein Farbakzent. */
  accent?(fill: FieldFill | undefined): 'success' | 'warning' | 'error' | undefined
}

function rowsOf(fill: FieldFill | undefined): FunctionRow[] {
  return fill?.state === 'function' ? fill.rows : []
}

/** Block/Inline-Layout (gemeinsam fuer alle Funktionen): inline = eine Zeile mit Trenner,
 *  block (Default) = je Zeile, optional Praefix/Suffix. */
function layoutRows(texts: string[], config?: FunctionConfig): string {
  if (!texts.length) return ''
  if (config?.rowLayout === 'inline') {
    return texts.join(config.rowSeparator ?? FUNCTION_ROW_INLINE_SEPARATOR)
  }
  const pre = config?.rowPrefix ?? ''
  const suf = config?.rowSuffix ?? ''
  return texts.map((t) => `${pre}${t}${suf}`).join('\n')
}

/** Eine Medikamenten-Zeile als Klartext: "Name Staerke, Schema (Hinweis)". Quellenbelegt (#262):
 *  Reihenfolge = BMP-Spaltenfolge (KBV Anlage 3 zur BMP-Vereinbarung); Name+Staerke bilden eine
 *  feste Einheit (Leerzeichen); das Komma setzt das Dosierschema IMMER sichtbar ab - auch ohne
 *  Staerke ("Ramipril 5, 1-0-0"): die KBV-Rezept-FAQ verlangt eine sichtbare Abtrennung der
 *  Dosierung, und zwei nackte Zahlengruppen nebeneinander sind ein belegtes Fehlermuster (ISMP).
 *  Namenlos-robust (#260): keine fuehrenden Trenner; die AUSGABE filtert namenlose weiterhin. */
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

/** Traegt die Zeile IRGENDEINE Nutzereingabe? Basis fuer Loesch-Schutz (#260) UND Aufraeum-Filter der
 *  Einsatz-Komponenten: Zeilen mit Eingaben nie stumm verwerfen. Bewusst breiter als hasData/renderBody
 *  (die auf den Namen filtern): eine namenlose Zeile mit Dosierung ist in der AUSGABE unsichtbar,
 *  in UI/Entwurf aber vorhandene Nutzerarbeit. */
export function medikamentRowHasData(r: MedikamenteRow): boolean {
  return !!(r.name.trim() || r.staerke?.trim() || r.dosierung?.trim() || r.kommentar?.trim() || r.pzn?.trim())
}

/** Staerke-Vorschlag aus der Bibliothek nur uebernehmen, wenn der Name sie nicht schon traegt
 *  (Label "Ibuflam 400 mg" + staerke "400 mg" wuerde sonst doppelt dokumentiert, #262). */
export function staerkeOhneDuplikat(name: string, staerke: string | undefined): string | undefined {
  const st = staerke?.trim()
  if (!st) return undefined
  return name.toLowerCase().includes(st.toLowerCase()) ? undefined : st
}

export function arztRowHasData(r: ArztRow): boolean {
  return !!(r.name.trim() || r.rolle || r.ort?.trim() || r.telefon?.trim() || r.arztnummer?.trim() || r.patientenverfuegung || r.vollmacht)
}

const medikamentenplan: FunctionDef = {
  label: 'Medikamentenplan',
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
  label: 'Ärzte & Kontaktpersonen',
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

/** Pack-Years (#55-Rework): Eingaben Zigaretten/Tag + Jahre -> abgeleitete Packungsjahre. Ausgabe „mit
 *  Kernwerten" (Maintainer 2026-07-03): „22,5 py (30/Tag, 15 J.)"; der Titel kommt wie bei jedem Knoten
 *  aus dem FunctionNode (renderFunction). Rechenkern scores.packYears bleibt unveraendert. */
const packYearsFn: FunctionDef = {
  label: 'Pack-Years',
  singleLine: true,
  // Editor-Vorschau: 30 Zig./Tag × 15 J. = 22,5 -> „ca. 23 py" (zeigt das gerundete Format inkl. „ca.").
  sampleFill: () => ({ state: 'function', rows: [{ cigarettesPerDay: 30, years: 15 }] }),
  renderBody(fill) {
    const r = scoreRow<PackYearsRow>(fill)
    if (!packYearsComplete(r)) return ''
    const { raw } = packYears({ cigarettesPerDay: r.cigarettesPerDay, years: r.years })
    return `${packYearsShort(raw)} (${r.cigarettesPerDay}/Tag, ${r.years} J.)`
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

/** NEWS2 (#55-Rework): die RCP-2017-Parameter -> Aggregat-Score + Risiko. Ausgabe NUR Score + Risiko
 *  (Maintainer 2026-07-03): die Vitalwerte stehen im Protokoll ohnehin separat, daher keine Wiederholung.
 *  Rechenkern + Schwellen sind quellenbelegt (docs/medical-sources.md, RCP 2017) und bleiben unveraendert;
 *  scale2 = SpO2-Skala 2 (aerztlich dokumentiertes Ziel 88-92 %, z. B. COPD; als Risiko-Zusatz vermerkt).
 *  Der Titel kommt wie bei jedem Knoten aus dem FunctionNode (renderFunction). */
const news2Fn: FunctionDef = {
  label: 'NEWS2',
  singleLine: true,
  // Editor-Vorschau: moderate Beispielwerte -> „6 (Risiko mittel)".
  sampleFill: () => ({ state: 'function', rows: [{ rr: 22, spo2: 92, systolic: 108, pulse: 95, temp: 37.0, consciousness: 'A', onOxygen: false, scale2: false }] }),
  renderBody(fill) {
    const r = scoreRow<NEWS2Row>(fill)
    if (!news2Complete(r)) return ''
    // .body = NUR Score + Risiko (die Vitalwerte stehen separat im Protokoll); der FunctionNode-Titel liefert das Label.
    return news2({ rr: r.rr, spo2: r.spo2, systolic: r.systolic, pulse: r.pulse, temp: r.temp, consciousness: r.consciousness, onOxygen: r.onOxygen, scale2: r.scale2 }).body
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

export const FUNCTION_REGISTRY: Record<FunctionKind, FunctionDef> = {
  medikamentenplan,
  aerzte,
  packYears: packYearsFn,
  news2: news2Fn,
}
