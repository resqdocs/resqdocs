<script setup lang="ts">
/**
 * Lückentext einrichten (Vorlage). EINE Ansicht: der Text als Ganzes, jede Lücke steht als {Name} und ist farbig
 * hinterlegt. Ein Tipp in den Text setzt nur die Schreibmarke, nie eine Lücke (Maintainer 2026-11-22: im früheren
 * Modus „Lücken“ machte jeder Tipp ungewollt eine Lücke). Eine Lücke entsteht nur bewusst: Markierung und
 * „Lücke aus Markierung“, „Lücke hier einfügen“ an der Schreibmarke oder ein getippter {Name}. Steht die
 * Schreibmarke in einer Lücke, öffnet derselbe Knopf ihre Einstellungen; darunter stehen alle Lücken als Liste.
 * Jede Lücke ist ein normales Feld oder eine Funktion des Abschnitts (oder übernimmt den Wert eines
 * Elements an anderer Stelle der Vorlage); alle weiteren Einstellungen stehen dort wie bei jedem Feld.
 * Fensteraufbau und Tastatur-Verhalten wie beim Ausfüll-Fenster.
 */
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Container, Field, FunctionKind } from '@resqdocs/protocol-core/model'
import { clozeGaps } from '@resqdocs/protocol-core/cloze'
import { applyText, foreignCandidates, gapFromRange, gapNames, removeGap, retargetGap, revertGap, sectionText, tokenize } from '@resqdocs/protocol-core/clozeEdit'
import { collectIds, createField, createFunction } from '@resqdocs/protocol-core/creator'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import { allowedFunctionKindsKey, longTextSizeKey } from '../../injection.ts'
import { LONG_TEXT_SIZE_DEFAULT, LONG_TEXT_SIZE_PX } from '../../longTextSize.ts'
import { keyboardCovers, visibleBox, type VisibleBox } from '../../visibleViewport.ts'
import { useTreeEditor } from '../../treeEditor.ts'

const props = defineProps<{ node: Container; root: Container }>()
const emit = defineEmits<{ close: [] }>()
const tree = useTreeEditor()

const text = computed(() => sectionText(props.node, props.root))
const names = computed(() => gapNames(props.node, props.root))
const gaps = computed(() => clozeGaps(props.root, props.node))

/** Frische Kennungen, die es in der Vorlage noch nicht gibt. */
function idFactory(): () => string {
  const taken = new Set(collectIds(props.root))
  let n = 0
  return () => {
    let id: string
    do id = `l${++n}`
    while (taken.has(id))
    taken.add(id)
    return id
  }
}
function commit(next: Container): void {
  if (next !== props.node) tree.update(props.node.id, { children: next.children, cloze: next.cloze })
}

