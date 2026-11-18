<script setup lang="ts">
/**
 * Ein Lückentext im Einsatz-Formular: der Text mit seinen Lücken und dem aktuellen Stand. Ein Tipp auf
 * eine Lücke oder auf „Ausfüllen" öffnet das Ausfüll-Fenster. Dasselbe Bauteil dient der App und dem
 * „Ausprobieren" im Online-Editor.
 */
import { computed, inject, ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { clozeGaps } from '@resqdocs/protocol-core/cloze'
import { gapState, clozeSummary } from '@resqdocs/protocol-core/clozeFill'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'
import { templateRootKey } from '../../injection.ts'
import { useCaseValues } from '../../useCaseValues.ts'
import { useDependencyHidden } from '../../useDependencies.ts'
import ClozeText from './ClozeText.vue'
import ClozeFillDialog from './ClozeFillDialog.vue'

const props = defineProps<{ node: Container }>()
const rootRef = inject(templateRootKey, null)
const root = computed(() => rootRef?.value ?? null)
const caseValues = useCaseValues()
const dependencyHidden = useDependencyHidden()

const gaps = computed(() => clozeGaps(root.value, props.node).filter((g) => !dependencyHidden.value.has(g.id)))
const openCount = computed(() => gaps.value.filter((g) => gapState(g.node, caseValues.values.value[g.id]) === 'open').length)
const requiredOpen = computed(() => gaps.value.filter((g) => isRequiredOpen(g.node, caseValues.values.value[g.id])).length)
const status = computed(() => clozeSummary(gaps.value.length, openCount.value, requiredOpen.value))

const win = ref<InstanceType<typeof ClozeFillDialog> | null>(null)
function open(id?: string): void {
  void win.value?.open(id ?? null)
}
</script>

<template>
  <!-- data-required-open: „zum ersten offenen Pflichtfeld springen" findet auch eine offene Pflicht-Lücke. -->
  <div class="rounded-lg border border-base-300 bg-base-100 p-3" data-cloze :data-required-open="requiredOpen > 0 ? '' : undefined">
    <ClozeText :node="node" :root="root" @pick="open" />
    <div class="mt-2 flex items-center gap-3">
      <p class="min-w-0 flex-1 text-sm" :class="requiredOpen > 0 ? 'font-medium' : 'text-base-content/80'" data-cloze-status>{{ status }}</p>
      <button v-if="gaps.length" type="button" class="btn btn-neutral btn-sm min-h-11 shrink-0" data-cloze-open @click="open()">Ausfüllen</button>
    </div>
    <ClozeFillDialog ref="win" :node="node" :root="root" />
  </div>
</template>
