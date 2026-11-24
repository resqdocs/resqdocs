<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { longTextSizeKey } from '../injection.ts'
import { LONG_TEXT_SIZES, LONG_TEXT_SIZE_DEFAULT, LONG_TEXT_SIZE_LABEL, LONG_TEXT_SIZE_PX, type LongTextSize } from '../longTextSize.ts'
import { useFullscreenKeyboard } from '../fullscreenKeyboard.ts'

/**
 * Fenster zum Schreiben langer Texte. Am Handy füllt es den ganzen Bildschirm (ein langer Text ist eine eigene
 * Aufgabe, kein Nebenbei), auf breiten Bildschirmen bleibt es ein mittiger Dialog.
 *
 * Aufbau von oben nach unten:
 *   - Kopf: Titel und „Fertig“. Der Knopf steht oben, weil die Tastatur alles am unteren Rand verdeckt -
 *     unten war er beim Tippen nicht zu sehen.
 *   - Text: füllt den Platz ÜBER der Tastatur, damit die Schreibmarke nie hinter ihr verschwindet. In der App
 *     verkleinert die Tastatur das Layout, das Fenster ist so hoch wie das Layout; im Online-Editor folgt die Höhe
 *     dem sichtbaren Bereich (fullscreenKeyboard.ts). Kein Rahmen: der ganze Bildschirm ist das Feld.
 *   - Fuß: Hinweis (z. B. dass sofort gespeichert wird) und die Schriftgröße in drei Stufen.
 *
 * Bewegung: Das Fenster blendet ein und aus, es fährt NICHT herein. Die Tastatur kommt von unten; ein Fenster,
 * das gleichzeitig von oben hereinfährt, wirkt unruhig. In der App passt sich die Höhe genau einmal an, wenn die
 * Tastatur auf- oder zugeht, und läuft beim Tippen nicht nach. Beim Schließen deckt das Fenster sofort die ganze
 * Fläche und blendet nur noch aus. Im Online-Editor gleiten Höhenwechsel (fullscreenKeyboard.ts).
 *
 * Bewusst KEINE mitwachsende Textarea (Mobile-Safari-Fehler, Layout-Schub) und KEIN Zeichen-Limit
 * (medizinische Dokumentation darf nicht abgeschnitten werden).
 * Quellen: docs/sources.md („Großes Textfeld: Fenster, Tastatur und Schriftgröße“).
 */
const props = defineProps<{ modelValue: string; title: string; required?: boolean; placeholder?: string; hint?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string]; close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const area = ref<HTMLTextAreaElement | null>(null)
const draft = ref(props.modelValue)

// Echo des Live-Werts abgleichen, ohne den gerade getippten Stand zu überschreiben.
watch(
  () => props.modelValue,
  (v) => {
    if (v !== draft.value) draft.value = v
  },
)

// Schriftgröße: die App merkt sie sich je Gerät (longTextSizeKey); ohne Provider gilt sie, solange das Fenster lebt.
const provided = inject(longTextSizeKey, null)
const local = ref<LongTextSize>(LONG_TEXT_SIZE_DEFAULT)
const size = computed<LongTextSize>({
  get: () => provided?.value ?? local.value,
  set: (v) => {
    if (provided) provided.value = v
    else local.value = v
  },
})
const GLYPH: Record<LongTextSize, string> = { sm: '0.75rem', md: '0.9375rem', lg: '1.1875rem' }

// Höhe und Lage bei offener Tastatur (App: Layout-Höhe; Online-Editor: sichtbarer Bereich, letzte Höhe vorweg).
const kb = useFullscreenKeyboard({ remember: true })
const { covered, boxStyle, dialogStyle } = kb

