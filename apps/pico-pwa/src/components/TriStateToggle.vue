<script setup lang="ts">
/**
 * 3-Zustands-Schalter (#71): Tippen rotiert ✓ (bestätigt/Standard) →
 * ✎ (abweichend/eigen) → − (nicht erhoben) → ✓. Bei required entfällt −.
 * Maintainer-UX-Entscheidung; Ersterklärung kommt über den Erklär-Flow (#72).
 */
export type TriState = 'confirmed' | 'custom' | 'excluded'

const props = withDefaults(defineProps<{
  modelValue: TriState
  /** Pflichtpunkt: Zustand 'nicht erhoben' wird nicht angeboten. */
  allowExcluded?: boolean
  label: string
}>(), { allowExcluded: true })

const emit = defineEmits<{ 'update:modelValue': [v: TriState] }>()

const NEXT: Record<TriState, TriState> = { confirmed: 'custom', custom: 'excluded', excluded: 'confirmed' }
const TITLE: Record<TriState, string> = {
  confirmed: 'bestätigt (Standard)',
  custom: 'abweichend (eigener Text)',
  excluded: 'nicht erhoben - erscheint nicht im Protokoll',
}

function cycle(): void {
  let next = NEXT[props.modelValue]
  if (next === 'excluded' && !props.allowExcluded) next = NEXT[next]
  emit('update:modelValue', next)
}
</script>

<template>
  <button
    type="button"
    class="grid size-7 shrink-0 place-items-center rounded-md border text-base font-bold leading-none"
    :class="{
      'border-success bg-success text-success-content': modelValue === 'confirmed',
      'border-primary bg-primary text-primary-content': modelValue === 'custom',
      'border-base-300 bg-base-200 text-base-content/50': modelValue === 'excluded',
    }"
    :title="TITLE[modelValue]"
    :aria-label="`${label}: ${TITLE[modelValue]} - tippen wechselt`"
    @click="cycle"
  >
    <span v-if="modelValue === 'confirmed'" aria-hidden="true">✓</span>
    <span v-else-if="modelValue === 'custom'" aria-hidden="true">✎</span>
    <span v-else aria-hidden="true">−</span>
  </button>
</template>
