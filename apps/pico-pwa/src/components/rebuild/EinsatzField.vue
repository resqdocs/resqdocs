<script setup lang="ts">
/**
 * Ein Feld im Einsatz.
 * - FREITEXT-Feld: Tri-State wie gehabt (TriStateToggle ✓ bestaetigt / ✎ abweichend / − nicht erhoben);
 *   das Eingabefeld erscheint erst bei ✎ (Progressive Disclosure - korrekt, da kein Scan-Bedarf).
 * - SELECT (options gesetzt): Optionen IMMER sichtbar (quellenbasiert select-field-ux-critique:
 *   versteckte Optionen widersprechen der Select-Erwartung; NN/g Recognition-over-Recall + Baymard).
 *   Radios bei ≤6, Dropdown bei >6. Der Erhebungsstatus steckt in der Auswahl SELBST: Standard-Option
 *   = confirmed (default nie materialisiert), andere Option/„individuell" = custom, „nicht erhoben" =
 *   excluded. Ein Tap fuer alles, kein vorgeschalteter Modus-Tap.
 * Modell/Renderer unveraendert - der Renderer rendert nur den String.
 */
import { ref, computed, onMounted } from 'vue'
import type { Field } from '@resqdocs/protocol-core/model'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'
import { multiSelected, toggleMultiOption, multiFill, joinFieldValues } from '@resqdocs/protocol-core/fill'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import TriStateToggle from '@/components/TriStateToggle.vue'
import RequiredMark from '@/components/RequiredMark.vue'
import LongTextField from '@resqdocs/protocol-core-ui/components/LongTextField.vue'
import SnippetPicker from './SnippetPicker.vue'

const props = defineProps<{ node: Field }>()
const caseValues = useCaseValues()
const snippetPickerOpen = ref(false)

const fill = computed(() => caseValues.get(props.node.id))
// Funktions-Wert gehoert nie an ein Feld; typseitig auf den Tri-State abbilden (defensiv -> confirmed).
const triState = computed<'confirmed' | 'custom' | 'excluded'>(() => (fill.value.state === 'function' ? 'confirmed' : fill.value.state))
// echte Optionen: leere raus + dedupliziert (eindeutige Radios/Keys, kein Doppel-checked)
const options = computed(() => [...new Set((props.node.options ?? []).filter((o) => o !== ''))])
const isSelect = computed(() => options.value.length > 0)
const useDropdown = computed(() => options.value.length > 6) // adaptiv: Radios wenige, Dropdown viele
const def = computed(() => {
  const opts = options.value
  const d = props.node.default
  if (opts.length) return d != null && opts.includes(d) ? d : opts[0]
  return d ?? ''
})
const label = computed(() => (props.node.title && props.node.title.trim()) || props.node.id)
// Pflichtfeld „noch offen": liefert keinen Wert (leer). Reiner visueller Hinweis, kein Gate.
const isOpen = computed(() => isRequiredOpen(props.node, fill.value))
const customValue = computed(() => (fill.value.state === 'custom' ? fill.value.value : def.value))
const excluded = computed(() => fill.value.state === 'excluded')
// BEWAHREN: ruhend gemerkter Freitext (prevValue) - erscheint, wenn das Feld auf ✓/− steht, aber zuvor
// via ✎ Text getippt wurde. Wird NIE ausgegeben (Renderer ignoriert prevValue); nur Recovery + Hinweis.
const preservedText = computed(() => {
  const f = fill.value
  if (f.state !== 'confirmed' && f.state !== 'excluded') return ''
  const prev = f.prevValue ?? ''
  if (prev === '') return ''
  // Select: nur ECHTEN individuell-Freitext zum Zurueckholen anbieten (allowCustom + nicht in den Optionen).
  // Eine gemerkte Options-Auswahl ist kein „getippter Text"; ohne ✎-Modus (allowCustom=false) gibt es
  // ohnehin nichts, wohin man ihn zurueckholen koennte (sonst re-materialisierte man einen unsichtbaren Wert).
  if (isSelect.value) return props.node.allowCustom && !options.value.includes(prev) ? prev : ''
  return prev
})
// Vorbelegung beim (Zurueck-)Wechsel auf ✎: laufender custom-Wert, sonst der gemerkte Text, sonst Default.
const restoreValue = computed(() => (fill.value.state === 'custom' ? fill.value.value : preservedText.value || def.value))
// Mehrzeilig darstellen/editieren, wenn das Feld als multiline definiert IST oder der aktuelle Wert
// Zeilenumbrueche enthaelt (z. B. ein via Snippet gesetzter mehrzeiliger custom-Wert). Sonst verschluckt ein
// einzeiliges <input> die \n und der erste Edit verwirft sie still (Verify).
const useLongText = computed(() => !!props.node.multiline || customValue.value.includes('\n'))

