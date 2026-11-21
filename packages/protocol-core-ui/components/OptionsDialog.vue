<script setup lang="ts">
/**
 * Optionen einer Auswahl bearbeiten - gemeinsam für App und Online-Editor.
 *
 * Man ändert eine Kopie (Arbeitsliste, optionDraft.ts); erst „Übernehmen“/„Fertig“ schreibt sie ins Feld, in
 * EINEM Schritt (ein Rückgängig holt alles zurück). Umbenennen zieht Standard, „allein“ und Verweise anderer
 * Elemente mit; verliert eine Regel eine Option, fragt das Fenster vorher nach.
 *
 * Zwei Darstellungen derselben Arbeitsliste:
 *   - breit (Browser, Tablet): Tabelle mit Option, Standard, Allein. Enter legt die nächste Zeile an, mehrere
 *     eingefügte Zeilen werden zu mehreren Optionen, Rücktaste in einer leeren Zeile entfernt sie.
 *   - schmal (Handy): ganzer Bildschirm. Liste mit Marken „Standard“/„allein“; Antippen oder ＋ öffnet das
 *     Eintrag-Feld. ✕ verwirft (mit Rückfrage), „Fertig“ übernimmt. Mehrere löschen über „Mehr …“.
 * Sortieren in beiden: am Griff ziehen oder mit den Pfeiltasten auf dem Griff.
 * Quellen (Vollbild-Dialog, Listen statt Spalten am Handy, kein verstecktes Wischen): docs/sources.md.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Container, Field } from '@resqdocs/protocol-core/model'
import {
  addEmptyRow,
  addLines,
  draftChanged,
  draftFromField,
  draftProblems,
  effectiveDefaultKey,
  moveRow,
  planOptionEdit,
  removeRows,
  setDefaultEmpty,
  setDefaultRow,
  setExclusive,
  setRowText,
  type AffectedRef,
  type OptionDraft,
  type OptionRow,
} from '@resqdocs/protocol-core/optionDraft'

const props = defineProps<{ field: Field; root: Container }>()
const emit = defineEmits<{ close: []; apply: [draft: OptionDraft] }>()

let counter = 0
const nextKey = (): string => `o${++counter}`
const draft = ref<OptionDraft>(draftFromField(props.field, nextKey))

// Breite: ab 640 px Tabelle, darunter die Liste fürs Handy (gleiche Grenze wie die Tastatur-Regeln).
const WIDE = '(min-width: 640px)'
const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null
const wide = ref(mql ? mql.matches : true)
const onMedia = (e: MediaQueryListEvent): void => {
  wide.value = e.matches
}

const multiple = computed(() => props.field.multiple === true)
const showDefault = computed(() => !(multiple.value && draft.value.defaultEmpty))
const defaultKey = computed(() => effectiveDefaultKey(draft.value))
const problems = computed(() => draftProblems(draft.value))
const filledCount = computed(() => draft.value.rows.filter((r) => r.text.trim()).length)
const fieldLabel = computed(() => props.field.title?.trim() || props.field.id)
const kindLabel = computed(() => (multiple.value ? 'Mehrfachauswahl' : 'Auswahl'))
const countLabel = computed(() => (filledCount.value === 1 ? '1 Option' : `${filledCount.value} Optionen`))

type View = 'list' | 'entry' | 'confirm' | 'discard'
const view = ref<View>('list')
const status = ref('')
const error = ref('')
const affected = ref<AffectedRef[]>([])
const lastRemoved = ref<{ draft: OptionDraft; text: string } | null>(null)

const clean = (t: string): string => t.replace(/\s+/g, ' ').trim()
const panel = ref<HTMLElement | null>(null)
function focusSoon(selector: string, caretEnd = true): void {
  void nextTick(() => {
    const el = panel.value?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(selector)
    if (!el) return
    el.focus()
    if (caretEnd && 'setSelectionRange' in el && typeof el.value === 'string') el.setSelectionRange(el.value.length, el.value.length)
  })
}

/** Jede Änderung an der Arbeitsliste. Ein angebotenes „Rückgängig“ gilt nur für das Entfernen direkt davor;
 *  jede weitere Änderung nimmt es weg (sonst holte es einen alten Stand zurück und verwürfe das Neue). */
function update(next: OptionDraft): void {
  draft.value = next
  error.value = ''
  armedRemove.value = null
  if (lastRemoved.value) {
    lastRemoved.value = null
    status.value = ''
  }
}

