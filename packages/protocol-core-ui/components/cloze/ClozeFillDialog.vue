<script setup lang="ts">
/**
 * Ausfüll-Fenster eines Lückentexts. Oben der Text mit seinen Lücken, darunter groß die Abfrage der
 * gewählten Lücke; man tippt sich mit „Weiter" durch oder tippt eine Lücke direkt an.
 *
 * - Am Handy füllt das Fenster den Bildschirm. Seine Höhe folgt dem SICHTBAREN Bereich (visualViewport):
 *   iOS legt die Tastatur über die Seite, ohne das Layout zu verkleinern - ohne diese Anpassung lägen
 *   Abfrage und „Weiter" hinter der Tastatur.
 * - Abschluss („Fertig") steht im Kopf und ist nie verdeckt. Jede Antwort gilt sofort, es gibt kein
 *   Abbrechen und nichts zu verlieren.
 * - Beim Durchtippen werden offene Lücken abgefragt; Lücken mit Standardwert nur, wenn die Vorlage das
 *   verlangt (`askDefaults`). Antippen geht immer.
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { clozeOf, clozeGaps } from '@resqdocs/protocol-core/cloze'
import { gapState, nextAsking, clozeSummary } from '@resqdocs/protocol-core/clozeFill'
import { findPath } from '@resqdocs/protocol-core/creator'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'
import { longTextSizeKey } from '../../injection.ts'
import { LONG_TEXT_SIZES, LONG_TEXT_SIZE_DEFAULT, LONG_TEXT_SIZE_LABEL, LONG_TEXT_SIZE_PX, type LongTextSize } from '../../longTextSize.ts'
import { keyboardCovers, visibleBox, type VisibleBox } from '../../visibleViewport.ts'
import { useCaseValues } from '../../useCaseValues.ts'
import { useDependencyHidden } from '../../useDependencies.ts'
import RequiredMark from '../RequiredMark.vue'
import MedplanFunction from '../functions/MedplanFunction.vue'
import AerzteFunction from '../functions/AerzteFunction.vue'
import ScoreFunction from '../functions/ScoreFunction.vue'
import ClozeText from './ClozeText.vue'
import GapAnswer from './GapAnswer.vue'

const props = defineProps<{ node: Container; root: Container | null }>()
const emit = defineEmits<{ close: [] }>()
const caseValues = useCaseValues()
const dependencyHidden = useDependencyHidden()

const title = computed(() => (props.node.title && props.node.title.trim()) || 'Lückentext')
const askDefaults = computed(() => !!clozeOf(props.node)?.askDefaults)
const gaps = computed(() => clozeGaps(props.root, props.node).filter((g) => !dependencyHidden.value.has(g.id)))
const states = computed(() => gaps.value.map((g) => gapState(g.node, caseValues.values.value[g.id])))
const currentId = ref<string | null>(null)
const index = computed(() => gaps.value.findIndex((g) => g.id === currentId.value))
const current = computed(() => (index.value >= 0 ? gaps.value[index.value] : null))
const currentLabel = computed(() => (current.value?.node.title && current.value.node.title.trim()) || 'Lücke')
const requiredOpen = computed(() => gaps.value.filter((g) => isRequiredOpen(g.node, caseValues.values.value[g.id])).length)
const summary = computed(() => clozeSummary(gaps.value.length, states.value.filter((s) => s === 'open').length, requiredOpen.value))
/** Wo das Element liegt, dessen Wert die Lücke übernimmt (Abschnitt › Feld). */
const sourcePath = computed(() => {
  const gap = current.value
  if (!gap || gap.own || !props.root) return ''
  return findPath(props.root, gap.id)
    .slice(1)
    .map((n) => (n.title && n.title.trim()) || n.id)
    .join(' › ')
})

