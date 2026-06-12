<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * Vollflächiger Editor für lange Freitexte (#91): Anamnese, Verlauf etc.
 * Tap auf das Feld öffnet das Modal mit grossem Textbereich. Der Text wird
 * live nach aussen gespiegelt (v-model), "Fertig"/Backdrop schliesst nur.
 * Flüchtig wie der ganze Einsatz-Zustand (kein Persistieren hier).
 */
const props = defineProps<{ modelValue: string; title: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const area = ref<HTMLTextAreaElement | null>(null)
const draft = ref(props.modelValue)

watch(() => props.modelValue, (v) => { if (v !== draft.value) draft.value = v })

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
defineExpose({ open })
</script>

<template>
  <button
    type="button"
    class="textarea textarea-bordered textarea-sm min-h-[3.5rem] w-full whitespace-pre-wrap text-left"
    :aria-label="`${title} bearbeiten`"
    @click="open"
  >
    <span v-if="modelValue" class="line-clamp-2 text-base-content/80">{{ modelValue }}</span>
    <span v-else class="text-base-content/50">{{ title }} eingeben …</span>
  </button>

  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle">
    <div class="modal-box flex h-[85vh] max-h-none flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
      <h3 class="text-base font-semibold">{{ title }}</h3>
      <textarea
        ref="area"
        :value="draft"
        class="textarea textarea-bordered min-h-0 w-full flex-1 text-base leading-relaxed"
        :placeholder="`${title} …`"
        @input="onInput"
      />
      <div class="flex justify-end">
        <button class="btn btn-primary btn-sm" type="button" @click="close">Fertig</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