// „individuell"/Freitext: sticky ref (vom Nutzer gesetzt -> kein Modus-Flip beim Tippen eines
// Options-Texts) PLUS Ableitung „Wert nicht in options". Der computed gatet auf state==='custom',
// daher KEIN veralteter Zustand nach reset()/excluded (loest Review-Befunde 1, 2, 4).
const individuellRef = ref(false)
onMounted(() => {
  // Pflichtfeld darf nicht als „nicht erhoben" (excluded) verharren (z. B. aus Import/Alt-Daten):
  // der Toggle bietet − bei required nicht an -> stillen Widerspruch defensiv auf confirmed heilen.
  if (props.node.required && fill.value.state === 'excluded') caseValues.set(props.node.id, { state: 'confirmed' })
  // Pflicht-Select OHNE „individuell" hat keinen ✎-Modus + versteckten Toggle: ein verwaister custom-Wert
  // (nicht in options, z. B. nach Options-Edit) waere unsichtbar/uneditierbar, wuerde aber im Renderer
  // ausgegeben. Auf confirmed (Standard-Option) heilen -> Anzeige == Ausgabe. NUR Orphans (gueltige
  // Options-Werte bleiben als bewusste Auswahl erhalten).
  // NUR Single-Select: bei Multi ist custom.value der verkettete Fliesstext (nie in options) -> diese
  // Orphan-Heilung wuerde sonst jede Mehrfachauswahl still auf die Standard-Option zuruecksetzen (Datenverlust).
  if (isSelect.value && !props.node.multiple && props.node.required && !props.node.allowCustom && fill.value.state === 'custom' && !options.value.includes(fill.value.value)) {
    caseValues.set(props.node.id, { state: 'confirmed' })
  }
  if (!props.node.multiple && fill.value.state === 'custom' && props.node.allowCustom && !options.value.includes(fill.value.value)) {
    individuellRef.value = true
  }
})
const individuell = computed(
  () =>
    fill.value.state === 'custom' &&
    !(Array.isArray(fill.value.values) && fill.value.values.length > 0) && // Multi-Auswahl (values) ist KEIN Freitext
    !!props.node.allowCustom &&
    (individuellRef.value || !options.value.includes(customValue.value)),
)
// aktuell gewaehlte Option (null = excluded/individuell). Orphan-Wert (nach Editor-Aenderung der
// options) faellt sichtbar auf die Standard-Option zurueck statt ins Leere/auf den Sentinel.
const selectedOption = computed<string | null>(() => {
  if (excluded.value || individuell.value) return null
  return options.value.includes(customValue.value) ? customValue.value : def.value
})

// --- Freitext-Feld: Tri-State wie gehabt ---
function onState(next: 'confirmed' | 'custom' | 'excluded'): void {
  // ✎: mit dem gemerkten Text (falls vorhanden) vorbelegen, sonst Default -> versehentliches Verlassen
  // ist verlustfrei zurueckholbar.
  if (next === 'custom') caseValues.set(props.node.id, { state: 'custom', value: restoreValue.value })
  else caseValues.set(props.node.id, { state: next })
}
// „Zurueckholen"-Hinweis: zurueck in den ✎-Modus (Feld = Freitext, Select = individuell).
function restorePreserved(): void {
  if (isSelect.value) pickIndividuell()
  else onState('custom')
}
function onInput(e: Event): void {
  caseValues.setCustom(props.node.id, (e.target as HTMLInputElement).value)
}
// Snippet(s) als Feldwert einsetzen (custom): kippt das Feld auf 'custom', der Wert bleibt normal editierbar.
// ANHAENGEN statt Ersetzen — so lassen sich mehrere Mustertexte kombinieren (Aufklaerung u. ae.), ohne dass
// der bestehende Text verloren geht. Basis = laufender ✎-Freitext ODER der ruhend gemerkte Text (prevValue,
// [[bewahren-eingabe]]); ein via Multi-Select verketteter Block kommt als EIN text an. Trenner = Leerzeile
// (schaltet useLongText automatisch aufs grosse Textfeld).
function onInsertSnippet(text: string): void {
  // trimEnd: endet die Basis schon auf Umbruch/Whitespace, sonst entstünde eine doppelte Leerzeile.
  const base = (fill.value.state === 'custom' ? fill.value.value : preservedText.value).trimEnd()
  const combined = base !== '' ? `${base}\n\n${text}` : text
  caseValues.setCustom(props.node.id, combined)
  snippetPickerOpen.value = false
}