// --- Text ---
const draft = ref('')
const area = ref<HTMLTextAreaElement | null>(null)
const back = ref<HTMLDivElement | null>(null)
const hasSelection = ref(false)
const caret = ref(0)
const notice = ref('')
function readSelection(): void {
  const el = area.value
  if (!el) return
  hasSelection.value = el.selectionEnd > el.selectionStart
  caret.value = el.selectionStart
}
/** Getippten Text übernehmen (neue {Name} werden Lücken). Unverändert: nichts tun, sonst entstünde ein leerer Schritt. */
function commitDraft(): void {
  if (draft.value !== text.value) commit(applyText(props.node, props.root, draft.value, idFactory()))
}
// Ändert sich der Text von außen (Name einer Lücke, Zurück in Text, Löschen), zieht der Entwurf nach,
// solange nicht gerade im Text getippt wird.
watch(text, (t) => {
  if (document.activeElement !== area.value) draft.value = t
})
/** Hinterlegung der Lücken: derselbe Text unter dem Eingabefeld, nur die {Name}-Stellen sichtbar eingefärbt. */
const shades = computed(() => {
  const out: { key: string; text: string; gap: boolean }[] = []
  let at = 0
  for (const m of draft.value.matchAll(/\{[^{}\n]+\}/g)) {
    if (m.index > at) out.push({ key: `t${at}`, text: draft.value.slice(at, m.index), gap: false })
    out.push({ key: `g${m.index}`, text: m[0], gap: true })
    at = m.index + m[0].length
  }
  out.push({ key: `t${at}`, text: draft.value.slice(at) + '\n', gap: false })
  return out
})
function syncScroll(): void {
  if (back.value && area.value) back.value.scrollTop = area.value.scrollTop
}
/** Lücke, in der die Schreibmarke steht (nur bestehende Lücken mit Kennung). */
const gapAtCaret = computed(() => {
  if (hasSelection.value) return null
  return tokenize(draft.value, names.value).find((t) => t.kind === 'gap' && t.id && caret.value > t.start && caret.value < t.end) ?? null
})
const markLabel = computed(() => (gapAtCaret.value ? `Lücke „${gapAtCaret.value.text}“ einstellen` : hasSelection.value ? 'Lücke aus Markierung' : 'Lücke hier einfügen'))
function selectGap(id: string): void {
  commitDraft()
  leavePanel()
  notice.value = ''
  selected.value = id
}
/** Der Knopf unter dem Text: Lücke an der Schreibmarke einstellen, sonst Markierung (oder Stelle) zur Lücke machen. */
async function onMark(): Promise<void> {
  // Erst die offenen Antworten sichern und den neuen Stand abwarten: Die neue Lücke wird aus dem ganzen Abschnitt
  // gebaut und würde sonst mit dem Stand von vorher die gerade gesicherten Antworten überschreiben.
  if (leavePanel()) await nextTick()
  const at = gapAtCaret.value
  if (at?.id) return selectGap(at.id)
  gapFromSelection()
}
/** Markierung (oder die Stelle der Schreibmarke) zur Lücke machen. */
function gapFromSelection(): void {
  const el = area.value
  if (!el) return
  const newId = idFactory()
  const applied = applyText(props.node, props.root, draft.value, newId)
  const made = sectionText(applied, props.root) === draft.value ? gapFromRange(applied, props.root, draft.value, el.selectionStart, el.selectionEnd, newId) : null
  if (!made) {
    commit(applied)
    notice.value = 'Hier lässt sich keine Lücke anlegen: Die Markierung berührt eine bestehende Lücke.'
    return
  }
  commit(made.section)
  draft.value = sectionText(made.section, props.root)
  notice.value = ''
  selected.value = made.id
  hasSelection.value = false
}

// --- Gewählte Lücke ---
const selected = ref<string | null>(null)
const current = computed(() => gaps.value.find((g) => g.id === selected.value) ?? null)
// Öffnen sich die Einstellungen einer Lücke, verlässt der Fokus den Text: Am Handy geht die Tastatur zu, sonst
// teilen sich Tastatur, Einstellungen und Text den Platz und der Text schrumpft auf nichts.
watch(selected, (id) => {
  if (id && document.activeElement === area.value) area.value?.blur()
})

// --- Einstellungen der gewählten Lücke ---
const allowedKinds = inject(allowedFunctionKindsKey, null)
const functionKinds = computed(() => {
  const all = Object.keys(FUNCTION_REGISTRY) as FunctionKind[]
  const kinds = allowedKinds ? all.filter((k) => allowedKinds.value.includes(k)) : all
  return kinds.map((kind) => ({ kind, label: FUNCTION_REGISTRY[kind].label }))
})
const candidates = computed(() => foreignCandidates(props.root, props.node))
// „Auswahl" gewählt, aber noch keine Antworten eingetragen: die Art soll trotzdem stehen bleiben.
const pendingChoice = ref<string | null>(null)
const kind = computed(() => {
  const gap = current.value
  if (!gap) return ''
  if (!gap.own) return `from:${gap.id}`
  if (gap.node.type === 'function') return `fn:${gap.node.functionKind}`
  const hasOptions = !!gap.node.options?.some((o) => o !== '')
  if (gap.node.multiple) return 'multi'
  return hasOptions || pendingChoice.value === gap.id ? 'choice' : 'text'
})
function setKind(value: string): void {
  const gap = current.value
  if (!gap || value === kind.value) return
  pendingChoice.value = null
  if (value.startsWith('from:')) {
    const target = value.slice(5)
    commit(retargetGap(props.node, gap.id, target))
    selected.value = target
    return
  }
  const id = gap.own ? gap.id : idFactory()()
  if (value.startsWith('fn:')) {
    commit(retargetGap(props.node, gap.id, id, createFunction(id, value.slice(3) as FunctionKind)))
  } else {
    const base: Field = gap.own && gap.node.type === 'field' ? gap.node : { ...createField(id), title: gap.node.title }
    const options = (base.options ?? []).filter((o) => o !== '')
    const next: Field =
      value === 'text'
        ? { ...base, options: undefined, multiple: undefined, defaultEmpty: undefined, exclusiveOptions: undefined, multiSeparator: undefined, allowCustom: undefined }
        : {
            ...base,
            options: options.length ? options : base.default ? [base.default] : undefined,
            multiple: value === 'multi' ? true : undefined,
            // Mehrfachauswahl in einem Satz startet ohne Vorauswahl; sonst stünde die erste Antwort ungefragt im Text.
            defaultEmpty: value === 'multi' ? true : undefined,
            exclusiveOptions: value === 'multi' ? base.exclusiveOptions : undefined,
            multiSeparator: value === 'multi' ? base.multiSeparator : undefined,
          }
    if (value === 'choice') pendingChoice.value = id
    commit(retargetGap(props.node, gap.id, id, next))
  }
  selected.value = id
}
const ownField = computed(() => (current.value?.own && current.value.node.type === 'field' ? current.value.node : null))
const optionsText = computed(() => (ownField.value?.options ?? []).join('\n'))
// Entwurf der Antworten, solange das Feld bearbeitet wird. Ohne ihn setzt jedes Neuzeichnen des Fensters (z. B. wenn
// die Tastatur auf- oder zugeht und der sichtbare Bereich neu gemessen wird) das Feld auf den gespeicherten Stand
// zurück, weil erst beim Verlassen übernommen wird.
const optionsDraft = ref<string | null>(null)
watch(selected, () => {
  optionsDraft.value = null
})
const panel = ref<HTMLElement | null>(null)
/**
 * Vor jedem Wechsel der Lücke und vor dem Schließen: Getippte Antworten gehören der Lücke, bei der sie getippt
 * wurden. Die Knöpfe der Lückenliste und der Knopf darüber nehmen dem Feld den Fokus nicht weg; ohne diesen Schritt
 * käme die Übernahme erst nach dem Wechsel und träfe die nächste Lücke, während die erste leer bliebe.
 */
