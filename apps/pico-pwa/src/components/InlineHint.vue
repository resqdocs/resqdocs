<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStorage } from '@/storage/useStorage'

/**
 * Dezenter Erklär-Hinweis (#72): ein kleines ?-Symbol, dauerhaft an der
 * erklärten Stelle. Beim ERSTEN Kontakt (id nicht in dismissedHints) ist der
 * Hinweis automatisch aufgeklappt; "verstanden" persistiert die id. Danach
 * öffnet/schliesst das ?-Symbol den Hinweis jederzeit erneut.
 * Übersichtlichkeit vor Hilfe-Dichte: nur dort einsetzen, wo wirklich nötig.
 */
const props = defineProps<{ id: string; title?: string; text: string }>()

const { settings, saveSettings } = useStorage()
const seen = computed(() => settings.dismissedHints.includes(props.id))
const open = ref(!seen.value)

function toggle(): void {
  open.value = !open.value
}
function understood(): void {
  if (!settings.dismissedHints.includes(props.id)) {
    settings.dismissedHints = [...settings.dismissedHints, props.id]
    void saveSettings()
  }
  open.value = false
}
</script>

<template>
  <span class="inline-flex items-center">
    <button
      type="button"
      class="grid size-4 place-items-center rounded-full border border-base-300 text-[0.7rem] leading-none text-base-content/60"
      :aria-label="`Hinweis: ${title ?? 'Erklärung'}`"
      :aria-expanded="open"
      @click="toggle"
    >?</button>
    <span
      v-if="open"
      role="note"
      class="ml-2 inline-flex items-start gap-2 rounded bg-base-200 px-2 py-1 text-xs text-base-content/80"
    >
      <span><strong v-if="title">{{ title }}: </strong>{{ text }}</span>
      <button v-if="!seen" type="button" class="shrink-0 font-medium text-primary" @click="understood">verstanden</button>
    </span>
  </span>
</template>
