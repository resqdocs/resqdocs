<script setup lang="ts">
/**
 * Durchsuchbare Optionsliste fuer LANGE Auswahlfelder im Einsatz - ab OPTION_SEARCH_MIN Optionen,
 * fuer Einfach- UND Mehrfachauswahl gleich (bewusste Entscheidung). Gleiche Huelle wie das bestehende
 * Multi-Dropdown (details.dropdown), ergaenzt um ein Suchfeld. Die Suche filtert nur die Anzeige; der Wert
 * aendert sich ausschliesslich durch Antippen einer Option.
 *
 * Suchsemantik = gemeinsamer Such-Kern (wie die Medikamentensuche): Teiltreffer, `*`, Anfangstreffer
 * zuerst - die Nummer vom Pieper steht oben. Bei Mehrfachauswahl bleiben gewaehlte Optionen oben sichtbar.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { visibleOptions } from '@resqdocs/protocol-core/textSearch'

const props = defineProps<{
  options: readonly string[]
  label: string
  /** Text im geschlossenen Zustand (aktuelle Auswahl). */
  summary: string
  multiple?: boolean
  /** Mehrfachauswahl: gewaehlte Optionen. */
  selected?: readonly string[]
  /** Einfachauswahl: gewaehlte Option. */
  selectedOption?: string | null
  required?: boolean
}>()
const emit = defineEmits<{ toggle: [opt: string]; pick: [opt: string] }>()

const detailsEl = ref<HTMLDetailsElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLUListElement | null>(null)
const listMaxPx = ref<number | null>(null)
const query = ref('')

// Die Liste SCHWEBT bewusst und darf weder unter der Tab-Leiste (dock) noch unter der Tastatur
// enden - sonst waeren die untersten Treffer nicht antippbar. Hoehe = Platz bis zur Oberkante von Dock bzw.
// sichtbarem Bereich, begrenzt auf 3 Zeilen .. 16rem. Neu gemessen beim Oeffnen und bei jeder Groessen-/
// Scroll-Aenderung (Tastatur faehrt ein/aus, Seite scrollt).
const LIST_MIN_PX = 120
const LIST_MAX_PX = 256
function fitToViewport(): void {
  const list = listEl.value
  if (!detailsEl.value?.open || !list) return
  const vv = window.visualViewport
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const dockTop = document.querySelector<HTMLElement>('.dock')?.getBoundingClientRect().top ?? viewBottom
  const room = Math.min(viewBottom, dockTop) - 8 - list.getBoundingClientRect().top
  listMaxPx.value = Math.round(Math.max(LIST_MIN_PX, Math.min(LIST_MAX_PX, room)))
}
let listening = false
function watchViewport(on: boolean): void {
  if (on === listening) return
  listening = on
  const vv = window.visualViewport
  if (on) {
    vv?.addEventListener('resize', fitToViewport)
    vv?.addEventListener('scroll', fitToViewport)
    window.addEventListener('resize', fitToViewport)
    window.addEventListener('scroll', fitToViewport, true)
  } else {
    vv?.removeEventListener('resize', fitToViewport)
    vv?.removeEventListener('scroll', fitToViewport)
    window.removeEventListener('resize', fitToViewport)
    window.removeEventListener('scroll', fitToViewport, true)
  }
}
onBeforeUnmount(() => watchViewport(false))
const selectedSet = computed(() => (props.multiple ? new Set(props.selected ?? []) : undefined))
const visible = computed(() => visibleOptions(props.options, query.value, selectedSet.value))

// Oeffnen im Klick-Handler statt ueber den nativen details-Toggle: nur so liegt der Fokus im SELBEN
// Nutzer-Tap im Suchfeld - iOS oeffnet die Tastatur sonst nicht. details.open wird direkt am DOM gesetzt,
// damit das Feld beim focus() schon sichtbar ist (eine reaktive Bindung wuerde erst im naechsten Tick greifen).
function onSummaryClick(e: MouseEvent): void {
  const d = detailsEl.value
  if (!d) return
  e.preventDefault()
  if (d.open) {
    close()
    return
  }
  d.open = true
  searchInput.value?.focus()
  fitToViewport()
  requestAnimationFrame(fitToViewport) // nach dem ersten Layout nachmessen
  watchViewport(true)
}
function close(): void {
  if (detailsEl.value) detailsEl.value.open = false
  query.value = ''
  watchViewport(false)
  listMaxPx.value = null
}
function pick(opt: string): void {
  emit('pick', opt)
  close()
}
</script>

<template>
  <details ref="detailsEl" class="dropdown w-full">
    <summary class="select select-sm flex w-full items-center" :aria-label="label" :aria-required="required || undefined" @click="onSummaryClick">
      <span class="truncate">{{ summary }}</span>
    </summary>
    <div class="dropdown-content z-10 mt-1 flex w-full flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-2 shadow">
      <!-- autocorrect/autocapitalize aus: iOS verfaelscht sonst getippte Codes (Grossschreibung, Satzzeichen). -->
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        class="input input-sm w-full"
        placeholder="Nummer oder Text suchen"
        :aria-label="`${label} durchsuchen`"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="search"
        @keydown.esc.prevent="close"
      />
      <ul
        ref="listEl"
        class="menu max-h-64 w-full flex-nowrap overflow-y-auto p-0"
        :style="listMaxPx ? { maxHeight: `${listMaxPx}px` } : undefined"
        :role="multiple ? 'group' : 'listbox'"
        :aria-label="label"
      >
        <li v-for="opt in visible" :key="opt">
          <label v-if="multiple" class="flex cursor-pointer items-center gap-2">
            <input type="checkbox" class="checkbox checkbox-sm shrink-0" :checked="selectedSet?.has(opt)" @change="emit('toggle', opt)" />
            <span>{{ opt }}</span>
          </label>
          <button v-else type="button" role="option" :aria-selected="opt === selectedOption" class="flex items-center gap-2 text-left" @click="pick(opt)">
            <span class="w-4 shrink-0" aria-hidden="true">{{ opt === selectedOption ? '✓' : '' }}</span>
            <span>{{ opt }}</span>
          </button>
        </li>
        <li v-if="!visible.length" class="px-2 py-1 text-sm italic text-base-content/50">Keine Treffer</li>
      </ul>
    </div>
  </details>
</template>