// --- Schließen und Übernehmen ---------------------------------------------------------------------------
function requestClose(): void {
  if (view.value === 'entry') return backToList()
  if (draftChanged(props.field, draft.value) || pasteText.value.trim()) view.value = 'discard'
  else emit('close')
}
function apply(): void {
  // Text in „Liste einfügen“, der noch nicht eingefügt ist, zählt mit (sonst ginge er still verloren).
  if (pasteText.value.trim()) applyPaste()
  if (problems.value.duplicates.length) {
    const names = problems.value.duplicates.map((t) => `„${t}“`).join(', ')
    error.value = `${names} steht mehrfach in der Liste. Jede Option darf nur einmal vorkommen.`
    view.value = 'list'
    return
  }
  if (!draftChanged(props.field, draft.value)) return emit('close')
  const plan = planOptionEdit(props.root, props.field.id, draft.value)
  if (plan.collisions.length) {
    const names = plan.collisions.map((t) => `„${t}“`).join(', ')
    error.value = `${names}: Diese Option entfernst du und gibst zugleich einer anderen ihren Namen. Dann wäre unklar, welche Regeln gemeint sind. Übernimm erst das Entfernen und benenne danach um.`
    view.value = 'list'
    return
  }
  if (plan.affected.length) {
    affected.value = plan.affected
    view.value = 'confirm'
    return
  }
  emit('apply', draft.value)
}
function confirmApply(): void {
  emit('apply', draft.value)
}

// --- Tabelle (breit) ------------------------------------------------------------------------------------
function onCellKeydown(e: KeyboardEvent, row: OptionRow, index: number): void {
  if (e.isComposing) return
  if (e.key === 'Enter') {
    // auch Umschalt+Enter: eine Option hat keinen Zeilenumbruch
    e.preventDefault()
    const key = nextKey()
    update(addEmptyRow(draft.value, key, row.key))
    focusSoon(`[data-option-input="${key}"]`)
  } else if (e.key === 'Backspace' && !e.repeat && row.text === '' && row.from === undefined && draft.value.rows.length > 1) {
    // Nur eine hier neu angelegte, leere Zeile verschwindet mit der Rücktaste, und nie bei gedrückt gehaltener
    // Taste: sonst fräße sich ein langer Druck durch die Nachbarzeilen. Bestehende Optionen entfernt das ✕.
    e.preventDefault()
    const prev = draft.value.rows[index - 1] ?? draft.value.rows[index + 1]
    update(removeRows(draft.value, [row.key]))
    if (prev) focusSoon(`[data-option-input="${prev.key}"]`)
  }
}
function onCellPaste(e: ClipboardEvent, row: OptionRow): void {
  const text = e.clipboardData?.getData('text/plain') ?? ''
  e.preventDefault()
  if (!/\r?\n/.test(text.trim())) {
    // eine Zeile (auch mit Umbruch am Ende, z. B. aus einer Tabelle): ohne Umbruch an der Schreibmarke einfügen
    const el = e.target as HTMLTextAreaElement
    const start = el.selectionStart ?? row.text.length
    const end = el.selectionEnd ?? row.text.length
    const piece = text.replace(/\s+/g, ' ').trim()
    update(setRowText(draft.value, row.key, row.text.slice(0, start) + piece + row.text.slice(end)))
    void nextTick(() => {
      const cell = panel.value?.querySelector<HTMLTextAreaElement>(`[data-option-input="${row.key}"]`)
      cell?.setSelectionRange(start + piece.length, start + piece.length)
    })
    return
  }
  let d = draft.value
  let rest = text
  let filled = 0
  if (!row.text.trim()) {
    // leere Zeile: die erste eingefügte Zeile kommt hinein, die übrigen dahinter
    const lines = text.split(/\r?\n/)
    const first = lines.findIndex((l) => l.trim())
    const line = first >= 0 ? clean(lines[first]) : ''
    if (line && !d.rows.some((r) => r.key !== row.key && clean(r.text) === line)) {
      d = setRowText(d, row.key, line)
      rest = lines.slice(first + 1).join('\n')
      filled = 1
    }
  }
  const r = addLines(d, rest, nextKey, row.key)
  update(r.draft)
  status.value = pasteStatus(r.added.length + filled, r.duplicates)
}
// Tabelle: ✕ löscht wie die Liste erst nach Rückfrage. Der erste Tipp macht daraus „Löschen?“, der zweite löscht.
// Nur leer angelegte Zeilen gehen sofort (nichts zu verlieren); eine bestehende Option, deren Text geleert wurde, fragt.
const armedRemove = ref<string | null>(null)
function requestRemoveRow(row: OptionRow): void {
  if ((row.from == null && !row.text.trim()) || armedRemove.value === row.key) {
    armedRemove.value = null
    removeRow(row)
    return
  }
  armedRemove.value = row.key
}
function removeRow(row: OptionRow): void {
  const before = draft.value
  update(removeRows(draft.value, [row.key]))
  lastRemoved.value = row.text.trim() ? { draft: before, text: row.text.trim() } : null
  status.value = lastRemoved.value ? `„${lastRemoved.value.text}“ entfernt.` : ''
}
function undoRemove(): void {
  const back = lastRemoved.value
  if (!back) return
  update(back.draft)
  lastRemoved.value = null
  status.value = ''
}
function addRowAtEnd(): void {
  const key = nextKey()
  update(addEmptyRow(draft.value, key))
  focusSoon(`[data-option-input="${key}"]`)
}