async function open(): Promise<void> {
  draft.value = props.modelValue
  // Das Fenster öffnet mit Fokus im Text, die Tastatur kommt also gleich.
  kb.prepare()
  await nextTick() // die Höhe steht, bevor das Fenster erscheint: nichts rückt beim Einblenden nach
  dialog.value?.showModal()
  kb.follow()
  requestAnimationFrame(() => area.value?.focus({ preventScroll: true })) // ohne preventScroll schob der Browser die Seite unter dem Fenster
}
async function close(): Promise<void> {
  // Das Fenster sofort auf die ganze Fläche legen. Es reicht dann bis hinter die Tastatur; fährt sie weg, kommt
  // darunter dasselbe ausblendende Fenster zum Vorschein und nicht ein heller Streifen der Seite mit harter Kante.
  kb.release()
  await nextTick()
  dialog.value?.close()
}
function onClosed(): void {
  kb.stop()
  emit('close')
}
function onInput(e: Event): void {
  draft.value = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', draft.value)
}
onBeforeUnmount(() => kb.stop())

defineExpose({ open, close })
</script>

<template>
  <!-- modal-top: das Fenster hängt am oberen Rand des Layouts, die Höhe endet über der Tastatur. Verdeckt die
       Tastatur auch den mittigen Dialog breiter Bildschirme, rückt er ebenfalls nach oben (dialogStyle).
       translate-none nimmt dem Fenster das Hereinfahren von oben; es blendet nur ein und aus.
       max-sm:bg-transparent: am Handy deckt das Fenster alles, ein abgedunkelter Hintergrund würde beim Schließen
       als grauer Zwischenzustand aufblitzen. -->
  <dialog ref="dialog" class="modal modal-top max-sm:bg-transparent sm:modal-middle" :style="dialogStyle" :aria-label="title" @close="onClosed">
    <div
      class="modal-box flex h-[var(--lt-h,100dvh)] max-h-none w-full max-w-none translate-none flex-col overflow-hidden rounded-none p-0 transition-[height,opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:h-[min(85vh,var(--lt-h,100dvh))] sm:w-11/12 sm:max-w-2xl sm:rounded-box"
      :style="boxStyle"
      data-long-text
    >
      <header class="flex shrink-0 items-center gap-2 border-b border-base-300 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
        <h3 class="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{{ title }}</h3>
        <button type="button" class="btn btn-primary btn-sm min-h-11 shrink-0" data-long-text-done @click="close">Fertig</button>
      </header>

      <textarea
        ref="area"
        :value="draft"
        class="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3 leading-normal text-base-content outline-none placeholder:text-base-content/70"
        :style="{ fontSize: `${LONG_TEXT_SIZE_PX[size]}px` }"
        :placeholder="placeholder ?? 'Tippen oder diktieren …'"
        :aria-label="title"
        :aria-required="required || undefined"
        @input="onInput"
      />

      <!-- Über der Tastatur braucht der Fuß keinen Abstand für den Home-Balken. -->
      <footer class="flex shrink-0 items-center gap-3 border-t border-base-300 px-4 pt-2" :class="covered ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'">
        <p class="min-w-0 flex-1 text-xs text-base-content/75">{{ hint }}</p>
        <!-- pointerdown.prevent: der Fokus bleibt im Text, die Tastatur klappt beim Umschalten nicht zu. -->
        <div class="join shrink-0" role="group" aria-label="Schriftgröße">
          <button
            v-for="s in LONG_TEXT_SIZES"
            :key="s"
            type="button"
            class="btn join-item btn-sm min-h-11 w-11 px-0"
            :class="size === s ? 'btn-neutral' : ''"
            :aria-pressed="size === s"
            :aria-label="`Schrift ${LONG_TEXT_SIZE_LABEL[s]}`"
            :title="`Schrift ${LONG_TEXT_SIZE_LABEL[s]}`"
            :data-long-text-size="s"
            @pointerdown.prevent
            @click="size = s"
          >
            <span aria-hidden="true" :style="{ fontSize: GLYPH[s] }">A</span>
          </button>
        </div>
      </footer>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
