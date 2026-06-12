<script setup lang="ts">
import { computed, ref } from 'vue'
import { packYears } from '@shared/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/** Pack-Years-Rechner (#55): (Zigaretten/Tag ÷ 20) × Jahre. */
const emit = defineEmits<{ apply: [text: string] }>()

const cigs = ref('')
const years = ref('')
function resetInputs(): void {
  cigs.value = ''
  years.value = ''
}
const resultText = computed(() => {
  if (cigs.value === '' || years.value === '') return ''
  try {
    return packYears({ cigarettesPerDay: cigs.value, years: years.value }).text
  } catch {
    return ''
  }
})
</script>

<template>
  <ToolModal
    button-label="Pack-Years berechnen"
    title="Pack-Years"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <label class="form-control">
      <span class="label-text mb-1">Zigaretten pro Tag</span>
      <input v-model="cigs" type="number" inputmode="numeric" min="0" class="input input-bordered input-sm w-full" />
    </label>
    <label class="form-control">
      <span class="label-text mb-1">Raucherjahre</span>
      <input v-model="years" type="number" inputmode="numeric" min="0" class="input input-bordered input-sm w-full" />
    </label>
  </ToolModal>
</template>