// --- Liste einfügen / als Text kopieren (beide Darstellungen) ------------------------------------------
const pasteOpen = ref(false)
const pasteText = ref('')
function pasteStatus(added: number, duplicates: number): string {
  if (!added) return duplicates ? `Nichts Neues – ${duplicates} schon vorhanden.` : 'Keine Zeilen erkannt.'
  return `${added} übernommen${duplicates ? `, ${duplicates} doppelt übersprungen` : ''}.`
}
function togglePaste(): void {
  pasteOpen.value = !pasteOpen.value
  if (pasteOpen.value) focusSoon('[data-options-paste] textarea') // rückt das Feld ins Bild, auch unter einer langen Liste
}
function applyPaste(): void {
  // eine angefangene leere Zeile am Ende nicht zwischen die eingefügten stellen
  const base = draft.value.rows.length && !draft.value.rows[draft.value.rows.length - 1].text.trim() ? removeRows(draft.value, [draft.value.rows[draft.value.rows.length - 1].key]) : draft.value
  const r = addLines(base, pasteText.value, nextKey)
  if (r.added.length) update(r.draft)
  status.value = pasteStatus(r.added.length, r.duplicates)
  if (r.added.length) {
    pasteText.value = ''
    pasteOpen.value = false
  }
}
async function copyAsText(): Promise<void> {
  moreOpen.value = false
  const text = draft.value.rows.map((r) => r.text.trim()).filter(Boolean).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    status.value = 'Als Text kopiert, eine Option pro Zeile.'
  } catch {
    status.value = 'Kopieren ging nicht. Markiere die Liste unter „Liste einfügen“ von Hand.'
    pasteText.value = text
    pasteOpen.value = true
  }
}

// --- Sortieren: am Griff ziehen (Maus und Finger) oder Pfeiltasten auf dem Griff -----------------------
const dragKey = ref<string | null>(null)
// Verfolgt wird über das Fenster (window), nicht über den Griff: beim Hochziehen verschiebt Vue die Zeile im DOM,
// der Browser gibt dabei die Zeiger-Bindung des Griffs frei - das Ziehen darf daran nicht enden.
function startDrag(e: PointerEvent, key: string): void {
  if (e.button !== 0) return // Rechtsklick o. ä. startet kein Ziehen
  dragKey.value = key
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}
function onDrag(e: PointerEvent): void {
  const key = dragKey.value
  if (!key || !panel.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) return endDrag() // Taste woanders losgelassen
  const rows = [...panel.value.querySelectorAll<HTMLElement>('[data-option-row]')].filter((el) => el.dataset.optionRow !== key)
  let to = rows.length
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect()
    if (e.clientY < r.top + r.height / 2) {
      to = i
      break
    }
  }
  update(moveRow(draft.value, key, to))
}
function endDrag(): void {
  dragKey.value = null
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}
function moveBy(key: string, delta: number): void {
  const i = draft.value.rows.findIndex((r) => r.key === key)
  if (i < 0) return
  update(moveRow(draft.value, key, i + delta))
  focusSoon(`[data-option-handle="${key}"]`, false)
}

