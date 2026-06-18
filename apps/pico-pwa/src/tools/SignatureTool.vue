<script setup lang="ts">
import { computed, ref } from 'vue'
import { signatureBlock } from '@resqdocs/protocol-core/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/**
 * Unterschriftsblock (#97): Rollen wählen → Block mit Rollenzeile, Abstand und
 * Unterschriftslinie wird ins Feld geschrieben (z. B. Mitfahrt-/Transport-
 * verweigerung). Reiner Text fürs Zielsystem, keine digitale Signatur.
 */
const emit = defineEmits<{ apply: [text: string] }>()

const ROLES = ['Patient', 'Angehöriger/Zeuge', 'Rettungsdienst']
const selected = ref<Record<string, boolean>>({ Patient: true, 'Angehöriger/Zeuge': false, Rettungsdienst: false })
const lineLength = ref(40)

function resetInputs(): void {
  selected.value = { Patient: true, 'Angehöriger/Zeuge': false, Rettungsdienst: false }
  lineLength.value = 40
}

const chosen = computed(() => ROLES.filter((r) => selected.value[r]))
const resultText = computed(() =>
  chosen.value.length ? signatureBlock({ roles: chosen.value, lineLength: lineLength.value }) : '',
)
</script>

<template>
  <ToolModal
    button-label="Unterschriftsfeld einfügen"
    title="Unterschrift"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <p class="text-xs text-base-content/60">Rollen wählen, die unterschreiben:</p>
    <label v-for="role in ROLES" :key="role" class="flex items-center gap-2">
      <input v-model="selected[role]" type="checkbox" class="checkbox checkbox-sm" />
      <span class="label-text">{{ role }}</span>
    </label>
    <label class="form-control">
      <span class="label-text mb-1">Linienlänge ({{ lineLength }} Zeichen)</span>
      <input v-model.number="lineLength" type="range" min="20" max="70" class="range range-sm" />
    </label>
    <p v-if="!chosen.length" class="text-sm text-warning">Mindestens eine Rolle wählen.</p>
  </ToolModal>
</template>
