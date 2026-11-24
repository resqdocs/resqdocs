// importNote.ts — wo der Hinweis nach dem Übernehmen eines Imports hinzeigt.
//
// Der Hinweis nennt nur Tabs, in denen man gerade NICHT ist: Wer im Tab Vorlagen eine Vorlage übernimmt, sieht sie
// schon und braucht kein „Du findest sie in Vorlagen“.
import type { AppTab } from '@/composables/useActiveTab'

/** Was übernommen wurde: nur Vorlagen, nur Inhalte des Tabs Bausteine oder beides. */
export type ImportZiel = 'vorlagen' | 'bausteine' | 'beide'

/**
 * Welcher Ortshinweis folgt:
 * - 'keiner': man ist schon dort.
 * - 'vorlagen' / 'bausteine': „Du findest sie in …“ (alles Übernommene liegt in diesem Tab).
 * - 'nurVorlagen' / 'nurBausteine': bei einer Sammlung nur der Teil, der woanders liegt.
 * - 'beide': beide Tabs.
 */
export type ImportOrt = 'keiner' | 'vorlagen' | 'bausteine' | 'nurVorlagen' | 'nurBausteine' | 'beide'

export function importOrt(ziel: ImportZiel, aktiv: AppTab): ImportOrt {
  const inVorlagen = aktiv === 'protokolle'
  const inBausteine = aktiv === 'bausteine'
  if (ziel === 'vorlagen') return inVorlagen ? 'keiner' : 'vorlagen'
  if (ziel === 'bausteine') return inBausteine ? 'keiner' : 'bausteine'
  if (inVorlagen) return 'nurBausteine'
  if (inBausteine) return 'nurVorlagen'
  return 'beide'
}
