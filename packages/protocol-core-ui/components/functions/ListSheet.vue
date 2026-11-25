<script setup lang="ts">
/**
 * Fenster für Listen-Funktionen (Medikationsplan, Kontakte/Ärzte). Im Einsatz steht nur eine Ergebnis-Zeile, wie
 * bei den Rechnern; ein Tipp öffnet dieses Fenster mit der Liste. Am Handy füllt es den ganzen Bildschirm (eine
 * Liste mit Einträgen, Vorschlägen und Scan ist eine eigene Aufgabe), auf breiten Bildschirmen ist es ein mittiger
 * Dialog. „Fertig“ steht oben, weil die Tastatur den unteren Rand verdeckt.
 *
 * Bewusst KEIN natives <dialog> mit showModal(): Rückfragen, Vorschläge und der Scan öffnen als weitere Fenster
 * und müssen darüber liegen. Dafür sorgt die Ebene (z-[35], siehe Template), nicht die Reihenfolge im Dokument.
 * Eingaben gelten sofort (kein „Abbrechen“); „Fertig“ schließt nur.
 * Quellen: docs/sources.md („Listen-Funktionen: Ergebnis-Zeile und Fenster“).
 */
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useFullscreenKeyboard } from '../../fullscreenKeyboard.ts'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
// Höhe bei offener Tastatur: App = Layout-Höhe, Online-Editor = sichtbarer Bereich (wie das große Textfeld).
const kb = useFullscreenKeyboard()
const { covered, boxStyle, dialogStyle } = kb
onMounted(async () => {
  kb.prepare()
  await nextTick()
  kb.follow()
})
onBeforeUnmount(() => kb.stop())
</script>

<template>
  <Teleport to="body">
    <!-- z-[35]: über der App-Hülle (z-10 bis z-30), aber UNTER allem, was aus der Liste heraus öffnet: Prüf-Fenster nach
         dem Plan-Scan (z-40), Kamera (z-50), Rückfragen und Scan-Auswahl (daisyUI .modal, z-999). Mit dem z-999 von
         .modal lag das Prüf-Fenster nach dem Scan unsichtbar hinter der Liste. -->
    <div class="modal modal-open modal-top z-[35] max-sm:bg-transparent sm:modal-middle" :style="dialogStyle" role="dialog" aria-modal="true" :aria-label="title" data-list-sheet @keydown.esc.stop="emit('close')">
      <div
        class="modal-box flex h-[var(--lt-h,100dvh)] max-h-none w-full max-w-none translate-none flex-col overflow-hidden rounded-none p-0 sm:h-[min(85vh,var(--lt-h,100dvh))] sm:w-11/12 sm:max-w-2xl sm:rounded-box"
        :style="boxStyle"
      >
        <header class="flex shrink-0 items-center gap-2 border-b border-base-300 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          <h3 class="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{{ title }}</h3>
          <button type="button" class="btn btn-primary btn-sm min-h-11 shrink-0" data-list-sheet-done data-back-close @click="emit('close')">Fertig</button>
        </header>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3" data-list-sheet-body>
          <slot />
        </div>
        <!-- Über der Tastatur braucht der Fuß keinen Abstand für den Home-Balken. -->
        <footer class="shrink-0 border-t border-base-300 px-4 pt-2" :class="covered ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'">
          <p class="text-xs text-base-content/75">Wird automatisch gespeichert</p>
        </footer>
      </div>
      <button type="button" class="modal-backdrop max-sm:hidden" aria-label="Schließen" tabindex="-1" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
