<script setup lang="ts">
/**
 * Wiederverwendbare Rückfrage vor destruktiven Aktionen im Einsatz (#260) — bewährtes Muster wie die
 * Lösch-Bestätigung im Editor (ContainerTreeNode): Abbrechen (ghost, leading) + roter Destruktiv-Button
 * (trailing) mit spezifischem Verb statt OK/Ja; Backdrop + ESC = Abbrechen. Sichtbarkeit steuert die
 * Aufrufstelle per v-if (wie MoveToPicker).
 *
 * Härtungen (quellenbasiert: NN/g confirmation-dialog + ok-cancel, Apple HIG alerts, M3 dialogs):
 * - Initialfokus auf „Abbrechen" (sicherer Default, nie der Destruktiv-Button); Fokus-Rückgabe beim
 *   Schließen; minimaler Fokus-Trap zwischen den zwei Buttons (Backdrop ist tabindex=-1).
 * - ESC auf Fenster-Ebene (greift auch, wenn der Fokus den Dialog verlassen hat).
 * - Scharfschalt-Sperre: Bestätigen ist die ersten 350 ms sichtbar disabled — der zweite Tap eines
 *   Doppel-Taps darf die irreversible Aktion nicht ungelesen auslösen (Einsatzkontext: Stress/Handschuhe).
 * - min-h-12 = 48 px Touchfläche (Material/Android-Ziel; daisyUI-5-btn ist real nur 40 px hoch).
 *
 * Teleport an body: der Einsatz-Shell hat backdrop-blur-Vorfahren, die fixed/Modal sonst auf den
 * Inhaltsbereich einsperren (gleiches Muster wie Scan-Sheet/PackageScanOverlay).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ title: string; message?: string; confirmLabel: string }>()
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()

const cancelBtn = ref<HTMLButtonElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)
const armed = ref(false)
let armTimer: ReturnType<typeof setTimeout> | null = null
let restoreFocus: HTMLElement | null = null

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('cancel')
  } else if (e.key === 'Tab') {
    // Minimaler Fokus-Trap: Tab zykliert zwischen Abbrechen und Bestätigen.
    const first = cancelBtn.value
    const last = confirmBtn.value
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    } else if (document.activeElement !== first && document.activeElement !== last) {
      e.preventDefault()
      first.focus()
    }
  }
}
onMounted(() => {
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  cancelBtn.value?.focus()
  window.addEventListener('keydown', onKeydown)
  armTimer = setTimeout(() => (armed.value = true), 350)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (armTimer) clearTimeout(armTimer)
  restoreFocus?.focus() // Trigger weg (Zeile gelöscht) -> No-op, unkritisch
})
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-box">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <p v-if="message" class="pt-2 text-sm text-base-content/70">{{ message }}</p>
        <div class="modal-action">
          <button ref="cancelBtn" type="button" class="btn btn-ghost min-h-12" @click="emit('cancel')">Abbrechen</button>
          <button ref="confirmBtn" type="button" class="btn btn-error min-h-12" :disabled="!armed" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" tabindex="-1" @click="emit('cancel')"></button>
    </div>
  </Teleport>
</template>