// --- Handy: Eintrag-Feld, Auswahlmodus, Menü -------------------------------------------------------------
const entry = ref<{ key: string | null; text: string; isDefault: boolean; exclusive: boolean; exclusiveBefore: boolean; confirmDelete: boolean }>({ key: null, text: '', isDefault: false, exclusive: false, exclusiveBefore: false, confirmDelete: false })
const entryError = ref('')
const entryIsEffectiveDefault = computed(() => entry.value.key !== null && entry.value.key === defaultKey.value)
function openEntry(row: OptionRow | null): void {
  entry.value = row
    ? { key: row.key, text: row.text, isDefault: row.key === defaultKey.value, exclusive: draft.value.exclusive.includes(row.key), exclusiveBefore: draft.value.exclusive.includes(row.key), confirmDelete: false }
    : { key: null, text: '', isDefault: false, exclusive: false, exclusiveBefore: false, confirmDelete: false }
  entryError.value = ''
  status.value = ''
  view.value = 'entry'
  // Nur eine neue Option gleich zum Tippen öffnen. Bei einer vorhandenen öffnete der Fokus am Handy die Tastatur,
  // obwohl man oft nur „Standard“ umschaltet oder löscht; zum Umbenennen tippt man ins Feld.
  // Der Fokus bleibt im Fenster (Screenreader), auf einem Knopf öffnet er keine Tastatur.
  focusSoon(row ? '[data-options-entry-cancel]' : '[data-option-entry-text]')
}
function backToList(): void {
  view.value = 'list'
}
function saveEntry(again = false): void {
  const text = entry.value.text.replace(/\s+/g, ' ').trim()
  if (!text) {
    entryError.value = 'Bitte einen Text für die Option eingeben.'
    return
  }
  if (draft.value.rows.some((r) => r.key !== entry.value.key && r.text.trim() === text)) {
    entryError.value = `„${text}“ gibt es schon.`
    return
  }
  let d = draft.value
  let key = entry.value.key
  if (key === null) {
    key = nextKey()
    d = addEmptyRow(d, key)
  }
  // Text nur schreiben, wenn er sich geändert hat: eine alte Option („a  b“) bliebe sonst nicht exakt erhalten.
  const row = d.rows.find((r) => r.key === key)
  if (!row || clean(row.text) !== text) d = setRowText(d, key, text)
  if (entry.value.isDefault && showDefault.value) d = setDefaultRow(d, key) // „Standard weicht“ wandert dabei mit
  // „allein“ nur schreiben, wenn es im Eintrag umgeschaltet wurde - sonst nähme es die mitgewanderte Einstellung weg.
  if (multiple.value && entry.value.exclusive !== entry.value.exclusiveBefore) d = setExclusive(d, key, entry.value.exclusive)
  update(d)
  if (again) openEntry(null)
  else backToList()
}
function onEntryEnter(e: KeyboardEvent): void {
  // Android-Tastaturen bilden jedes Wort erst fertig (isComposing); v-model kennt den Text dann noch nicht.
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  entry.value = { ...entry.value, text: (e.target as HTMLTextAreaElement).value }
  saveEntry()
}
function deleteEntry(): void {
  if (entry.value.key === null) return backToList()
  if (!entry.value.confirmDelete) {
    entry.value = { ...entry.value, confirmDelete: true }
    return
  }
  update(removeRows(draft.value, [entry.value.key]))
  backToList()
}

const selecting = ref(false)
const selected = ref<string[]>([])
const moreOpen = ref(false)
function stopSelecting(): void {
  selecting.value = false
  selected.value = []
}
function startSelecting(): void {
  moreOpen.value = false
  selecting.value = true
  selected.value = []
}
function toggleSelected(key: string, on: boolean): void {
  selected.value = on ? [...new Set([...selected.value, key])] : selected.value.filter((k) => k !== key)
}
function deleteSelected(): void {
  const n = selected.value.length
  if (!n) return
  const before = draft.value
  const text = n === 1 ? draft.value.rows.find((r) => r.key === selected.value[0])?.text ?? '' : `${n} Optionen`
  update(removeRows(draft.value, selected.value))
  lastRemoved.value = { draft: before, text }
  status.value = n === 1 ? `„${lastRemoved.value.text}“ entfernt.` : `${n} Optionen entfernt.`
  selecting.value = false
  selected.value = []
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
function focusables(): HTMLElement[] {
  return [...(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement)
}
/** Tab bleibt im Fenster. Verließe der Fokus es, wählte z. B. im Online-Editor ein Feld der Arbeitsfläche ein
 *  anderes Element und das Fenster ginge samt Änderungen zu. */
function trapTab(e: KeyboardEvent): void {
  const list = focusables()
  if (!list.length) return
  const first = list[0]
  const last = list[list.length - 1]
  const inside = !!panel.value?.contains(document.activeElement)
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault()
    first.focus()
  }
}
function onFocusIn(e: FocusEvent): void {
  const t = e.target as Node | null
  if (panel.value && t && !panel.value.contains(t)) focusables()[0]?.focus()
}
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Tab') return trapTab(e)
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (moreOpen.value) moreOpen.value = false
  else if (view.value === 'confirm' || view.value === 'discard') view.value = 'list'
  else requestClose()
}

