import { computed, ref } from 'vue'
import { render, type ProtocolTemplate, type ProtocolBlock } from '@shared/renderer/render.mjs'
import {
  buildContext,
  isBlockVisible,
  getVisiblePoints,
  resolveText as runtimeResolveText,
} from '@shared/renderer/runtime.mjs'
import { standardprotokoll } from '@/data/protocols'
import { useCaseState } from './useCaseState'
import { useCreatorSession } from './useCreatorSession'
import { useStorage } from '@/storage/useStorage'

/**
 * Laufzeit-/Einsatzansicht: bindet eine Protokoll-Vorlage an einen flüchtigen
 * Einsatz-Zustand und erzeugt daraus per Renderer die Klartext-Vorschau.
 *
 * Vorlagen-Quelle (#44): die GETEILTE Creator-Session - damit sind bearbeitete,
 * importierte und aus der Bibliothek geladene Protokolle im Einsatz nutzbar,
 * und Editor-Änderungen an der gewählten Vorlage wirken live. Default bleibt
 * das (Session-)Standardprotokoll.
 *
 * Sichtbarkeit (Blöcke/Punkte) wird über die GEMEINSAME runtime.mjs ausgewertet —
 * dieselbe Logik wie im Renderer. So bleiben Eingabemaske und Vorschau konsistent
 * und `visibleIf` ist nicht doppelt implementiert.
 *
 * Dies ist NICHT der Protokoll-Kreator (#13) — die Vorlage wird nur verwendet.
 */
export function useProtocolRuntime() {
  const creator = useCreatorSession()
  const storage = useStorage()
  // Überschriftenmuster (#68) aus den App-Einstellungen - reaktiv.
  const heading = () => ({
    pattern: storage.settings.headingPattern,
    fill: storage.settings.headingFill,
    width: storage.settings.headingWidth,
  })

  const availableProtocols = computed(() => creator.session.protocols as ProtocolTemplate[])

  // Bewusste Laufzeit-Wahl in dieser Session (null = noch keine → Standard greift).
  const pickedProtocolId = ref<string | null>(null)
  // Persönlicher Standard aus den Einstellungen — nur gültig, wenn vorhanden.
  const defaultProtocolId = computed<string | null>(() => {
    const d = storage.settings.defaultProtocolId
    return d && availableProtocols.value.some((p) => p.id === d) ? d : null
  })
  /**
   * Im Einsatz wirksame Vorlage. Vorrang: bewusste Wahl → persönlicher Standard
   * (#default, bleibt über App-Neustart erhalten) → erstes Session-Protokoll.
   */
  const runtimeProtocolId = computed<string | null>(
    () => pickedProtocolId.value ?? defaultProtocolId.value ?? availableProtocols.value[0]?.id ?? null,
  )
  const protocol = computed<ProtocolTemplate>(
    () =>
      (availableProtocols.value.find((p) => p.id === runtimeProtocolId.value) ??
        availableProtocols.value[0] ??
        standardprotokoll) as ProtocolTemplate,
  )

  const caseState = useCaseState(() => protocol.value)

  /** Vorlage wechseln: verwirft den flüchtigen Einsatz-Zustand (Aufrufer bestätigt vorher). */
  function selectRuntimeProtocol(id: string): void {
    if (id === runtimeProtocolId.value) return
    pickedProtocolId.value = id
    caseState.reset()
  }

  /** Ob die aktuell gewählte Vorlage als persönlicher Standard gesetzt ist. */
  const isDefaultProtocol = computed(
    () => runtimeProtocolId.value != null && storage.settings.defaultProtocolId === runtimeProtocolId.value,
  )
  /** Aktuelle Vorlage als persönlichen Standard merken bzw. den Standard löschen. */
  function setDefaultProtocol(makeDefault: boolean): void {
    void storage.saveSettings({ defaultProtocolId: makeDefault ? runtimeProtocolId.value : null })
  }

  // Einsatz-Kontext reaktiv aus dem flüchtigen caseState (Variablen, Punkt-Zustände).
  const context = computed(() =>
    buildContext(protocol.value, {
      variableValues: caseState.state.variableValues,
      values: caseState.state.values,
      activeBlocks: caseState.state.activeBlocks,
    }),
  )

  const preview = computed(() =>
    render(
      protocol.value,
      {
        variableValues: caseState.state.variableValues,
        values: caseState.state.values,
        activeBlocks: caseState.state.activeBlocks,
      },
      { heading: heading() },
    ),
  )

  // Anzeige-Blöcke in PROTOKOLLREIHENFOLGE (#49): optionale Blöcke bleiben an
  // ihrer Editor-Position (Toggle inline); regulaere nur, wenn visibleIf erfuellt.
  const displayBlocks = computed(() =>
    protocol.value.blocks.filter((b) => b.optional || isBlockVisible(b, context.value)),
  )

  /** Sichtbare Punkte eines Blocks (gleiche Auswertung wie der Renderer). */
  function visiblePointsOf(block: ProtocolBlock) {
    return getVisiblePoints(block, context.value)
  }

  /** Ob ein Block aktuell sichtbar ist (optional+aktiv+visibleIf). */
  function blockVisible(block: ProtocolBlock): boolean {
    return isBlockVisible(block, context.value)
  }

  /**
   * Platzhalter in UI-Texten (Titel/Label/Text) auflösen — über die GEMEINSAME
   * Runtime-Funktion, also identisch zur Vorschau. Keine eigene Logik in der UI.
   */
  function resolveText(input: string): string {
    return runtimeResolveText(input, context.value)
  }

  return {
    protocol,
    availableProtocols,
    runtimeProtocolId,
    selectRuntimeProtocol,
    isDefaultProtocol,
    setDefaultProtocol,
    ...caseState,
    preview,
    displayBlocks,
    visiblePointsOf,
    blockVisible,
    resolveText,
  }
}
