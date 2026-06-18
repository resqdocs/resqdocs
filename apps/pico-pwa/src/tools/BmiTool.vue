<script setup lang="ts">
import { computed, ref } from 'vue'
import { bmi } from '@resqdocs/protocol-core/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/** BMI-Rechner (#55): kg/m², WHO-Klassifikation. */
const emit = defineEmits<{ apply: [text: string] }>()

const weight = ref('')
const height = ref('')
function resetInputs(): void {
  weight.value = ''
  height.value = ''
}
const resultText = computed(() => {
  if (weight.value === '' || height.value === '') return ''
  try {
    return bmi({ weightKg: weight.value, heightCm: height.value }).text
  } catch {
    return ''
  }
})
</script>

<template>
  <ToolModal
    button-label="BMI berechnen"
    title="BMI"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <label class="form-control">
      <span class="label-text mb-1">Gewicht (kg)</span>
      <input v-model="weight" type="number" inputmode="decimal" min="1" class="input input-bordered input-sm w-full" />
    </label>
    <label class="form-control">
      <span class="label-text mb-1">Größe (cm)</span>
      <input v-model="height" type="number" inputmode="numeric" min="30" class="input input-bordered input-sm w-full" />
    </label>
  </ToolModal>
</template>