function commitOptions(): boolean {
  if (optionsDraft.value == null) return false
  setOptions(optionsDraft.value)
  optionsDraft.value = null
  return true
}
/** Gibt zurück, ob dabei Antworten übernommen wurden. */
function leavePanel(): boolean {
  const committed = commitOptions()
  const el = document.activeElement as HTMLElement | null
  if (el && panel.value?.contains(el)) el.blur()
  return committed
}
function setOptions(value: string): void {
  const field = ownField.value
  if (!field) return
  const options = [...new Set(value.split('\n').map((o) => o.trim()).filter((o) => o !== ''))]
  // Solange getippt wird, bleibt eine angefangene Zeile erhalten: erst beim Verlassen wird bereinigt.
  tree.update(field.id, { options: options.length ? options : undefined, default: field.default != null && options.includes(field.default) ? field.default : undefined })
}
function patch(changes: Record<string, unknown>): void {
  if (current.value?.own) tree.update(current.value.id, changes)
}
function backToText(): void {
  if (!current.value) return
  commit(revertGap(props.node, props.root, current.value.id))
  selected.value = null
}
function deleteGap(): void {
  if (!current.value) return
  commit(removeGap(props.node, current.value.id))
  selected.value = null
}

const sizeRef = inject(longTextSizeKey, null)
const fontSize = computed(() => `${LONG_TEXT_SIZE_PX[sizeRef?.value ?? LONG_TEXT_SIZE_DEFAULT]}px`)

