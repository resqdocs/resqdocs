<script setup lang="ts">
/**
 * Lückentext einrichten (Vorlage). Zwei Ansichten desselben Textes:
 *  - „Lücken": der Text mit antippbaren Wörtern. Ein Tipp auf ein Wort macht daraus eine Lücke, ein Tipp
 *    auf eine Lücke zeigt ihre Einstellungen (Art, Name, Antworten) darunter.
 *  - „Schreiben": der Text als Ganzes; jede Lücke steht als {Name}. Eine Markierung wird per Knopf zur
 *    Lücke, ein neu getippter {Name} legt eine Freitext-Lücke an.
 * Jede Lücke ist ein normales Feld oder eine Funktion des Abschnitts (oder übernimmt den Wert eines
 * Elements an anderer Stelle der Vorlage); alle weiteren Einstellungen stehen dort wie bei jedem Feld.
 * Fensteraufbau und Tastatur-Verhalten wie beim Ausfüll-Fenster.
 */
import { computed, inject, nextTick, onBeforeUnmount, ref } from 'vue'
import type { Container, Field, FunctionKind } from '@resqdocs/protocol-core/model'
import { clozeOf, clozeGaps } from '@resqdocs/protocol-core/cloze'
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

const cloze = computed(() => clozeOf(props.node))
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

// --- Ansicht „Schreiben" ---
const mode = ref<'gaps' | 'write'>('gaps')
const draft = ref('')
const area = ref<HTMLTextAreaElement | null>(null)
const hasSelection = ref(false)
const notice = ref('')
function readSelection(): void {
  const el = area.value
  hasSelection.value = !!el && el.selectionEnd > el.selectionStart
}
function commitDraft(): void {
  if (mode.value === 'write') commit(applyText(props.node, props.root, draft.value, idFactory()))
}
function setMode(next: 'gaps' | 'write'): void {
  if (next === mode.value) return
  notice.value = ''
  if (next === 'write') draft.value = text.value
  else commitDraft()
  mode.value = next
  if (next === 'write') void nextTick(() => area.value?.focus())
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
  notice.value = ''
  selected.value = made.id
  mode.value = 'gaps'
}

// --- Ansicht „Lücken" ---
const selected = ref<string | null>(null)
const current = computed(() => gaps.value.find((g) => g.id === selected.value) ?? null)

