<script setup lang="ts">
import { computed, ref } from 'vue'
import { lams } from '@resqdocs/protocol-core/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/** LAMS (#55): Fazialisparese 0-1, Armhalteversuch 0-2, Händedruck 0-2; >= 4 = LVO-Verdacht. */
const emit = defineEmits<{ apply: [text: string] }>()

const face = ref('0')
const arm = ref('0')
const grip = ref('0')
function resetInputs(): void {
  face.value = '0'
  arm.value = '0'
  grip.value = '0'
}
const resultText = computed(() => {
  try {
    return lams({ face: face.value, arm: arm.value, grip: grip.value }).text
  } catch {
    return ''
  }
})
</script>

<template>
  <ToolModal
    button-label="LAMS erheben"
    title="LAMS (Los Angeles Motor Scale)"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <label class="form-control">
      <span class="label-text mb-1">Fazialisparese</span>
      <select v-model="face" class="select select-bordered select-sm w-full">
        <option value="0">fehlt (0)</option>
        <option value="1">vorhanden (1)</option>
      </select>
    </label>
    <label class="form-control">
      <span class="label-text mb-1">Armhalteversuch</span>
      <select v-model="arm" class="select select-bordered select-sm w-full">
        <option value="0">hält (0)</option>
        <option value="1">sinkt ab (1)</option>
        <option value="2">fällt sofort (2)</option>
      </select>
    </label>
    <label class="form-control">
      <span class="label-text mb-1">Händedruck</span>
      <select v-model="grip" class="select select-bordered select-sm w-full">
        <option value="0">normal (0)</option>
        <option value="1">schwach (1)</option>
        <option value="2">kein Griff (2)</option>
      </select>
    </label>
  </ToolModal>
</template>