// --- Fenster: Höhe folgt dem sichtbaren Bereich ---
const dialog = ref<HTMLDialogElement | null>(null)
const active = ref(false)
const box = ref<VisibleBox | null>(null)
const covered = ref(false)
const closing = ref(false)
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
async function open(): Promise<void> {
  closing.value = false
  active.value = true
  selected.value = null
  notice.value = ''
  hasSelection.value = false
  caret.value = 0
  draft.value = text.value
  measure()
  await nextTick()
  dialog.value?.showModal()
  track(true)
  // Leerer Lückentext: gleich schreiben.
  if (text.value === '') requestAnimationFrame(() => area.value?.focus())
}
async function close(): Promise<void> {
  commitDraft()
  leavePanel()
  track(false)
  closing.value = true
  covered.value = false
  box.value = { top: 0, height: window.innerHeight }
  await nextTick()
  dialog.value?.close()
}
function onClosed(): void {
  commitDraft() // auch beim Schließen über Escape oder den Rand geht nichts Getipptes verloren
  leavePanel()
  track(false)
  active.value = false
  emit('close')
}
/** Alle Einstellungen der Lücke: das Element im Baum auswählen und das Fenster schließen. */
function openSettings(): void {
  const id = current.value?.id
  void close().then(() => id && tree.select(id))
}
onBeforeUnmount(() => track(false))
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="modal modal-top max-sm:bg-transparent sm:modal-middle" :style="covered ? { placeItems: 'start center' } : undefined" aria-label="Lückentext einrichten" @close="onClosed">
    <div
      class="modal-box flex h-[var(--lt-h,100dvh)] max-h-none w-full max-w-none translate-none flex-col overflow-hidden rounded-none p-0 transition-[height,opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:h-[min(85vh,var(--lt-h,100dvh))] sm:w-11/12 sm:max-w-2xl sm:rounded-box"
      :style="boxStyle"
      data-cloze-editor
    >
      <template v-if="active">
        <header class="flex shrink-0 items-center gap-2 border-b border-base-300 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:pt-2">
          <h3 class="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">Lückentext einrichten</h3>
          <button type="button" class="btn btn-primary btn-sm min-h-11 shrink-0" data-cloze-editor-done @click="close">Fertig</button>
        </header>

        <!-- Der Text: Lücken als {Name}, farbig hinterlegt. Ein Tipp setzt nur die Schreibmarke.
             min-h-24: bleibt bei offener Tastatur und offenen Einstellungen sichtbar; schrumpfen und scrollen
             müssen die Einstellungen darunter. -->
        <div class="relative min-h-24 flex-1" data-cloze-editor-textbox>
          <!-- Hinterlegung: gleicher Text, gleiche Maße, nur die Lücken sichtbar eingefärbt. -->
          <div ref="back" aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap px-4 py-3 leading-normal text-transparent [overflow-wrap:anywhere] [scrollbar-gutter:stable]" :style="{ fontSize }" data-cloze-editor-shade><template v-for="sh in shades" :key="sh.key"><mark v-if="sh.gap" class="rounded bg-neutral/15 text-transparent">{{ sh.text }}</mark><template v-else>{{ sh.text }}</template></template></div>
          <textarea
            ref="area"
            v-model="draft"
            class="relative block h-full min-h-0 w-full resize-none border-0 bg-transparent px-4 py-3 leading-normal text-base-content outline-none placeholder:text-base-content/70 [overflow-wrap:anywhere] [scrollbar-gutter:stable]"
            :style="{ fontSize }"
            placeholder="Text schreiben. Ein Wort markieren und „Lücke aus Markierung“ antippen – oder {Name} tippen."
            aria-label="Text des Lückentexts"
            data-cloze-editor-text
            @select="readSelection"
            @keyup="readSelection"
            @pointerup="readSelection"
            @input="readSelection"
            @focus="selected = null"
            @blur="commitDraft"
            @scroll="syncScroll"
          />
        </div>

        <!-- Unten am Rand (ohne Tastatur, ohne Einstellungen) hält die Leiste Abstand zum Home-Balken. -->
        <div class="shrink-0 space-y-2 border-t border-base-300 px-4 pt-2" :class="covered || current ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'" data-cloze-editor-actions>
          <p v-if="notice" class="text-sm font-medium" role="status">{{ notice }}</p>
          <!-- pointerdown.prevent: Fokus und Markierung bleiben im Text stehen. -->
          <button type="button" class="btn btn-neutral btn-sm min-h-11 w-full" data-cloze-editor-mark @pointerdown.prevent @click="onMark">{{ markLabel }}</button>
          <div v-if="gaps.length" class="flex flex-wrap gap-1.5" role="group" aria-label="Lücken in diesem Text" data-cloze-editor-gaps>
            <button
              v-for="g in gaps"
              :key="g.id"
              type="button"
              class="btn btn-sm min-h-11 max-w-full [overflow-wrap:anywhere]"
              :class="selected === g.id ? 'btn-neutral' : ''"
              :aria-pressed="selected === g.id"
              :aria-label="`Lücke ${names.get(g.id) ?? g.id} einstellen`"
              :data-cloze-editor-gap="g.id"
              @pointerdown.prevent
              @click="selectGap(g.id)"
            >
              {{ names.get(g.id) ?? g.id }}
            </button>
          </div>
          <p v-else class="text-sm text-base-content/80">Noch keine Lücken. Markiere ein Wort und tippe „Lücke aus Markierung“, oder tippe {Name} in den Text.</p>
        </div>

        <!-- Einstellungen der gewählten Lücke -->
        <section v-if="current" ref="panel" class="max-h-[55%] min-h-0 shrink overflow-y-auto border-t border-base-300 px-4 pt-3" :class="covered ? 'pb-3' : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]'" data-cloze-editor-panel>
          <div class="mb-2 flex items-center gap-2">
            <h4 class="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">Lücke „{{ names.get(current.id) ?? current.id }}“</h4>
            <button type="button" class="btn btn-ghost btn-sm min-h-11 shrink-0" title="Einstellungen der Lücke schließen" aria-label="Einstellungen der Lücke schließen" data-cloze-editor-panel-close @click="selected = null">Schließen</button>
          </div>
            <div v-if="current" class="space-y-3">
              <label class="block space-y-1">
                <span class="text-sm font-medium">Art der Lücke</span>
                <select class="select min-h-11 w-full text-base" :value="kind" data-cloze-editor-kind @change="setKind(($event.target as HTMLSelectElement).value)">
                  <optgroup label="Eingabe">
                    <option value="text">Freitext</option>
                    <option value="choice">Auswahl</option>
                    <option value="multi">Mehrfachauswahl</option>
                  </optgroup>
                  <optgroup v-if="functionKinds.length" label="Funktion">
                    <option v-for="f in functionKinds" :key="f.kind" :value="`fn:${f.kind}`">{{ f.label }}</option>
                  </optgroup>
                  <optgroup v-if="candidates.length" label="Wert von anderer Stelle der Vorlage">
                    <option v-for="c in candidates" :key="c.id" :value="`from:${c.id}`">{{ c.label }}</option>
                  </optgroup>
                </select>
              </label>

              <p v-if="!current.own" class="text-sm text-base-content/80">Die Lücke zeigt den Wert dieses Elements. Eingestellt wird es dort, wo es in der Vorlage steht.</p>
              <template v-else>
                <label class="block space-y-1">
                  <span class="text-sm font-medium">Name der Lücke</span>
                  <input type="text" class="input min-h-11 w-full text-base" :value="current.node.title ?? ''" placeholder="z. B. Bewusstsein" data-cloze-editor-name @input="patch({ title: ($event.target as HTMLInputElement).value })" />
                  <span class="block text-sm text-base-content/80">Steht beim Ausfüllen über der Abfrage, nicht im Protokolltext.</span>
                </label>
                <label v-if="kind === 'choice' || kind === 'multi'" class="block space-y-1">
                  <span class="text-sm font-medium">Antworten, eine je Zeile</span>
                  <textarea class="textarea min-h-28 w-full text-base leading-normal" :value="optionsDraft ?? optionsText" placeholder="wach&#10;somnolent&#10;soporös" data-cloze-editor-options @input="optionsDraft = ($event.target as HTMLTextAreaElement).value" @change="commitOptions" @blur="optionsDraft = null" />
                  <span v-if="kind === 'choice'" class="block text-sm text-base-content/80">Die erste Antwort ist der Standardwert.</span>
                </label>
                <label v-else-if="kind === 'text' && ownField" class="block space-y-1">
                  <span class="text-sm font-medium">Standardwert (optional)</span>
                  <input type="text" class="input min-h-11 w-full text-base" :value="ownField.default ?? ''" data-cloze-editor-default @input="patch({ default: ($event.target as HTMLInputElement).value || undefined })" />
                </label>
                <label class="flex min-h-11 w-full cursor-pointer items-center gap-3">
                  <input type="checkbox" class="toggle shrink-0" :checked="current.node.required === true" data-cloze-editor-required @change="patch({ required: ($event.target as HTMLInputElement).checked || undefined, ...(($event.target as HTMLInputElement).checked ? { defaultExcluded: undefined } : {}) })" />
                  <span class="text-sm">Pflicht-Lücke</span>
                </label>
              </template>

              <div class="space-y-2">
                <button v-if="current.own" type="button" class="btn btn-sm min-h-11 w-full" data-cloze-editor-settings @click="openSettings">Alle Einstellungen dieser Lücke</button>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-sm min-h-11 min-w-0 flex-1" data-cloze-editor-revert @click="backToText">Zurück in Text</button>
                  <button type="button" class="btn btn-sm min-h-11 min-w-0 flex-1" data-cloze-editor-delete @click="deleteGap">Lücke löschen</button>
                </div>
              </div>
            </div>

        </section>
      </template>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
