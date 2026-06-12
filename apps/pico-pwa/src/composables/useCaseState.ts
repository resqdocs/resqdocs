import { reactive } from 'vue'
import type { ProtocolTemplate } from '@shared/renderer/render.mjs'
import {
  initCaseState,
  toggleActiveBlock,
  isBlockActive,
  type CaseState,
  type PointValue,
} from './caseState'

/**
 * Vue-Composable um den flüchtigen Einsatz-Zustand.
 *
 * Der Zustand lebt nur im Arbeitsspeicher (`reactive`) und wird NICHT persistiert.
 * Die Mutatoren bleiben dünne Wrapper um die reine Logik in `caseState.ts`.
 * Die Vorlage kommt als Getter (#44): beim Vorlagenwechsel initialisiert
 * `reset()` den Zustand aus der DANN aktuellen Vorlage.
 */
export function useCaseState(getProtocol: () => ProtocolTemplate) {
  const state = reactive<CaseState>(initCaseState(getProtocol()))

  function setVariable(id: string, value: unknown): void {
    state.variableValues[id] = value
  }

  function setValue(id: string, value: PointValue | undefined): void {
    if (value === undefined) {
      delete state.values[id]
    } else {
      state.values[id] = value
    }
  }

  function toggleBlock(blockId: string, on?: boolean): void {
    state.activeBlocks = toggleActiveBlock(state.activeBlocks, blockId, on)
  }

  function blockActive(blockId: string): boolean {
    return isBlockActive(state, blockId)
  }

  /** „Sitzung zurücksetzen": verwirft den gesamten flüchtigen Fall-Zustand. */
  function reset(): void {
    const fresh = initCaseState(getProtocol())
    state.variableValues = fresh.variableValues
    state.values = fresh.values
    state.activeBlocks = fresh.activeBlocks
  }

  return { state, setVariable, setValue, toggleBlock, blockActive, reset }
}
