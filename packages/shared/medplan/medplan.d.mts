// Typen des BMP-UKF-Parsers (#9, #144). Siehe medplan.mjs fuer die Datenschutz-
// Garantien: P/C/O-Elemente (Patient/Custodian/Observation) werden NIE
// extrahiert; vom A-Element (Aussteller) nur Name/Ort/Nummer/Telefon.

/** Ein Wirkstoff einer Medikationszeile (W-Element). */
export interface MedplanWirkstoff {
  wirkstoff: string
  /** Wirkstaerke Freitext (z. B. "600 mg"). */
  staerke?: string
}

/** Dosierschema einer Medikationszeile (m/d/v/h bzw. t-Freitext). */
export interface MedplanDosierung {
  morgens?: string
  mittags?: string
  abends?: string
  zurNacht?: string
  /** Dosierschema-Freitext (gewinnt gegenueber m-d-v-h). */
  freitext?: string
}

/** Eine Medikationszeile (M-Element) - ausschliesslich Medikament + Dosierung. */
export interface MedplanMedication {
  /** Modifizierte PZN (oft das EINZIGE Identifikationsmerkmal im Code). */
  pzn?: string
  /** Arzneimittelname Klartext (a-Attribut, haeufig nicht gesetzt). */
  name?: string
  wirkstoffe: MedplanWirkstoff[]
  /** Darreichungsform: Freitext (fd) oder aufgeloester Code (f). */
  darreichungsform?: string
  dosierung: MedplanDosierung
  /** Dosiereinheit: Freitext (dud) oder aufgeloester Code (du). */
  dosiereinheit?: string
  hinweis?: string
  grund?: string
  /** Gebundene Zusatzzeile (x-Attribut). */
  zusatzzeile?: string
  /** Zwischenueberschrift des Abschnitts (S t="...") falls vorhanden. */
  abschnitt?: string
  /** Zwischenueberschrift-Code (S c="...", KBV-Schluesseltabelle). */
  abschnittCode?: string
}

/** Aussteller des Plans (A-Element, #144) - Praxis/Apotheke/Krankenhaus, kein Patientendatum. */
export interface MedplanAussteller {
  name: string
  ort?: string
  /** LANR (Arzt, 9-stellig) | Apotheken-IDF (7) | Krankenhaus-IK (9). */
  nummer?: { typ: 'LANR' | 'Apotheken-IDF' | 'Krankenhaus-IK'; wert: string }
  telefon?: string
}

/** Ergebnis eines Scans: Seiteninfo (mehrseitige Plaene!) + Medikationszeilen + Aussteller. */
export interface MedplanParseResult {
  /** a/z aus der MP-Wurzel: aktuelle Seite / Gesamtseiten (je 1, wenn fehlend). */
  page: { current: number; total: number }
  medications: MedplanMedication[]
  aussteller?: MedplanAussteller
}

/** S_BMP_DOSIEREINHEIT_V1.01: Code -> Anzeigename. */
export const DOSIEREINHEIT: Readonly<Record<string, string>>
/** S_BMP_DARREICHUNGSFORM_V1.02 (haeufige Codes): Code -> Kurzname. */
export const DARREICHUNGSFORM: Readonly<Record<string, string>>

/** Parst einen BMP-UKF-String; wirft bei fehlender MP-Wurzel. */
export function parseMedplanMedications(ukf: string): MedplanParseResult
/** Dosierschema als "m-d-v-h" bzw. Freitext. */
export function dosierungToText(d: MedplanDosierung | undefined): string
/** Eine Medikationszeile als tippbarer Klartext. */
export function medicationToText(med: MedplanMedication): string
/** Eine Medikationszeile strukturiert fuers medikamente-Element (#146); fuehrt die
 *  Roh-PZN „im Hintergrund" mit (#184), falls vorhanden. */
export function medicationToRow(med: MedplanMedication): { name: string; dosierung: string; kommentar: string; pzn?: string }
/** Alle Zeilen als Textblock (eine Zeile pro Medikament). */
export function medplanToText(parsed: MedplanParseResult): string
/** Aussteller-Zeile fuers Protokoll, Rolle waehlt der Nutzer (#144). */
export function ausstellerToText(aussteller: MedplanAussteller, rolle: string): string