// --- Select: die Auswahl traegt den Status ---
function pickOption(opt: string): void {
  individuellRef.value = false
  // Standard-Option = confirmed (default wird nie als custom materialisiert), sonst custom.
  if (opt === def.value) caseValues.set(props.node.id, { state: 'confirmed' })
  else caseValues.setCustom(props.node.id, opt)
}
function pickIndividuell(): void {
  individuellRef.value = true
  // vorhandenen individuell-Freitext behalten, sonst den ruhend gemerkten Text (Wiederherstellung), sonst leer
  const keep = fill.value.state === 'custom' && !options.value.includes(fill.value.value) ? fill.value.value : preservedText.value
  caseValues.setCustom(props.node.id, keep)
}
function pickExcluded(): void {
  caseValues.set(props.node.id, { state: 'excluded' })
}
// Auswahl im ✓-Modus: das Dropdown/die Radios fuehren NUR Wert-Optionen; „individuell" (✎) und
// „nicht erhoben" (−) laufen ueber den Tri-State-Toggle, nicht mehr ueber vergrabene Sentinel-Optionen.
function onSelectChange(e: Event): void {
  pickOption(options.value[Number((e.target as HTMLSelectElement).value)])
}

// Tri-State am Select — einheitlich mit dem Freitext-Feld: ✓ = Auswahl (Optionen sichtbar),
// ✎ = individuell (eigener Freitext, nur bei allowCustom), − = nicht erhoben.
const selectTriState = computed<'confirmed' | 'custom' | 'excluded'>(() =>
  excluded.value ? 'excluded' : individuell.value ? 'custom' : 'confirmed',
)
function onSelectState(next: 'confirmed' | 'custom' | 'excluded'): void {
  if (next === 'excluded') pickExcluded()
  else if (next === 'custom') pickIndividuell()
  else {
    // zurueck in den Auswahl-Modus: Standard-Option (confirmed); die sichtbaren Optionen erlauben das Umwaehlen.
    individuellRef.value = false
    caseValues.set(props.node.id, { state: 'confirmed' })
  }
}

