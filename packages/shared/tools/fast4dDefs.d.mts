// Typen zu fast4dDefs.mjs (eine Quelle fuer die FAST4D-Definitionen).
import type { FAST4DRow, Fast4dBefund } from '../model.ts'
import type { Fast4dInput } from './scores.mjs'

export type Fast4dId = 'face' | 'arm' | 'speech' | 'diplopia' | 'field' | 'vertigo' | 'ataxia'
export type Fast4dBefundKey = 'fastFace' | 'fastArm' | 'fastSpeech' | 'fastDiplopia' | 'fastField' | 'fastVertigo' | 'fastAtaxia'
export type Fast4dSeite = 're' | 'li'
export type Fast4dZeitArt = 'onset' | 'lsw' | 'unknown'

export interface Fast4dZeichen {
  id: Fast4dId
  rowKey: Fast4dBefundKey
  sideKey?: 'fastFaceSide' | 'fastArmSide'
  text: string
}

export const FAST4D_BEFUNDE: readonly Fast4dBefund[]
export const FAST4D_SEITEN: readonly Fast4dSeite[]
export const FAST4D_ZEITARTEN: readonly Fast4dZeitArt[]
export const FAST4D_UHRZEIT: RegExp
export const FAST4D_ZEICHEN: readonly Fast4dZeichen[]
export const FAST4D_ZEIT_KEYS: { readonly mode: 'fastTimeMode'; readonly time: 'fastTime' }

export type Fast4dCompleteRow = FAST4DRow & Required<Pick<FAST4DRow, Fast4dBefundKey>>
export function fast4dComplete(row: FAST4DRow | undefined | null): row is Fast4dCompleteRow
export function fast4dInput(row: Fast4dCompleteRow): Fast4dInput
export function fast4dEnumFields(): Record<string, readonly string[]>
