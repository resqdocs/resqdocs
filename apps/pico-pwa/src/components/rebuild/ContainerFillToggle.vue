<script setup lang="ts">
/** 2-stufiger Status eines Containers im Einsatz: ✓ erhoben / − nicht erhoben (excluded).
 *  Gleiche schlichte Optik wie TriStateToggle (size-7 rounded-md Button), nur 2 Zustaende.
 *  @click.stop.prevent, damit ein Tipp in einer collapse-summary nicht das Einklappen ausloest. */
import { computed } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@/rebuild/useCaseValues'

const props = defineProps<{ node: Container }>()
const caseValues = useCaseValues()

const excluded = computed(() => caseValues.get(props.node.id).state === 'excluded')
const label = computed(() => (props.node.title && props.node.title.trim()) || props.node.id)

function toggle(): void {
  caseValues.toggleExcluded(props.node.id)
}
</script>

<template>
  <button
    type="button"
    class="grid size-7 shrink-0 place-items-center rounded-md border text-base font-bold leading-none"
    :class="excluded ? 'border-base-300 bg-base-200 text-base-content/50' : 'border-base-300 bg-base-100 text-base-content/70'"
    :title="excluded ? 'nicht erhoben' : 'erhoben'"
    :aria-label="`${label}: ${excluded ? 'nicht erhoben' : 'erhoben'} - tippen wechselt`"
    @click.stop.prevent="toggle"
  >
    <span aria-hidden="true">{{ excluded ? '−' : '✓' }}</span>
  </button>
</template>