// --- Multi-Select (Feld.multiple): Checkboxen bei ≤6, Multi-Dropdown bei >6. Der Erhebungs-Status steckt
// in der Auswahl selbst (leer=nicht erhoben, Standard-Menge=confirmed, sonst custom) — genau wie Single. ---
const isMulti = computed(() => isSelect.value && !!props.node.multiple)
const optionSet = computed(() => new Set(options.value))
const selectedSet = computed(() => multiSelected(props.node, fill.value))
const selectedOptions = computed(() => selectedSet.value.filter((v) => optionSet.value.has(v)))
const selectedOptionSet = computed(() => new Set(selectedOptions.value))
// Checkbox antippen (nur im ✓-Modus). Pflicht-Multi darf nicht auf „nicht erhoben" (excluded) fallen ->
// leeres Abwaehlen zurueck auf die Standard-Menge (sonst Sackgasse, da bei required kein −-Toggle).
function toggleMulti(opt: string): void {
  const next = multiFill(props.node, toggleMultiOption(selectedSet.value, opt, props.node))
  caseValues.setFill(props.node.id, props.node.required && next.state === 'excluded' ? { state: 'confirmed' } : next)
}
// Tri-State identisch zum Single-Select: ✓ Auswahl (Checkboxen) / ✎ individuell (eigener Freitext, wie
// vorher — KEIN Feld unter den Checkboxen) / − nicht erhoben. „individuell" reicht ueber pickIndividuell.
function onMultiTriState(next: 'confirmed' | 'custom' | 'excluded'): void {
  if (next === 'custom') {
    pickIndividuell() // ✎: eigener Freitext (custom OHNE values), genau wie beim Single-Select
    return
  }
  if (next === 'excluded') {
    // BEWAHREN: ✎-Freitext als prevValue, sonst die Options-Auswahl als prevValues -> verlustfrei zurueckholbar.
    const f = fill.value
    if (f.state === 'custom' && !(Array.isArray(f.values) && f.values.length) && f.value.trim() !== '') {
      caseValues.setFill(props.node.id, { state: 'excluded', prevValue: f.value })
    } else {
      const sel = selectedOptions.value.filter((s) => s.trim() !== '')
      caseValues.setFill(props.node.id, sel.length ? { state: 'excluded', prevValues: sel } : { state: 'excluded' })
    }
    return
  }
  // ✓ zurueck zur Auswahl: gemerkte Options-Auswahl (prevValues) wiederherstellen; sonst ueber set() gehen,
  // damit ein getippter ✎-Freitext als prevValue ERHALTEN bleibt („zurueckholen"-Hinweis) — einheitlich zum
  // Single-Select, statt ihn beim ✎->✓-Wechsel still zu verlieren.
  individuellRef.value = false
  const f = fill.value
  if (f.state === 'excluded' && f.prevValues && f.prevValues.length) {
    caseValues.setFill(props.node.id, multiFill(props.node, f.prevValues))
  } else {
    caseValues.set(props.node.id, { state: 'confirmed' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-1" :class="!isSelect && excluded ? 'opacity-60' : ''" :data-required-open="node.required && isOpen ? '' : undefined">
    <!-- MULTI-SELECT (Feld.multiple): Checkboxen bei wenigen, Multi-Dropdown bei vielen. Status = Auswahl
         (nichts=nicht erhoben, Standard-Menge=confirmed, sonst custom). Exklusive „Keine/Normal"-Option
         verdraengt andere automatisch. −-Zustand nur, wenn nicht Pflichtfeld. -->
    <template v-if="isMulti">
      <div class="flex items-center gap-2">
        <TriStateToggle v-if="node.allowCustom || !node.required" :model-value="selectTriState" :label="label" :allow-custom="!!node.allowCustom" :allow-excluded="!node.required" @update:model-value="onMultiTriState" />
        <span class="text-sm font-medium" :class="node.allowCustom || !node.required ? '' : 'pl-9'">{{ label }}<RequiredMark v-if="node.required" :open="isOpen" /></span>
      </div>

      <!-- ✓ Mehrfachauswahl: Checkboxen bei ≤6 (gleiches Raster wie die Radios), Multi-Dropdown bei >6 -->
      <div v-if="selectTriState === 'confirmed'" class="pl-9">
        <div v-if="!useDropdown" role="group" :aria-label="label" class="flex flex-col gap-1">
          <label v-for="opt in options" :key="opt" class="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" class="checkbox checkbox-sm shrink-0" :checked="selectedOptionSet.has(opt)" @change="toggleMulti(opt)" />
            <span>{{ opt }}</span>
          </label>
        </div>
        <details v-else class="dropdown w-full">
          <summary class="select select-sm flex w-full items-center" :aria-label="label">
            <span class="truncate">{{ selectedOptions.length ? joinFieldValues(selectedOptions) : 'auswählen …' }}</span>
          </summary>
          <ul class="menu dropdown-content z-10 mt-1 max-h-64 w-full flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow">
            <li v-for="opt in options" :key="opt">
              <label class="flex cursor-pointer items-center gap-2">
                <input type="checkbox" class="checkbox checkbox-sm shrink-0" :checked="selectedOptionSet.has(opt)" @change="toggleMulti(opt)" />
                <span>{{ opt }}</span>
              </label>
            </li>
          </ul>
        </details>
      </div>

      <!-- ✎ individuell: eigener Freitext — genau wie beim Single-Select (kein Feld unter den Checkboxen) -->
      <div v-else-if="selectTriState === 'custom'" class="pl-9">
        <input class="input input-sm w-full" :value="customValue" :aria-label="`${label}: individuell`" :aria-required="node.required || undefined" placeholder="eigener Text" @input="onInput" />
      </div>

      <!-- − nicht erhoben -->
      <p v-else class="pl-9 text-sm italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>
    </template>

    <!-- SELECT: Tri-State wie Freitext — ✓ Auswahl (Optionen sichtbar) / ✎ individuell / − nicht erhoben.
         ✎ nur bei allowCustom; Optionen bleiben im ✓-Modus (Default) sofort sichtbar. -->
    <template v-else-if="isSelect">
      <div class="flex items-center gap-2">
        <!-- Pflicht-Select OHNE „individuell" hat nur EINEN Zustand (✓) -> kein Toggle (waere ein toter Knopf);
             die Optionen sind ohnehin sofort sichtbar. Sonst normaler Tri-State. -->
        <TriStateToggle v-if="node.allowCustom || !node.required" :model-value="selectTriState" :label="label" :allow-custom="!!node.allowCustom" :allow-excluded="!node.required" @update:model-value="onSelectState" />
        <span class="text-sm font-medium" :class="node.allowCustom || !node.required ? '' : 'pl-9'">{{ label }}<RequiredMark v-if="node.required" :open="isOpen" /></span>
      </div>

      <!-- ✓ Auswahl: Radios bei wenigen, Dropdown bei vielen Optionen -->
      <div v-if="selectTriState === 'confirmed'" class="pl-9">
        <div v-if="!useDropdown" role="radiogroup" :aria-label="label" :aria-required="node.required || undefined" class="flex flex-col gap-1">
          <label v-for="opt in options" :key="opt" class="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" class="radio radio-sm shrink-0" :name="`sel-${node.id}`" :checked="selectedOption === opt" @change="pickOption(opt)" />
            <span>{{ opt }}</span>
          </label>
        </div>
        <select v-else class="select select-sm w-full" :value="String(options.indexOf(selectedOption ?? ''))" :aria-label="label" :aria-required="node.required || undefined" @change="onSelectChange">
          <option v-for="(opt, i) in options" :key="i" :value="i">{{ opt }}</option>
        </select>
      </div>

      <!-- ✎ individuell: eigener Freitext -->
      <div v-else-if="selectTriState === 'custom'" class="pl-9">
        <input class="input input-sm w-full" :value="customValue" :aria-label="`${label}: individuell`" :aria-required="node.required || undefined" placeholder="eigener Text" @input="onInput" />
      </div>

      <!-- − nicht erhoben -->
      <p v-else class="pl-9 text-sm italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>
    </template>

    <!-- FREITEXT-Feld: Tri-State (Eingabe erst bei ✎) -->
    <template v-else>
      <div class="flex items-center gap-2">
        <TriStateToggle :model-value="triState" :label="label" :allow-excluded="!node.required" @update:model-value="onState" />
        <span class="text-sm font-medium">{{ label }}<RequiredMark v-if="node.required" :open="isOpen" /></span>
        <!-- Icon-only (Bausteine-4-Quadrate-Icon aus dem Dock -> Wiedererkennung); Bedeutung via aria-label/Tooltip -->
        <button type="button" class="btn btn-ghost btn-sm ml-auto min-h-11 min-w-11 shrink-0 px-1.5" aria-label="Snippet einfügen" title="Snippet einfügen" @click="snippetPickerOpen = true">
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </svg>
        </button>
      </div>
      <p v-if="fill.state === 'confirmed'" class="pl-9 text-sm text-base-content/70" :class="useLongText ? 'whitespace-pre-wrap' : ''">{{ def || '(kein Standardwert)' }}</p>
      <div v-else-if="fill.state === 'custom'" class="pl-9">
        <!-- mehrzeilig (Feld-Def ODER Wert mit Umbruechen) -> grosses Textfeld; sonst die einzeilige Zeile -->
        <LongTextField v-if="useLongText" :model-value="customValue" :title="label" :required="node.required" @update:model-value="caseValues.setCustom(node.id, $event)" />
        <input v-else class="input input-sm w-full" :value="customValue" :aria-label="`${label}: eigener Wert`" :aria-required="node.required || undefined" @input="onInput" />
      </div>
      <p v-else class="pl-9 text-sm italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>
      <SnippetPicker v-if="snippetPickerOpen" multiple title="Snippets als Wert einfügen" @select="onInsertSnippet" @close="snippetPickerOpen = false" />
    </template>

    <!-- Pflichtfeld noch offen: ruhiger Amber-Hinweis (kein roter Rahmen/kein Gate — darf im Einsatz
         legitim noch leer sein). Einheitlich mit dem pl-9-Raster der „nicht erhoben"-Zeile. -->
    <p v-if="node.required && isOpen" class="pl-9 text-sm text-warning">Pflichtfeld – noch offen</p>

    <!-- BEWAHREN: getippter Text ruht (Feld steht auf ✓/−) -> ruhiger, antippbarer Hinweis zum
         verlustfreien Zurueckholen. Der Text erscheint NIE in der Ausgabe, solange er ruht. -->
    <button v-if="preservedText" type="button" class="flex min-h-11 items-center gap-1.5 pl-9 text-left text-sm text-info hover:underline" :title="preservedText" @click="restorePreserved">
      <span aria-hidden="true">✎</span>
      <span>Getippter Text gemerkt — zurückholen</span>
    </button>
  </div>
</template>
