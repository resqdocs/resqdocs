// Typen der Feld-Tool-Rechenmodule. Quellen siehe scores.mjs.

export function packYears(input: { cigarettesPerDay: number | string; years: number | string }): {
  value: number
  raw: number
  text: string
}

/** Rework-Kurzform: kaufmaennisch gerundete GANZE Packungsjahre, „≈" wenn gerundet. */
export function packYearsShort(raw: number): string

export function bmi(input: { weightKg: number | string; heightCm: number | string }): {
  value: number
  /** WHO-Klasse fuer Erwachsene. */
  klass: string
  /** „BMI 24,7 (Normalgewicht; 80 kg, 180 cm)" (mit Praefix). */
  text: string
  /** Wie text, OHNE „BMI"-Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}

export function lams(input: { face: number | string; arm: number | string; grip: number | string }): {
  score: number
  lvoSuspected: boolean
  /** „LAMS <Score>/5 (Befunde)[ - V. a. proximalen Verschluss (LVO)]" (mit Praefix; Alt-Tool). */
  text: string
  /** Wie text, OHNE „LAMS"-Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}

export type Fast4dFinding = 'neg' | 'pos' | 'na'
export interface Fast4dInput {
  face: Fast4dFinding
  arm: Fast4dFinding
  speech: Fast4dFinding
  diplopia: Fast4dFinding
  field: Fast4dFinding
  vertigo: Fast4dFinding
  ataxia: Fast4dFinding
  faceSide?: 're' | 'li'
  armSide?: 're' | 'li'
  timeMode?: 'onset' | 'lsw' | 'unknown'
  /** 'HH:MM'; nur bei timeMode onset/lsw ausgegeben. */
  time?: string
}

export function fast4d(input: Fast4dInput): {
  /** Mindestens ein Zeichen auffaellig. */
  positive: boolean
  /** Anzahl auffaelliger Zeichen (0-7). */
  count: number
  /** Alle sieben Zeichen „nicht pruefbar". */
  untestable: boolean
  findings: string[]
  notTestable: string[]
  timeText: string
  /** „FAST4D positiv (n/7): …" (mit Praefix). */
  text: string
  /** Wie text, OHNE „FAST4D"-Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}

export interface News2Input {
  rr: number | string
  spo2: number | string
  scale2?: boolean
  onOxygen?: boolean
  systolic: number | string
  pulse: number | string
  temp: number | string
  consciousness: 'A' | 'C' | 'V' | 'P' | 'U' | string
}

export function news2(input: News2Input): {
  score: number
  items: Record<string, number>
  risk: string
  anySingle3: boolean
  /** „NEWS2 <Score> (Risiko …) - Kernwerte" (mit Praefix + Vitalwerten; Alt-Tool). */
  text: string
  /** „<Score> (Risiko …)" - NUR Score + Risiko (Rework: Vitalwerte stehen separat im Protokoll). */
  body: string
}

export type EkgDeflection = 'pos' | 'neg'
export function ekgAxisTable(input: {
  leadI: EkgDeflection; leadII: EkgDeflection; leadIII: EkgDeflection
  rLarger?: 'I' | 'III' | 'unclear'
}): { typ: string | null; text: string }

export function signatureBlock(input?: { roles?: string[]; lineLength?: number; gap?: number }): string

export type ZopsFinding = 'ok' | 'no' | 'na'
export interface ZopsInput {
  time: ZopsFinding
  place: ZopsFinding
  person: ZopsFinding
  situation: ZopsFinding
}

export function zops(input: ZopsInput): {
  /** Zu allen vier Punkten orientiert. */
  oriented: boolean
  /** Alle vier Punkte „nicht pruefbar". */
  untestable: boolean
  orientedTo: string[]
  notOriented: string[]
  notTestable: string[]
  /** „ZOPS orientiert." / „ZOPS nicht orientiert zu: …" (mit Praefix). */
  text: string
  /** Wie text, OHNE „ZOPS"-Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}

export type SgarbossaFinding = 'pos' | 'neg' | 'na'
export interface SgarbossaInput {
  concordantElevation: SgarbossaFinding
  concordantDepression: SgarbossaFinding
  discordantElevation: SgarbossaFinding
}

/** Pflicht-Hinweis der App bei negativem Ergebnis; steht nie im Protokolltext. */
export const SGARBOSSA_NEGATIVE_HINT: string

/** @param lineEnd Zeichen am Ende der Zeile; fehlt -> '.', leer -> nichts. */
export function sgarbossa(input: SgarbossaInput, lineEnd?: string): {
  /** Mindestens ein Kriterium erfuellt. */
  positive: boolean
  /** Kein Kriterium erfuellt und mindestens eines beurteilbar. */
  negative: boolean
  /** Anzahl erfuellter Kriterien (0-3). */
  count: number
  /** Alle drei Kriterien „nicht beurteilbar". */
  untestable: boolean
  findings: string[]
  notAssessable: string[]
  /** „Sgarbossa (mod. nach Smith) positiv: …" (mit Praefix). */
  text: string
  /** Wie text, OHNE Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}

export type EgsysAnswer = 'yes' | 'no'
export interface EgsysInput {
  /** Palpitationen vor der Synkope (+4). */
  palpitations: EgsysAnswer
  /** Herzerkrankung und/oder auffaelliges EKG (+3). */
  heartDisease: EgsysAnswer
  /** Synkope bei Belastung (+3). */
  effort: EgsysAnswer
  /** Synkope im Liegen (+2). */
  supine: EgsysAnswer
  /** Ausloeser oder beguenstigende Umstaende (-1). */
  triggers: EgsysAnswer
  /** Vegetative Prodromi (-1). */
  prodromes: EgsysAnswer
}

export const EGSYS_THRESHOLD: number
/** Hinweis der App bei einem Ergebnis unter der Schwelle; steht nie im Protokolltext. */
export const EGSYS_LOW_HINT: string
/** Standardtext ab der Schwelle („- kardiale Synkope wahrscheinlich"). */
export const EGSYS_DEFAULT_TEXT: string

/** @param thresholdText Text ab 3 Punkten; fehlt oder leer -> EGSYS_DEFAULT_TEXT.
 *  @param lineEnd Zeichen am Ende der Zeile; fehlt -> '.', leer -> nichts. */
export function egsys(input: EgsysInput, thresholdText?: string, lineEnd?: string): {
  /** Summe, -2 bis +12. */
  score: number
  /** score >= 3 (Del Rosso 2008). */
  cardiacSuspected: boolean
  findings: string[]
  /** „EGSYS 7 Punkte (…) - kardiale Synkope wahrscheinlich." (mit Praefix). */
  text: string
  /** Wie text, OHNE „EGSYS"-Praefix (Funktion: das Label liefert der Knoten-Titel). */
  body: string
}
