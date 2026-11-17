<script setup lang="ts">
/** 3-stufiger Status einer Funktion im Einsatz: ✓ erhoben / ✎ Freitext / − nicht erhoben. Optik wie der
 *  Feld-Tri-State (TriStateToggle), damit im Einsatz EINE Tri-State-Sprache gilt. Der Status lebt IN der
 *  'function'-Fill-Variante NEBEN den Zeilen (getFunctionStatus/setFunctionStatus/setFunctionText,
 *  rows-erhaltend) - deshalb NICHT toggleExcluded (das wuerde die Zeilen verwerfen).
 *  ✎ startet vorbelegt: vorhandener Freitext, sonst der ruhend gemerkte (prevText), sonst der Text, den die
 *  Funktion gerade erzeugt (z. B. die FAST4D- oder NEWS2-Zeile - man bearbeitet ihn, statt neu zu tippen),
 *  sonst der Standardtext (node.default).
 *  @click.stop.prevent, damit ein Tipp keine umgebende Interaktion (focusout/Karte) ausloest. */
import { computed, onMounted } from 'vue'
import type { FunctionNode } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()

const status = computed(() => caseValues.getFunctionStatus(props.node.id, props.node))
const label = computed(() => (props.node.title && props.node.title.trim()) || props.node.id)

onMounted(() => {
  // Spiegelbild der Feld-Heilung (EinsatzField): eine Pflicht-Funktion darf nicht als „nicht erhoben"
  // (excluded) verharren (Alt-Entwurf/Import, der vor dem Setzen von required entstand) - sonst faellt
  // sie im Renderer still weg. Zeilen bleiben erhalten (setFunctionStatus), confirmed loescht den Status.
  if (props.node.required && status.value === 'excluded') caseValues.setFunctionStatus(props.node.id, 'confirmed')
})

const NEXT = { confirmed: 'custom', custom: 'excluded', excluded: 'confirmed' } as const
const TITLE = {
  confirmed: 'erhoben',
  custom: 'eigener Wert (Freitext)',
  excluded: 'nicht erhoben - erscheint nicht im Protokolltext',
} as const

/** Text, den die Funktion mit den erfassten Werten gerade erzeugt (wie im Protokolltext), sonst ''. */
function generated(): string {
  const def = FUNCTION_REGISTRY[props.node.functionKind]
  const fill = caseValues.get(props.node.id)
  if (!def || !def.hasData(fill)) return ''
  return def.renderBody(fill, props.node.config).trim()
}
function toggle(): void {
  let next = NEXT[status.value]
  // Pflicht-Funktion: der −-Zustand (nicht erhoben) entfaellt -> von ✎ direkt auf ✓ (NEXT[excluded]).
  if (next === 'excluded' && props.node.required) next = NEXT[next]
  // ✎: Freitext-Modus, vorbelegt mit vorhandenem Freitext, sonst dem RUHEND gemerkten (prevText,
  // Wiederherstellung nach versehentlichem Verlassen), sonst dem gerade erzeugten Text der Funktion (zum
  // Bearbeiten statt Neu-Tippen, Maintainer-Wunsch), sonst dem Standardtext (node.default).
  if (next === 'custom') {
    caseValues.setFunctionText(
      props.node.id,
      caseValues.getFunctionText(props.node.id) || caseValues.getFunctionPrevText(props.node.id) || generated() || (props.node.default ?? ''),
    )
  }
  else caseValues.setFunctionStatus(props.node.id, next)
}
</script>

<template>
  <button
    type="button"
    class="grid size-7 shrink-0 place-items-center rounded-md border text-base font-bold leading-none"
    :class="{
      'border-success bg-success text-success-content': status === 'confirmed',
      'border-primary bg-primary text-primary-content': status === 'custom',
      'border-base-300 bg-base-200 text-base-content/50': status === 'excluded',
    }"
    :title="TITLE[status]"
    :data-fill-toggle="status"
    :aria-label="`${label}: ${TITLE[status]} - tippen wechselt`"
    @click.stop.prevent="toggle"
  >
    <span v-if="status === 'confirmed'" aria-hidden="true">✓</span>
    <span v-else-if="status === 'custom'" aria-hidden="true">✎</span>
    <span v-else aria-hidden="true">−</span>
  </button>
</template>
