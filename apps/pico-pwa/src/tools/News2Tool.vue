<script setup lang="ts">
import { computed, ref } from 'vue'
import { news2 } from '@resqdocs/protocol-core/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/**
 * NEWS2 (#55) nach RCP-Tabellen (scores.mjs). SpO2-Skala 2 nur bei
 * dokumentierter hyperkapnischer respiratorischer Insuffizienz.
 */
const emit = defineEmits<{ apply: [text: string] }>()

const rr = ref('')
const spo2 = ref('')
const scale2 = ref(false)
const onOxygen = ref(false)
const systolic = ref('')
const pulse = ref('')
const temp = ref('')
const consciousness = ref('A')

function resetInputs(): void {
  rr.value = ''; spo2.value = ''; scale2.value = false; onOxygen.value = false
  systolic.value = ''; pulse.value = ''; temp.value = ''; consciousness.value = 'A'
}

const resultText = computed(() => {
  if ([rr, spo2, systolic, pulse, temp].some((r) => r.value === '')) return ''
  try {
    return news2({
      rr: rr.value, spo2: spo2.value, scale2: scale2.value, onOxygen: onOxygen.value,
      systolic: systolic.value, pulse: pulse.value, temp: temp.value, consciousness: consciousness.value,
    }).text
  } catch {
    return ''
  }
})
</script>

<template>
  <ToolModal
    button-label="NEWS2 erheben"
    title="NEWS2"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <div class="grid grid-cols-2 gap-2">
      <label class="form-control">
        <span class="label-text mb-1">Atemfrequenz (/min)</span>
        <input v-model="rr" type="number" inputmode="numeric" class="input input-bordered input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">SpO2 (%)</span>
        <input v-model="spo2" type="number" inputmode="numeric" class="input input-bordered input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">RR systolisch (mmHg)</span>
        <input v-model="systolic" type="number" inputmode="numeric" class="input input-bordered input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Herzfrequenz (/min)</span>
        <input v-model="pulse" type="number" inputmode="numeric" class="input input-bordered input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Temperatur (°C)</span>
        <input v-model="temp" type="number" inputmode="decimal" step="0.1" class="input input-bordered input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Bewusstsein (ACVPU)</span>
        <select v-model="consciousness" class="select select-bordered select-sm w-full">
          <option value="A">A - wach</option>
          <option value="C">C - neue Verwirrtheit</option>
          <option value="V">V - reagiert auf Ansprache</option>
          <option value="P">P - reagiert auf Schmerz</option>
          <option value="U">U - keine Reaktion</option>
        </select>
      </label>
    </div>
    <label class="flex items-center gap-2">
      <input v-model="onOxygen" type="checkbox" class="checkbox checkbox-sm" />
      <span class="text-sm">Sauerstoffgabe</span>
    </label>
    <label class="flex items-center gap-2">
      <input v-model="scale2" type="checkbox" class="checkbox checkbox-sm" />
      <span class="text-sm">SpO2-Skala 2 (hyperkapnische resp. Insuffizienz, ärztlich festgelegt)</span>
    </label>
  </ToolModal>
</template>