interface Piece {
  key: string
  kind: 'plain' | 'word' | 'gap'
  text: string
  start: number
  end: number
  id?: string
}
// Ein Wort darf Bindestrich, Schrägstrich, Punkt und Komma IN sich tragen (120/80, z.B., 36,5), nicht am Rand.
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}\-/.,]*[\p{L}\p{N}])?/gu
const pieces = computed<Piece[]>(() => {
  const out: Piece[] = []
  for (const t of tokenize(text.value, names.value)) {
    if (t.kind === 'gap') {
      if (t.id) out.push({ key: `g${t.start}`, kind: 'gap', text: t.text, start: t.start, end: t.end, id: t.id })
      continue
    }
    let at = 0
    for (const m of t.text.matchAll(WORD)) {
      if (m.index > at) out.push({ key: `p${t.start + at}`, kind: 'plain', text: t.text.slice(at, m.index), start: t.start + at, end: t.start + m.index })
      at = m.index + m[0].length
      out.push({ key: `w${t.start + m.index}`, kind: 'word', text: m[0], start: t.start + m.index, end: t.start + at })
    }
    if (at < t.text.length) out.push({ key: `p${t.start + at}`, kind: 'plain', text: t.text.slice(at), start: t.start + at, end: t.end })
  }
  return out
})
function wordToGap(p: Piece): void {
  const made = gapFromRange(props.node, props.root, text.value, p.start, p.end, idFactory())
  if (!made) return
  commit(made.section)
  selected.value = made.id
}

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
        ? { ...base, options: undefined, multiple: undefined, defaultEmpty: undefined, exclusiveOptions: undefined, allowCustom: undefined }
        : {
            ...base,
            options: options.length ? options : base.default ? [base.default] : undefined,
            multiple: value === 'multi' ? true : undefined,
            // Mehrfachauswahl in einem Satz startet ohne Vorauswahl; sonst stünde die erste Antwort ungefragt im Text.
            defaultEmpty: value === 'multi' ? true : undefined,
            exclusiveOptions: value === 'multi' ? base.exclusiveOptions : undefined,
          }
    if (value === 'choice') pendingChoice.value = id
    commit(retargetGap(props.node, gap.id, id, next))
  }
  selected.value = id
}
const ownField = computed(() => (current.value?.own && current.value.node.type === 'field' ? current.value.node : null))
const optionsText = computed(() => (ownField.value?.options ?? []).join('\n'))
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
function setAskDefaults(on: boolean): void {
  if (cloze.value) tree.update(props.node.id, { cloze: { ...cloze.value, askDefaults: on || undefined } })
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
  // Leerer Lückentext: gleich schreiben. Sonst die Lücken-Ansicht.
  mode.value = text.value === '' ? 'write' : 'gaps'
  draft.value = text.value
  measure()
  await nextTick()
  dialog.value?.showModal()
  track(true)
  if (mode.value === 'write') requestAnimationFrame(() => area.value?.focus())
}
async function close(): Promise<void> {
  commitDraft()
  track(false)
  closing.value = true
  covered.value = false
  box.value = { top: 0, height: window.innerHeight }
  await nextTick()
  dialog.value?.close()
}
function onClosed(): void {
  commitDraft() // auch beim Schließen über Escape oder den Rand geht nichts Getipptes verloren
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

        <!-- Schreiben: der ganze Text, Lücken als {Name} -->
        <template v-if="mode === 'write'">
          <textarea
            ref="area"
            v-model="draft"
            class="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3 leading-normal text-base-content outline-none placeholder:text-base-content/70"
            :style="{ fontSize }"
            placeholder="Text schreiben. Ein Wort markieren und „Lücke aus Markierung“ antippen – oder {Name} tippen."
            aria-label="Text des Lückentexts"
            data-cloze-editor-text
            @select="readSelection"
            @keyup="readSelection"
            @pointerup="readSelection"
            @input="readSelection"
          />
          <div class="shrink-0 space-y-2 border-t border-base-300 px-4 py-2">
            <p v-if="notice" class="text-sm font-medium" role="status">{{ notice }}</p>
            <!-- pointerdown.prevent: Fokus und Markierung bleiben im Text stehen. -->
            <button type="button" class="btn btn-neutral btn-sm min-h-11 w-full" data-cloze-editor-mark @pointerdown.prevent @click="gapFromSelection">
              {{ hasSelection ? 'Lücke aus Markierung' : 'Lücke hier einfügen' }}
            </button>
          </div>
        </template>

        <!-- Lücken: Wörter antippen, Lücken einstellen -->
        <template v-else>
          <div class="min-h-10 flex-1 overflow-y-auto px-4" :class="covered ? 'py-1.5' : 'py-3'" :style="{ fontSize }" data-cloze-editor-words>
            <p v-if="!pieces.length" class="text-base-content/80">Noch kein Text. Unter „Schreiben“ beginnst du.</p>
            <!-- Eine Zeile, damit zwischen den Stücken kein Leerraum aus der Vorlage des Bauteils entsteht. -->
            <p v-else class="whitespace-pre-wrap leading-loose [overflow-wrap:anywhere]"><template v-for="p in pieces" :key="p.key"><template v-if="p.kind === 'plain'">{{ p.text }}</template><span v-else-if="p.kind === 'word'" role="button" tabindex="0" class="cursor-pointer rounded outline-none hover:bg-base-200 focus-visible:ring-2 focus-visible:ring-neutral" :aria-label="`${p.text}: zur Lücke machen`" data-cloze-word @click="wordToGap(p)" @keydown.enter.prevent="wordToGap(p)">{{ p.text }}</span><span v-else role="button" tabindex="0" class="cursor-pointer rounded px-[3px] py-0.5 outline-none [-webkit-box-decoration-break:clone] [box-decoration-break:clone] focus-visible:ring-2 focus-visible:ring-neutral" :class="p.id === selected ? 'bg-neutral text-neutral-content' : 'bg-base-200 font-medium underline decoration-base-content/70 underline-offset-4'" :aria-label="`Lücke ${p.text} einstellen`" :aria-current="p.id === selected ? 'true' : undefined" :data-cloze-gap="p.id" @click="selected = p.id ?? null" @keydown.enter.prevent="selected = p.id ?? null">{{ p.text }}</span></template></p>
          </div>

          <section class="max-h-[62%] min-h-0 shrink overflow-y-auto border-t border-base-300 px-4 py-3" data-cloze-editor-panel>
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
                  <textarea class="textarea min-h-28 w-full text-base leading-normal" :value="optionsText" placeholder="wach&#10;somnolent&#10;soporös" data-cloze-editor-options @change="setOptions(($event.target as HTMLTextAreaElement).value)" />
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

            <div v-else class="space-y-2">
              <p class="text-sm">Tippe ein Wort an, um daraus eine Lücke zu machen. Tippe eine Lücke an, um sie einzustellen.</p>
              <label class="flex min-h-11 w-full cursor-pointer items-center gap-3">
                <input type="checkbox" class="toggle shrink-0" :checked="cloze?.askDefaults === true" data-cloze-editor-ask @change="setAskDefaults(($event.target as HTMLInputElement).checked)" />
                <span class="text-sm">Beim Ausfüllen auch Lücken abfragen, die schon einen Standardwert haben</span>
              </label>
            </div>
          </section>
        </template>

        <footer class="flex shrink-0 items-center gap-2 border-t border-base-300 px-4 pt-2" :class="covered ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'">
          <div class="join w-full" role="group" aria-label="Ansicht">
            <button type="button" class="btn join-item btn-sm min-h-11 flex-1" :class="mode === 'gaps' ? 'btn-neutral' : ''" :aria-pressed="mode === 'gaps'" data-cloze-editor-mode="gaps" @click="setMode('gaps')">Lücken</button>
            <button type="button" class="btn join-item btn-sm min-h-11 flex-1" :class="mode === 'write' ? 'btn-neutral' : ''" :aria-pressed="mode === 'write'" data-cloze-editor-mode="write" @click="setMode('write')">Schreiben</button>
          </div>
        </footer>
      </template>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
  </dialog>
</template>
