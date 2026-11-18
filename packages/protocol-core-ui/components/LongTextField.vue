<script setup lang="ts">
import { ref } from 'vue'
import LongTextDialog from './LongTextDialog.vue'

/**
 * Großes Freitext-Feld für lange Eingaben - Anamnese, Verlauf etc. Sichtbar ist eine Fläche im Aussehen eines
 * Textfelds mit Vorschau (zwei Zeilen); ein Tipp öffnet das Schreib-Fenster (LongTextDialog).
 *
 * Die Eingabe wird LIVE nach außen gespiegelt (bewusste Entscheidung): jeder Tastendruck schreibt sofort in den
 * Einsatz (und den gespeicherten Entwurf), App-Schließen oder leerer Akku verlieren nichts. „Fertig“ schließt
 * nur. Ans Gerät geht NICHTS - das passiert erst bei „An Gerät senden“.
 */
const props = defineProps<{ modelValue: string; title: string; required?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const win = ref<InstanceType<typeof LongTextDialog> | null>(null)
function open(): void {
  void win.value?.open()
}
// Von außen öffnen (Einsatz: Eintrag „individuell“ führt direkt ins Schreiben).
defineExpose({ open })
</script>

<template>
  <button
    type="button"
    class="textarea textarea-bordered textarea-sm min-h-[3.5rem] w-full whitespace-pre-wrap text-left"
    :aria-label="`${title} bearbeiten`"
    :aria-required="required || undefined"
    @click="open"
  >
    <span v-if="modelValue" class="line-clamp-2 text-base-content/80">{{ modelValue }}</span>
    <span v-else class="text-base-content/75">{{ title }} eingeben …</span>
  </button>

  <LongTextDialog
    ref="win"
    :model-value="props.modelValue"
    :title="title"
    :required="required"
    hint="Wird automatisch gespeichert"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
