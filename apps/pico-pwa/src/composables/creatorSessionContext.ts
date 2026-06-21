import { inject, type InjectionKey } from 'vue'
import { useCreatorSession } from './useCreatorSession'

/**
 * Provide/Inject-Entkopplung der Editier-Komponenten von der GLOBALEN Creator-
 * Session (#Variante-A, Slice A1). Die Editoren beziehen ihre Session künftig
 * über useCreatorSessionCtx() statt useCreatorSession() direkt.
 *
 * Ohne provide → Default-Factory liefert den globalen Singleton → Verhalten
 * EXAKT wie bisher (reines Refactoring). A2 kann später per provide(creatorSessionKey,
 * <Scratch-Session>) den Bausteine-Editor mit einer isolierten Session bedienen,
 * ohne die Editoren erneut anzufassen.
 */
export type CreatorSessionCtx = ReturnType<typeof useCreatorSession>

export const creatorSessionKey: InjectionKey<CreatorSessionCtx> = Symbol('creatorSession')

/** Session aus dem Inject-Kontext; ohne provide der globale Singleton (Default-Factory). */
export function useCreatorSessionCtx(): CreatorSessionCtx {
  return inject(creatorSessionKey, () => useCreatorSession(), true)
}
