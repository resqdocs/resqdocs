<script setup lang="ts">
import type { ProtocolVariable } from '@resqdocs/protocol-core/renderer/render.mjs'

/**
 * Eingabe für eine Protokoll-Variable (select / boolean / text / number).
 * Steuert über den Renderer Platzhalter und Sichtbarkeit. Kein Patientendaten-Store.
 */
const props = defineProps<{ variable: ProtocolVariable; modelValue: unknown }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

function onText(e: Event): void {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
function onNumber(e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  emit('update:modelValue', raw === '' ? undefined : Number(raw))
}
function onBool(e: Event): void {
  emit('update:modelValue', (e.target as HTMLInputElement).checked)
}
function onSelect(e: Event): void {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="form-control">
    <label class="label py-1">
      <span class="label-text font-medium">{{ variable.label ?? variable.id }}</span>
    </label>

    <select
      v-if="variable.type === 'select'"
      class="select select-bordered select-sm w-full"
      :value="props.modelValue"
      :aria-label="variable.label ?? variable.id"
      @change="onSelect"
    >
      <option v-for="opt in variable.options ?? []" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>

    <label v-else-if="variable.type === 'boolean'" class="flex items-center gap-2">
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        :checked="Boolean(props.modelValue)"
        :aria-label="variable.label ?? variable.id"
        @change="onBool"
      />
      <span class="text-sm text-base-content/70">{{ props.modelValue ? 'ja' : 'nein' }}</span>
    </label>

    <input
      v-else-if="variable.type === 'number'"
      type="number"
      class="input input-bordered input-sm w-full"
      :value="props.modelValue"
      :aria-label="variable.label ?? variable.id"
      @input="onNumber"
    />

    <input
      v-else
      type="text"
      class="input input-bordered input-sm w-full"
      :value="props.modelValue"
      :aria-label="variable.label ?? variable.id"
      @input="onText"
    />
  </div>
</template>
