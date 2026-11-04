<script setup lang="ts">
/**
 * ⓘ mit Erklaerung. Das Symbol ist klein, die Tippflaeche 44 x 44 pt (negative Raender: das Layout bleibt kompakt).
 * Tippen oeffnet, nochmal tippen oder daneben tippen schliesst; der Tipp daneben loest darunter nichts aus. Am PC
 * oeffnet zusaetzlich das Drueberfahren. Teleport an body: die Eltern schneiden sonst ab (overflow im ＋-Menue,
 * backdrop-blur im Einsatz). Darf in einem <label> stehen: der Tipp schaltet den Schalter dort nicht um.
 */
import { nextTick, onBeforeUnmount, ref, useId, useTemplateRef } from 'vue'
import { infoTipPosition } from '../infoTipPosition.ts'
import { infoSegments, type InfoText } from '../terms.ts'
import InfoIcon from './InfoIcon.vue'
import TabRef from './TabRef.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ info: InfoText }>()

const panelId = useId()
const open = ref(false)
const pinned = ref(false)
const pos = ref({ left: 0, top: 0 })
const button = useTemplateRef<HTMLButtonElement>('button')
const panel = useTemplateRef<HTMLElement>('panel')
let hideTimer: ReturnType<typeof setTimeout> | null = null

function canHover(): boolean {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
function onViewportChange(e: Event): void {
  if (e.target instanceof Node && panel.value?.contains(e.target)) return // Scrollen in der Erklaerung selbst
  close()
}
function cancelHide(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}
async function show(pin: boolean): Promise<void> {
  cancelHide()
  pinned.value = pin || pinned.value
  if (open.value) return
  open.value = true
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  await nextTick()
  const a = button.value?.getBoundingClientRect()
  const p = panel.value?.getBoundingClientRect()
  if (!a || !p) return
  const height = window.visualViewport?.height ?? window.innerHeight
  pos.value = infoTipPosition(a, p, { left: 0, top: 0, width: window.innerWidth, height })
}
function close(): void {
  cancelHide()
  open.value = false
  pinned.value = false
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
}
function toggle(): void {
  if (open.value && pinned.value) close()
  else void show(true)
}
function onEnter(): void {
  if (canHover()) void show(false)
  else cancelHide()
}
function onLeave(): void {
  if (!open.value || pinned.value) return
  hideTimer = setTimeout(close, 150) // Zeit, um mit der Maus in die Erklaerung zu wechseln
}
onBeforeUnmount(close)
</script>

<template>
  <button
    v-bind="$attrs"
    ref="button"
    type="button"
    class="-mx-2.5 -my-3 inline-flex size-11 shrink-0 cursor-help items-center justify-center rounded-full align-middle hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    :class="open ? 'text-primary' : 'text-base-content/55'"
    :aria-label="`Erklärung: ${props.info.title}`"
    :aria-expanded="open"
    :aria-controls="open ? panelId : undefined"
    @click.stop.prevent="toggle"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <InfoIcon class="size-[18px]" />
  </button>
  <Teleport to="body">
    <template v-if="open">
      <button v-if="pinned" type="button" class="fixed inset-0 z-[1000] cursor-default" aria-label="Erklärung schließen" @click.stop="close"></button>
      <div
        :id="panelId"
        ref="panel"
        role="note"
        class="overlay-surface fixed z-[1001] flex max-h-[calc(100dvh-1.5rem)] w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-1.5 overflow-y-auto rounded-box p-3 text-left text-sm font-normal text-base-content"
        :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
        @mouseenter="cancelHide"
        @mouseleave="onLeave"
      >
        <p class="font-semibold">{{ props.info.title }}</p>
        <p v-if="props.info.text" class="text-base-content/80">
          <template v-for="(seg, i) in infoSegments(props.info.text)" :key="i"><TabRef v-if="'tab' in seg" :tab="seg.tab" /><template v-else>{{ seg.text }}</template></template>
        </p>
        <dl v-if="props.info.items" class="flex flex-col gap-1.5">
          <div v-for="item in props.info.items" :key="item.term">
            <dt class="font-semibold">{{ item.term }}</dt>
            <dd class="text-base-content/80">
              <template v-for="(seg, i) in infoSegments(item.text)" :key="i"><TabRef v-if="'tab' in seg" :tab="seg.tab" /><template v-else>{{ seg.text }}</template></template>
            </dd>
          </div>
        </dl>
        <div v-for="ex in props.info.examples" :key="ex.label">
          <p class="text-xs text-base-content/60">{{ ex.label }}</p>
          <pre class="overflow-x-auto rounded bg-base-200 px-2 py-1 font-mono text-xs whitespace-pre-wrap">{{ ex.output }}</pre>
        </div>
      </div>
    </template>
  </Teleport>
</template>