onMounted(() => {
  mql?.addEventListener?.('change', onMedia)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('focusin', onFocusIn)
  // Neue Liste: in der Tabelle gleich eine Zeile zum Tippen anbieten.
  if (wide.value && !draft.value.rows.length) addRowAtEnd()
  else if (wide.value) focusSoon(`[data-option-input="${draft.value.rows[0].key}"]`)
})
onBeforeUnmount(() => {
  mql?.removeEventListener?.('change', onMedia)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('focusin', onFocusIn)
  endDrag()
})
watch(wide, (w) => {
  if (w && view.value === 'entry') view.value = 'list'
  stopSelecting()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open" role="dialog" aria-modal="true" :aria-label="`Optionen bearbeiten: ${fieldLabel}`" data-options-dialog :data-options-mode="wide ? 'tabelle' : 'liste'">
      <div
        ref="panel"
        class="modal-box flex flex-col overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none sm:h-[min(85vh,52rem)] sm:w-11/12 sm:max-w-3xl"
      >
        <!-- ===== Rückfragen (beide Darstellungen) ===== -->
        <template v-if="view === 'confirm'">
          <header class="shrink-0 border-b border-base-300 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3">
            <h3 class="text-base font-semibold">Regeln verlieren Optionen</h3>
          </header>
          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" data-options-confirm>
            <p class="text-sm">Diese Elemente richten sich nach Optionen, die du entfernst:</p>
            <ul class="space-y-1 text-sm">
              <li v-for="a in affected" :key="a.id" class="rounded-lg bg-base-200 px-3 py-2">
                <span class="font-medium">{{ a.label }}</span>
                <span class="text-base-content/75"> · verliert {{ a.options.map((o) => `„${o}“`).join(', ') }}</span>
              </li>
            </ul>
            <p class="text-xs text-base-content/75">Nennt eine Bedingung nur entfernte Optionen, bleibt sie stehen und trifft nie mehr zu. Prüfe die Elemente danach unter „Abhängigkeit“.</p>
          </div>
          <div class="modal-action mt-0 shrink-0 border-t border-base-300 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
            <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="view = 'list'">Zurück</button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" data-options-confirm-apply @click="confirmApply">Trotzdem übernehmen</button>
          </div>
        </template>

        <template v-else-if="view === 'discard'">
          <header class="shrink-0 border-b border-base-300 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3">
            <h3 class="text-base font-semibold">Änderungen verwerfen?</h3>
          </header>
          <div class="min-h-0 flex-1 px-4 py-3">
            <p class="text-sm">Deine Änderungen an den Optionen von „{{ fieldLabel }}“ gehen verloren.</p>
          </div>
          <div class="modal-action mt-0 shrink-0 border-t border-base-300 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
            <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="view = 'list'">Weiter bearbeiten</button>
            <button type="button" class="btn btn-error btn-outline btn-sm min-h-11" data-options-discard @click="emit('close')">Verwerfen</button>
          </div>
        </template>

        <!-- ===== Handy: Eintrag-Feld ===== -->
        <template v-else-if="view === 'entry'">
          <header class="grid shrink-0 grid-cols-[6rem_minmax(0,1fr)_6rem] items-center border-b border-base-300 px-1 pb-1 pt-[calc(0.25rem+env(safe-area-inset-top))]">
            <button type="button" class="btn btn-ghost btn-sm min-h-11 justify-start" data-options-entry-cancel @click="backToList">Abbrechen</button>
            <h3 class="text-center text-base font-semibold">{{ entry.key === null ? 'Neue Option' : 'Option' }}</h3>
            <button type="button" class="btn btn-primary btn-sm min-h-11 justify-self-end" data-options-entry-save @click="saveEntry()">Speichern</button>
          </header>
          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto bg-base-200 px-4 py-4">
            <label class="block space-y-1">
              <span class="text-sm text-base-content/75">Text der Option</span>
              <textarea v-model="entry.text" rows="3" class="textarea textarea-bordered w-full resize-none text-base" data-option-entry-text aria-label="Text der Option" @keydown.enter="onEntryEnter" />
              <span v-if="entry.key !== null" class="block text-xs text-base-content/75">Umbenennen behält Standard, „allein“ und Bedingungen in anderen Elementen.</span>
            </label>
            <p v-if="entryError" class="text-sm text-error" role="alert">{{ entryError }}</p>
            <div class="rounded-box border border-base-300 bg-base-100 px-4">
              <label v-if="showDefault" class="flex min-h-14 cursor-pointer items-center gap-3 border-b border-base-200 py-2 last:border-b-0">
                <span class="min-w-0 flex-1">
                  <span class="block">Standard</span>
                  <span class="block text-xs text-base-content/75">{{ entryIsEffectiveDefault ? (multiple ? 'Ist vorausgewählt. Wähle eine andere Option als Standard oder „Ohne Vorauswahl“.' : 'Ist vorausgewählt. Wähle eine andere Option als Standard, um das zu ändern.') : 'Beim Ausfüllen vorausgewählt' }}</span>
                </span>
                <input v-model="entry.isDefault" type="checkbox" class="toggle shrink-0" :disabled="entryIsEffectiveDefault" data-option-entry-default />
              </label>
              <label v-if="multiple" class="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="block">Schließt andere aus</span>
                  <span class="block text-xs text-base-content/75">Wählt man sie, fallen die anderen weg</span>
                </span>
                <input v-model="entry.exclusive" type="checkbox" class="toggle shrink-0" data-option-entry-exclusive />
              </label>
            </div>
            <button v-if="entry.key === null" type="button" class="btn btn-outline btn-block min-h-12" data-options-entry-again @click="saveEntry(true)">Speichern und weitere</button>
            <button v-else type="button" class="btn btn-outline btn-error btn-block min-h-12" data-options-entry-delete @click="deleteEntry">{{ entry.confirmDelete ? 'Wirklich löschen?' : 'Option löschen' }}</button>
          </div>
        </template>

        <!-- ===== Liste bzw. Tabelle ===== -->
        <template v-else>
          <!-- Kopf: am Handy ✕ und „Fertig“ oben (die Tastatur verdeckt den unteren Rand), breit nur der Titel -->
          <header v-if="!wide" class="grid shrink-0 grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center border-b border-base-300 px-1 pb-1 pt-[calc(0.25rem+env(safe-area-inset-top))]">
            <button v-if="!selecting" type="button" class="btn btn-ghost btn-sm min-h-11 text-lg" aria-label="Schließen ohne Übernehmen" data-options-cancel @click="requestClose">✕</button>
            <button v-else type="button" class="btn btn-ghost btn-sm min-h-11" @click="stopSelecting">Abbr.</button>
            <div class="min-w-0 text-center leading-tight">
              <h3 class="truncate text-base font-semibold">{{ selecting ? `${selected.length} ausgewählt` : 'Optionen' }}</h3>
              <p v-if="!selecting" class="truncate text-xs text-base-content/75">{{ fieldLabel }} · {{ kindLabel }}</p>
            </div>
            <button v-if="!selecting" type="button" class="btn btn-primary btn-sm min-h-11 justify-self-end" data-options-apply @click="apply">Fertig</button>
            <span v-else></span>
          </header>
          <header v-else class="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-base-300 px-5 py-3">
            <div class="min-w-0">
              <h3 class="text-base font-semibold">Optionen bearbeiten · {{ fieldLabel }}</h3>
              <p class="text-xs text-base-content/75">{{ kindLabel }} · {{ countLabel }}</p>
            </div>
            <label v-if="multiple" class="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" class="checkbox checkbox-sm" :checked="draft.defaultEmpty" data-options-default-empty @change="update(setDefaultEmpty(draft, ($event.target as HTMLInputElement).checked))" />
              Ohne Vorauswahl
            </label>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto">

            <!-- breit: Tabelle -->
            <table v-if="wide" class="table table-sm">
              <thead>
                <tr>
                  <th class="w-10"><span class="sr-only">Reihenfolge</span></th>
                  <th>Option</th>
                  <th v-if="showDefault" class="w-20 text-center">Standard</th>
                  <th v-if="multiple" class="w-24 whitespace-normal text-center leading-tight">Schließt andere aus</th>
                  <th class="w-12"><span class="sr-only">Löschen</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in draft.rows" :key="row.key" :data-option-row="row.key" :class="{ 'bg-base-200': dragKey === row.key }">
                  <td class="px-1">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm min-h-9 cursor-grab touch-none px-2 text-base-content/75"
                      :aria-label="`„${row.text || 'leere Zeile'}“ verschieben (Pfeiltasten)`"
                      :data-option-handle="row.key"
                      @pointerdown.prevent="startDrag($event, row.key)"
                      @keydown.up.prevent="moveBy(row.key, -1)"
                      @keydown.down.prevent="moveBy(row.key, 1)"
                    >
                      <span aria-hidden="true">⠿</span>
                    </button>
                  </td>
                  <td>
                    <textarea
                      :value="row.text"
                      rows="1"
                      class="textarea textarea-sm min-h-9 w-full resize-none leading-snug [field-sizing:content]"
                      :class="{ 'textarea-error': problems.duplicateKeys.includes(row.key) }"
                      placeholder="Option"
                      :aria-label="`Option ${i + 1}`"
                      :data-option-input="row.key"
                      @input="update(setRowText(draft, row.key, ($event.target as HTMLTextAreaElement).value))"
                      @keydown="onCellKeydown($event, row, i)"
                      @paste="onCellPaste($event, row)"
                    />
                  </td>
                  <td v-if="showDefault" class="text-center">
                    <input
                      type="radio"
                      class="radio radio-sm"
                      :name="`options-default-${field.id}`"
                      :checked="defaultKey === row.key"
                      :disabled="!row.text.trim()"
                      :aria-label="`„${row.text}“ als Standard`"
                      :data-option-default="row.key"
                      @change="update(setDefaultRow(draft, row.key))"
                    />
                  </td>
                  <td v-if="multiple" class="text-center">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      :checked="draft.exclusive.includes(row.key)"
                      :disabled="!row.text.trim()"
                      :aria-label="`„${row.text}“ schließt andere aus`"
                      :data-option-exclusive="row.key"
                      @change="update(setExclusive(draft, row.key, ($event.target as HTMLInputElement).checked))"
                    />
                  </td>
                  <td class="px-1 text-right">
                    <button
                      type="button"
                      class="btn btn-sm min-h-9 px-2"
                      :class="armedRemove === row.key ? 'btn-outline btn-error' : 'btn-ghost text-base-content/75'"
                      :aria-label="armedRemove === row.key ? `„${row.text}“ wirklich löschen?` : `„${row.text || 'leere Zeile'}“ entfernen`"
                      :data-option-remove="row.key"
                      :data-option-remove-armed="armedRemove === row.key || undefined"
                      @click="requestRemoveRow(row)"
                      @blur="armedRemove === row.key && (armedRemove = null)"
                    >{{ armedRemove === row.key ? 'Löschen?' : '✕' }}</button>
                  </td>
                </tr>
                <tr>
                  <td></td>
                  <td :colspan="1 + (showDefault ? 1 : 0) + (multiple ? 1 : 0) + 1">
                    <button type="button" class="btn btn-ghost btn-sm min-h-9 px-2" data-options-add @click="addRowAtEnd">＋ Option</button>
                    <span class="ml-2 text-xs text-base-content/75">Enter legt die nächste Zeile an. Mehrere Zeilen einfügen: jede wird eine Option.</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- schmal: Liste -->
            <template v-else>
              <p v-if="!draft.rows.length" class="px-4 py-8 text-center text-sm text-base-content/75">Noch keine Optionen. Mit ＋ legst du die erste an.</p>
              <ul v-else>
                <li v-for="row in draft.rows" :key="row.key" :data-option-row="row.key" class="flex min-h-14 items-center gap-2 border-b border-base-200 pl-4 pr-1" :class="{ 'bg-base-200': dragKey === row.key || selected.includes(row.key) }">
                  <input v-if="selecting" type="checkbox" class="checkbox shrink-0" :checked="selected.includes(row.key)" :aria-label="`„${row.text}“ auswählen`" :data-option-select="row.key" @change="toggleSelected(row.key, ($event.target as HTMLInputElement).checked)" />
                  <button type="button" class="min-h-12 min-w-0 flex-1 py-2 text-left" :data-option-open="row.key" @click="selecting ? toggleSelected(row.key, !selected.includes(row.key)) : openEntry(row)">
                    <span class="block [overflow-wrap:anywhere]" :class="{ 'text-error': problems.duplicateKeys.includes(row.key), 'text-base-content/75 italic': !row.text.trim() }">{{ row.text.trim() || 'leer' }}</span>
                    <span v-if="(showDefault && defaultKey === row.key) || (multiple && draft.exclusive.includes(row.key))" class="mt-1 flex flex-wrap gap-1">
                      <span v-if="showDefault && defaultKey === row.key" class="badge badge-outline badge-sm">Standard</span>
                      <span v-if="multiple && draft.exclusive.includes(row.key)" class="badge badge-ghost badge-sm">allein</span>
                    </span>
                  </button>
                  <button
                    v-if="!selecting"
                    type="button"
                    class="btn btn-ghost min-h-11 w-11 shrink-0 cursor-grab touch-none px-0 text-lg text-base-content/75"
                    :aria-label="`„${row.text}“ verschieben (Pfeiltasten)`"
                    :data-option-handle="row.key"
                    @pointerdown.prevent="startDrag($event, row.key)"
                    @keydown.up.prevent="moveBy(row.key, -1)"
                    @keydown.down.prevent="moveBy(row.key, 1)"
                  >
                    <span aria-hidden="true">≡</span>
                  </button>
                </li>
              </ul>
            </template>

            <p v-if="draft.ignored" class="px-4 pt-2 text-xs text-base-content/75" data-options-ignored>{{ draft.ignored === 1 ? '1 Eintrag dieser Liste ist' : `${draft.ignored} Einträge dieser Liste sind` }} keine Option (z. B. aus einer fremden Datei) und war nie wählbar. Er fällt weg, sobald du hier etwas änderst und übernimmst.</p>
            <p v-if="problems.empty && wide" class="px-4 pt-2 text-xs text-base-content/75">{{ problems.empty === 1 ? '1 leere Zeile fällt' : `${problems.empty} leere Zeilen fallen` }} beim Übernehmen weg.</p>

            <!-- Liste einfügen -->
            <div v-if="pasteOpen" class="space-y-2 px-4 py-3" data-options-paste>
              <textarea
                v-model="pasteText"
                rows="6"
                class="textarea textarea-bordered textarea-sm w-full font-mono"
                :placeholder="'Eine Option pro Zeile, z. B.\n010: Bewusstlosigkeit\n011: ICB / SAB'"
                aria-label="Optionen einfügen, eine pro Zeile"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <p class="text-xs text-base-content/75">Kommt hinten an die Liste. Doppelte werden übersprungen.</p>
              <div class="flex gap-2">
                <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!pasteText.trim()" data-options-paste-apply @click="applyPaste">Einfügen</button>
                <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="pasteOpen = false; pasteText = ''">Abbrechen</button>
              </div>
            </div>
          </div>

          <!-- Rückmeldungen fest über dem Fuß: bei langen Listen sonst außer Sicht -->
          <div v-if="error || status" class="shrink-0 space-y-1 border-t border-base-300 px-4 py-2">
            <p v-if="error" class="rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert" data-options-error>{{ error }}</p>
            <p v-if="status" class="text-xs text-base-content/75" role="status" data-options-status>
              {{ status }}
              <button v-if="lastRemoved" type="button" class="link link-primary ml-1" data-options-undo @click="undoRemove">Rückgängig</button>
            </p>
          </div>
          <!-- Fuß -->
          <footer v-if="wide" class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-base-300 px-5 py-3">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-outline btn-sm min-h-10" :aria-expanded="pasteOpen" data-options-paste-open @click="togglePaste">Liste einfügen</button>
              <button type="button" class="btn btn-outline btn-sm min-h-10" :disabled="!filledCount" data-options-copy @click="copyAsText">Als Text kopieren</button>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost btn-sm min-h-10" data-options-cancel @click="requestClose">Abbrechen</button>
              <button type="button" class="btn btn-primary btn-sm min-h-10" data-options-apply @click="apply">Übernehmen</button>
            </div>
          </footer>
          <footer v-else class="flex shrink-0 items-center gap-1 border-t border-base-300 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <template v-if="selecting">
              <span class="flex-1 px-2 text-sm text-base-content/75">Antippen zum Auswählen</span>
              <button type="button" class="btn btn-outline btn-error btn-sm min-h-11" :disabled="!selected.length" data-options-delete-selected @click="deleteSelected">Löschen</button>
            </template>
            <template v-else>
              <button type="button" class="btn btn-ghost btn-sm min-h-11" :aria-expanded="pasteOpen" data-options-paste-open @click="togglePaste">Liste einfügen</button>
              <div class="relative">
                <button type="button" class="btn btn-ghost btn-sm min-h-11" :aria-expanded="moreOpen" data-options-more @click="moreOpen = !moreOpen">Mehr …</button>
                <ul v-if="moreOpen" class="menu absolute bottom-full left-0 z-10 mb-1 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                  <li><button type="button" class="min-h-11" :disabled="!filledCount" data-options-copy @click="copyAsText">Als Text kopieren</button></li>
                  <li><button type="button" class="min-h-11" :disabled="!draft.rows.length" data-options-select-mode @click="startSelecting">Mehrere löschen</button></li>
                  <li v-if="multiple">
                    <label class="flex min-h-11 cursor-pointer items-center gap-2">
                      <input type="checkbox" class="checkbox checkbox-sm" :checked="draft.defaultEmpty" data-options-default-empty @change="update(setDefaultEmpty(draft, ($event.target as HTMLInputElement).checked))" />
                      Ohne Vorauswahl
                    </label>
                  </li>
                </ul>
              </div>
              <span class="flex-1"></span>
              <button type="button" class="btn btn-primary btn-circle h-13 w-13 min-h-13 text-2xl" aria-label="Option hinzufügen" data-options-new @click="openEntry(null)">＋</button>
            </template>
          </footer>
        </template>
      </div>
      <div v-if="wide" class="modal-backdrop" aria-hidden="true" @click="requestClose"></div>
    </div>
  </Teleport>
</template>
