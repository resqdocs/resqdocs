<script setup lang="ts">
import TriStateToggle, { type TriState } from '@/components/TriStateToggle.vue'

/**
 * Ein Befund mit drei Zuständen (#71): ✓ Normalbefund bestätigt ·
 * ✎ abweichender Befund (Freitext) · − nicht erhoben (erscheint NICHT in
 * der Ausgabe - Grundsatz "nicht erhoben = weglassen"). Bei required
 * entfällt der dritte Zustand. Keine Persistenz - Wert lebt im Fall-Zustand.
 */
export interface BefundValue {
  state: 'normal' | 'abnormal' | 'excluded'
  /** bei normal: gewählte Variante (#73); bei abnormal: Freitext. */
  value?: string
}

const props = withDefaults(defineProps<{
  label: string
  normalText: string
  modelValue: BefundValue
  required?: boolean
  /** Alternative Normalbefund-Texte (#73), im ✓-Zustand wählbar. */
  variants?: string[]
}>(), { required: false, variants: () => [] })

const emit = defineEmits<{ 'update:modelValue': [v: BefundValue] }>()

const TO_TRI: Record<BefundValue['state'], TriState> = { normal: 'confirmed', abnormal: 'custom', excluded: 'excluded' }

function onTri(t: TriState): void {
  if (t === 'confirmed') emit('update:modelValue', { state: 'normal' })
  else if (t === 'custom') emit('update:modelValue', { state: 'abnormal', value: props.modelValue.value ?? '' })
  else emit('update:modelValue', { state: 'excluded' })
}
function setValue(value: string): void {
  emit('update:modelValue', { state: 'abnormal', value })
}
/** Variante wählen: '' = Standard (normalText), sonst der Variantentext. */
function pickVariant(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v === '' ? { state: 'normal' } : { state: 'normal', value: v })
}
</script>

<template>
  <div class="flex items-start gap-3 py-2" :class="{ 'opacity-50': modelValue.state === 'excluded' }">
    <TriStateToggle
      class="mt-0.5"
      :model-value="TO_TRI[modelValue.state]"
      :allow-excluded="!required"
      :label="label"
      @update:model-value="onTri"
    />
    <div class="min-w-0 flex-1">
      <div class="font-medium">{{ label }}</div>
      <!-- normal: mit Varianten ein Select (#73), sonst der Standardtext zum Antippen -->
      <select
        v-if="modelValue.state === 'normal' && variants.length"
        class="select select-bordered select-sm mt-1 w-full"
        :value="modelValue.value ?? ''"
        :aria-label="`${label} – Befund wählen`"
        @change="pickVariant"
      >
        <option value="">{{ normalText }}</option>
        <option v-for="v in variants" :key="v" :value="v">{{ v }}</option>
      </select>
      <button
        v-else-if="modelValue.state === 'normal'"
        type="button"
        class="text-left text-base-content/70"
        @click="onTri('custom')"
      >
        {{ normalText }}
      </button>
      <input
        v-else-if="modelValue.state === 'abnormal'"
        type="text"
        class="input input-bordered input-sm mt-1 w-full"
        :value="modelValue.value"
        :placeholder="`${label} – abweichender Befund …`"
        @input="setValue(($event.target as HTMLInputElement).value)"
      />
      <p v-else class="text-sm italic text-base-content/60">nicht erhoben - erscheint nicht im Protokoll</p>
    </div>
  </div>
</template>
