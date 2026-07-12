<script setup lang="ts">
/** 3-stufiger Status einer Funktion im Einsatz: ✓ erhoben / ✎ Freitext / − nicht erhoben. Optik wie der
 *  Feld-Tri-State (TriStateToggle), damit im Einsatz EINE Tri-State-Sprache gilt. Der Status lebt IN der
 *  'function'-Fill-Variante NEBEN den Zeilen (getFunctionStatus/setFunctionStatus/setFunctionText,
 *  rows-erhaltend) - deshalb NICHT toggleExcluded (das wuerde die Zeilen verwerfen).
 *  ✎ startet mit vorhandenem Freitext oder dem Standardtext (node.default) vorbelegt.
 *  @click.stop.prevent, damit ein Tipp keine umgebende Interaktion (focusout/Karte) ausloest. */
import { computed } from 'vue'
import type { FunctionNode } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@/rebuild/useCaseValues'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()

const status = computed(() => caseValues.getFunctionStatus(props.node.id))
const label = computed(() => (props.node.title && props.node.title.trim()) || props.node.id)

const NEXT = { confirmed: 'custom', custom: 'excluded', excluded: 'confirmed' } as const
const TITLE = {
  confirmed: 'erhoben',
  custom: 'Freitext (eigener Text)',
  excluded: 'nicht erhoben - erscheint nicht im Protokoll',
} as const

function toggle(): void {
  const next = NEXT[status.value]
  // ✎: Freitext-Modus, vorbelegt mit vorhandenem Freitext oder dem Standardtext (node.default).
  if (next === 'custom') caseValues.setFunctionText(props.node.id, caseValues.getFunctionText(props.node.id) || (props.node.default ?? ''))
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
    :aria-label="`${label}: ${TITLE[status]} - tippen wechselt`"
    @click.stop.prevent="toggle"
  >
    <span v-if="status === 'confirmed'" aria-hidden="true">✓</span>
    <span v-else-if="status === 'custom'" aria-hidden="true">✎</span>
    <span v-else aria-hidden="true">−</span>
  </button>
</template>
