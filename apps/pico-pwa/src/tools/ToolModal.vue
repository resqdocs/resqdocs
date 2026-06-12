<script setup lang="ts">
import { ref } from 'vue'

/**
 * Gemeinsame Modal-Schale der Feld-Tools (#55): Button am Feld -> Dialog mit
 * Formular (Slot) -> "Übernehmen" emittiert den Ergebnistext und schließt.
 * Maintainer-Entscheidung: Modal statt inline, damit das Protokoll schlank
 * bleibt. Eingaben sind flüchtig (RAM) und werden beim Schließen verworfen.
 */
const props = defineProps<{
  buttonLabel: string
  title: string
  /** Aktueller Ergebnistext (leer = noch nicht berechenbar). */
  resultText: string
}>()
const emit = defineEmits<{ apply: [text: string]; opened: []; closed: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)

function open(): void {
  emit('opened') // Tool setzt seine Eingaben zurück
  dialog.value?.showModal()
}
function close(): void {
  dialog.value?.close()
  emit('closed')
}
function apply(): void {
  if (!props.resultText) return
  emit('apply', props.resultText)
  close()
}
</script>

<template>
  <div>
    <button class="btn btn-sm" type="button" @click="open">{{ buttonLabel }}</button>
    <dialog ref="dialog" class="modal" @cancel="emit('closed')">
      <div class="modal-box flex max-h-[85vh] flex-col gap-3 overflow-y-auto">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <slot />
        <div v-if="resultText" class="rounded bg-base-200 p-2 text-sm">{{ resultText }}</div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost btn-sm" type="button" @click="close">Abbrechen</button>
          <button class="btn btn-primary btn-sm" type="button" :disabled="!resultText" @click="apply">
            Ins Feld übernehmen
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
    </dialog>
  </div>
</template>
