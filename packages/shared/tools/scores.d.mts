// Typen der Feld-Tool-Rechenmodule (#55). Quellen siehe scores.mjs.

export function packYears(input: { cigarettesPerDay: number | string; years: number | string }): {
  value: number
  text: string
}

export function bmi(input: { weightKg: number | string; heightCm: number | string }): {
  value: number
  klass: string
  text: string
}

export function lams(input: { face: number | string; arm: number | string; grip: number | string }): {
  score: number
  lvoSuspected: boolean
  text: string
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
  text: string
}

export type EkgDeflection = 'pos' | 'neg'
export function ekgAxisTable(input: {
  leadI: EkgDeflection; leadII: EkgDeflection; leadIII: EkgDeflection
  rLarger?: 'I' | 'III' | 'unclear'
}): { typ: string | null; text: string }

export function signatureBlock(input?: { roles?: string[]; lineLength?: number; gap?: number }): string
