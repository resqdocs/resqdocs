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
  klass: string
  text: string
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
