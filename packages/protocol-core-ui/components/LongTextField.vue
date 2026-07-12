<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * Grosses Freitext-Feld (Rework) fuer lange Eingaben - Anamnese, Verlauf etc. Spiegelt das bewaehrte
 * dev-Muster (LongTextModal.vue, #91): der sichtbare Trigger ist eine textarea-gestylte Flaeche mit
 * Vorschau (line-clamp-2); Tap oeffnet ein Bottom-Sheet mit grossem Textbereich (h-[85vh], intern
 * scrollend) - bewusst KEINE inline-auto-grow-Textarea (Mobile-Safari-Bugs + Layout-Schub) und KEIN
 * Zeichen-Limit (medizinische Doku darf nicht abgeschnitten werden).
 *
 * Eingabe wird LIVE nach aussen gespiegelt (Maintainer-Entscheidung): jeder Tastendruck schreibt
 * sofort in den Einsatz (+ persistenten Entwurf) -> App-Schliessen/Akku-Tod verliert nichts. „Fertig"
 * / Backdrop schliesst nur. Ans Geraet geht NICHTS - das passiert erst bei „An Geraet senden".
 */
const props = defineProps<{ modelValue: string; title: string; required?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const area = ref<HTMLTextAreaElement | null>(null)
const draft = ref(props.modelValue)

// Echo des Live-Werts abgleichen, ohne den gerade getippten Stand zu ueberschreiben.
watch(
  () => props.modelValue,
  (v) => {
    if (v !== draft.value) draft.value = v
  },
)

function open(): void {
  draft.value = props.modelValue
  dialog.value?.showModal()
  requestAnimationFrame(() => area.value?.focus())
}
function onInput(e: Event): void {
  draft.value = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', draft.value)
}
function close(): void {
  dialog.value?.close()
}
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
    <span v-else class="text-base-content/50">{{ title }} eingeben …</span>
  </button>

  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" :aria-label="title">
    <div class="modal-box flex h-[85vh] max-h-none flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
      <h3 class="text-base font-semibold">{{ title }}</h3>
      <textarea
        ref="area"
        :value="draft"
        class="textarea textarea-bordered min-h-0 w-full flex-1 text-base leading-relaxed"
        :placeholder="`${title} …`"
        :aria-label="title"
        :aria-required="required || undefined"
        @input="onInput"
      />
      <div class="flex justify-end">
        <button class="btn btn-primary btn-sm" type="button" @click="close">Fertig</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
