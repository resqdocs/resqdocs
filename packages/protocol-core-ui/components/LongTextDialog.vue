<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { longTextSizeKey } from '../injection.ts'
import { LONG_TEXT_SIZES, LONG_TEXT_SIZE_DEFAULT, LONG_TEXT_SIZE_LABEL, LONG_TEXT_SIZE_PX, type LongTextSize } from '../longTextSize.ts'
import { keyboardCovers, visibleBox, type VisibleBox } from '../visibleViewport.ts'

/**
 * Fenster zum Schreiben langer Texte. Am Handy füllt es den ganzen Bildschirm (ein langer Text ist eine eigene
 * Aufgabe, kein Nebenbei), auf breiten Bildschirmen bleibt es ein mittiger Dialog.
 *
 * Aufbau von oben nach unten:
 *   - Kopf: Titel und „Fertig“. Der Knopf steht oben, weil die Tastatur alles am unteren Rand verdeckt -
 *     unten war er beim Tippen nicht zu sehen.
 *   - Text: füllt den Platz ÜBER der Tastatur. Die Höhe folgt dem sichtbaren Bereich (visibleViewport.ts),
 *     damit die Schreibmarke nie hinter der Tastatur verschwindet. Kein Rahmen: der ganze Bildschirm ist das
 *     Feld.
 *   - Fuß: Hinweis (z. B. dass sofort gespeichert wird) und die Schriftgröße in drei Stufen.
 *
 * Bewegung: Das Fenster blendet ein und aus, es fährt NICHT herein. Die Tastatur kommt von unten; ein Fenster,
 * das gleichzeitig von oben hereinfährt, wirkt unruhig. Ändert sich der sichtbare Bereich (Tastatur auf oder zu),
 * gleitet die Höhe, statt zu springen. Beim erneuten Öffnen steht das Fenster gleich in der zuletzt gemessenen
 * Höhe über der Tastatur, und beim Schließen bleibt die Höhe stehen, bis es ausgeblendet ist.
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

// Sichtbarer Bereich über der Tastatur, solange das Fenster offen ist.
const box = ref<VisibleBox | null>(null)
const covered = ref(false)
function measure(): void {
  const vv = window.visualViewport
  const layout = window.innerHeight
  box.value = visibleBox(vv, layout)
  covered.value = keyboardCovers(vv, layout)
  if (covered.value) lastWithKeyboard = { layout, height: box.value.height }
}
function track(on: boolean): void {
  const vv = window.visualViewport
  if (!vv) return
  for (const ev of ['resize', 'scroll'] as const) {
    if (on) vv.addEventListener(ev, measure)
    else vv.removeEventListener(ev, measure)
  }
}
// Beim Schließen wird nur noch ausgeblendet: die Höhe springt ohne Gleiten auf die volle Fläche (siehe close()).
const closing = ref(false)
const boxStyle = computed(() =>
  box.value
    ? {
        '--lt-h': `${box.value.height}px`,
        transform: box.value.top ? `translateY(${box.value.top}px)` : undefined,
        transitionProperty: closing.value ? 'opacity' : undefined,
      }
    : undefined,
)

let settle: ReturnType<typeof setTimeout> | undefined
async function open(): Promise<void> {
  draft.value = props.modelValue
  closing.value = false
  // Das Fenster öffnet mit Fokus im Text, die Tastatur kommt also gleich. Ist ihre Höhe von vorhin bekannt (und
  // das Gerät nicht gedreht), steht das Fenster sofort richtig und die Tastatur fährt darunter ein.
  const expected = lastWithKeyboard && lastWithKeyboard.layout === window.innerHeight ? lastWithKeyboard.height : null
  if (expected) {
    box.value = { top: 0, height: expected }
    covered.value = true
  } else measure()
  await nextTick() // die Höhe steht, bevor das Fenster erscheint: nichts rückt beim Einblenden nach
  dialog.value?.showModal()
  track(true)
  requestAnimationFrame(() => area.value?.focus())
  // Kam doch keine Tastatur (z. B. Hardware-Tastatur am Tablet), ersetzt der Messwert die Annahme.
  clearTimeout(settle)
  settle = setTimeout(measure, 700)
}
async function close(): Promise<void> {
  // Nicht mehr der Tastatur folgen und das Fenster sofort auf die ganze Fläche legen. Es reicht dann bis hinter
  // die Tastatur; fährt sie weg, kommt darunter dasselbe ausblendende Fenster zum Vorschein und nicht ein heller
  // Streifen der Seite mit harter Kante.
  track(false)
  clearTimeout(settle)
  closing.value = true
  covered.value = false
  box.value = { top: 0, height: window.innerHeight }
  await nextTick()
  dialog.value?.close()
}
function onClosed(): void {
  track(false)
  clearTimeout(settle)
  emit('close')
}
function onInput(e: Event): void {
  draft.value = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', draft.value)
}
onBeforeUnmount(() => {
  track(false)
  clearTimeout(settle)
})

defineExpose({ open, close })
</script>

<script lang="ts">
// Zuletzt gemessene sichtbare Höhe bei offener Tastatur, zusammen mit der Layout-Höhe, für die sie gilt.
// Für alle Schreib-Fenster der App gemeinsam; gilt, solange die App läuft.
let lastWithKeyboard: { layout: number; height: number } | null = null
</script>

<template>
  <!-- modal-top: das Fenster hängt am oberen Rand des Layouts, die Höhe endet über der Tastatur. Verdeckt die
       Tastatur auch den mittigen Dialog breiter Bildschirme, rückt er ebenfalls nach oben.
       translate-none nimmt dem Fenster das Hereinfahren von oben; es blendet nur ein und aus.
       max-sm:bg-transparent: am Handy deckt das Fenster alles, ein abgedunkelter Hintergrund würde beim Schließen
       als grauer Zwischenzustand aufblitzen. -->
  <dialog ref="dialog" class="modal modal-top max-sm:bg-transparent sm:modal-middle" :style="covered ? { placeItems: 'start center' } : undefined" :aria-label="title" @close="onClosed">
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