// In diesem Durchgang schon abgefragt - kommt beim Durchtippen nicht noch einmal.
let seen = new Set<string>()
function askingAfter(from: number): number {
  return nextAsking(states.value, gaps.value.map((g) => seen.has(g.id)), askDefaults.value, from)
}
function next(): void {
  if (current.value) seen.add(current.value.id)
  let i = askingAfter(index.value)
  if (i < 0) i = askingAfter(-1) // weiter vorn ist noch etwas offen (man war direkt zu einer späteren Lücke gesprungen)
  currentId.value = i >= 0 ? gaps.value[i].id : null
}
function prev(): void {
  const i = index.value < 0 ? gaps.value.length - 1 : index.value - 1
  if (i >= 0) currentId.value = gaps.value[i].id
}

const dialog = ref<HTMLDialogElement | null>(null)
const answer = ref<{ focusText: () => boolean } | null>(null)
watch(currentId, async () => {
  await nextTick()
  // Freitext: Tastatur gleich auf. Sonst die Tastatur der vorigen Lücke schließen.
  if (!answer.value?.focusText()) {
    const active = document.activeElement as HTMLElement | null
    if (active && dialog.value?.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) active.blur()
  }
  dialog.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
})

const provided = inject(longTextSizeKey, null)
const local = ref<LongTextSize>(LONG_TEXT_SIZE_DEFAULT)
const size = computed<LongTextSize>({
  get: () => provided?.value ?? local.value,
  set: (v) => {
    if (provided) provided.value = v
    else local.value = v
  },
})
const GLYPH: Record<LongTextSize, string> = { sm: '0.8rem', md: '1rem', lg: '1.25rem' }

// Sichtbarer Bereich: Höhe und Versatz des Fensters folgen ihm, solange es offen ist.
const box = ref<VisibleBox | null>(null)
const covered = ref(false)
const closing = ref(false)
// Der Inhalt entsteht erst beim Öffnen: ein geschlossenes Fenster rechnet und rendert nichts mit.
const active = ref(false)
function measure(): void {
  const vv = window.visualViewport
  const layout = window.innerHeight
  box.value = visibleBox(vv, layout)
  covered.value = keyboardCovers(vv, layout)
}
function track(on: boolean): void {
  const vv = window.visualViewport
  if (!vv) return
  for (const ev of ['resize', 'scroll'] as const) {
    if (on) vv.addEventListener(ev, measure)
    else vv.removeEventListener(ev, measure)
  }
}
const boxStyle = computed(() =>
  box.value
    ? {
        '--lt-h': `${box.value.height}px`,
        transform: box.value.top ? `translateY(${box.value.top}px)` : undefined,
        transitionProperty: closing.value ? 'opacity' : undefined,
      }
    : undefined,
)

/** Öffnen. Mit `startId` direkt an dieser Lücke, sonst an der ersten, die abzufragen ist. */
async function open(startId?: string | null): Promise<void> {
  seen = new Set()
  closing.value = false
  active.value = true
  measure()
  await nextTick()
  dialog.value?.showModal()
  track(true)
  const first = askingAfter(-1)
  currentId.value = startId ?? (first >= 0 ? gaps.value[first].id : null)
}
/** Schließen: erst auf volle Höhe (nur ausblenden, nicht gegen die Tastatur fahren), dann zu. */
async function close(): Promise<void> {
  track(false)
  closing.value = true
  covered.value = false
  box.value = { top: 0, height: window.innerHeight }
  await nextTick()
  dialog.value?.close()
}
function onClosed(): void {
  track(false)
  currentId.value = null
  active.value = false
  emit('close')
}
onBeforeUnmount(() => track(false))
defineExpose({ open, close })
</script>

