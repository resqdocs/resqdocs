<script setup lang="ts">
import type { ProtocolBlock } from '@resqdocs/protocol-core/renderer/render.mjs'

/**
 * Aktiviert einen optionalen Block (z. B. „Mitfahrtverweigerung") für den
 * laufenden Einsatz. Aktivierung ist flüchtig (Teil von caseState.activeBlocks).
 */
const props = defineProps<{
  block: ProtocolBlock
  active: boolean
  /** Zentrale Platzhalter-Auflösung (runtime.mjs). Fallback: unverändert. */
  resolve?: (input: string) => string
}>()
const emit = defineEmits<{ 'update:active': [value: boolean] }>()

const title = () => (props.resolve ? props.resolve(props.block.title) : props.block.title)
</script>

<template>
  <label class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3">
    <input
      type="checkbox"
      class="toggle toggle-primary"
      :checked="active"
      :aria-label="`Block ${title()} aktivieren`"
      @change="emit('update:active', ($event.target as HTMLInputElement).checked)"
    />
    <span class="min-w-0 flex-1">
      <span class="font-medium">{{ title() }}</span>
      <span class="block text-xs text-base-content/60">optionaler Block</span>
    </span>
  </label>
</template>