<template>
  <!-- Aufbau und Tastatur-Verhalten wie beim großen Textfeld (LongTextDialog). -->
  <dialog ref="dialog" class="modal modal-top max-sm:bg-transparent sm:modal-middle" :style="covered ? { placeItems: 'start center' } : undefined" :aria-label="title" @close="onClosed">
    <div
      class="modal-box flex h-[var(--lt-h,100dvh)] max-h-none w-full max-w-none translate-none flex-col overflow-hidden rounded-none p-0 transition-[height,opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:h-[min(85vh,var(--lt-h,100dvh))] sm:w-11/12 sm:max-w-2xl sm:rounded-box"
      :style="boxStyle"
      data-cloze-fill
    >
      <template v-if="active">
      <header class="flex shrink-0 items-center gap-2 border-b border-base-300 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
        <h3 class="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{{ title }}</h3>
        <button type="button" class="btn btn-primary btn-sm min-h-11 shrink-0" data-cloze-done @click="close">Fertig</button>
      </header>

      <!-- Über der Tastatur wird es eng: der Text behält mindestens eine Zeile, die Abfrage gibt Platz ab. -->
      <div class="min-h-10 flex-1 overflow-y-auto px-4" :class="covered ? 'py-1.5' : 'py-3'" :style="{ fontSize: `${LONG_TEXT_SIZE_PX[size]}px` }" data-cloze-sentence>
        <ClozeText :node="node" :root="root" :selected="currentId" @pick="currentId = $event" />
      </div>

      <section class="min-h-0 shrink overflow-y-auto border-t border-base-300 px-4 py-3" :class="current ? 'max-h-[62%]' : ''" data-cloze-panel>
        <template v-if="current">
          <div class="mb-2 flex items-baseline gap-2">
            <h4 class="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]" :class="current.node.type === 'function' ? 'sr-only' : ''">
              {{ currentLabel }}
              <RequiredMark v-if="current.node.required" :open="isRequiredOpen(current.node, caseValues.values.value[current.id])" />
            </h4>
            <span class="ml-auto shrink-0 text-sm text-base-content/80" data-cloze-count>{{ index + 1 }} von {{ gaps.length }}</span>
          </div>
          <p v-if="!current.own" class="mb-2 text-sm text-base-content/80" data-cloze-source>Wert aus „{{ sourcePath }}“. Eine Änderung gilt auch dort.</p>
          <GapAnswer v-if="current.node.type === 'field'" ref="answer" :key="current.id" :node="current.node" @advance="next" />
          <MedplanFunction v-else-if="current.node.functionKind === 'medikamentenplan'" :key="`m-${current.id}`" :node="current.node" />
          <AerzteFunction v-else-if="current.node.functionKind === 'aerzte'" :key="`a-${current.id}`" :node="current.node" />
          <ScoreFunction v-else :key="`s-${current.id}`" :node="current.node" />
        </template>
        <div v-else class="space-y-1" data-cloze-summary>
          <p class="text-base font-medium">{{ summary }}</p>
          <p v-if="gaps.length" class="text-sm text-base-content/80">Jede Lücke lässt sich im Text antippen und ändern.</p>
        </div>
      </section>

      <!-- Über der Tastatur braucht der Fuß keinen Abstand für den Home-Balken.
           pointerdown.prevent: der Fokus bleibt im Feld, die Tastatur klappt zwischen zwei Freitext-Lücken nicht zu. -->
      <footer class="flex shrink-0 items-center gap-2 border-t border-base-300 px-4 pt-2" :class="covered ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'">
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
            :data-cloze-size="s"
            @pointerdown.prevent
            @click="size = s"
          >
            <span aria-hidden="true" :style="{ fontSize: GLYPH[s] }">A</span>
          </button>
        </div>
        <span class="min-w-0 flex-1" />
        <button type="button" class="btn btn-sm min-h-11 w-11 shrink-0 px-0" aria-label="Vorherige Lücke" title="Vorherige Lücke" :disabled="!gaps.length || index === 0" data-cloze-prev @pointerdown.prevent @click="prev">
          <svg aria-hidden="true" viewBox="0 0 20 20" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
        </button>
        <button type="button" class="btn btn-neutral btn-sm min-h-11 shrink-0" :disabled="!current" data-cloze-next @pointerdown.prevent @click="next">Weiter</button>
      </footer>
      </template>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
