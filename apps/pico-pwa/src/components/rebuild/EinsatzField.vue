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
import { useCaseValues } from '@/rebuild/useCaseValues'
import TriStateToggle from '@/components/TriStateToggle.vue'
import LongTextField from './LongTextField.vue'

const props = defineProps<{ node: Field }>()
const caseValues = useCaseValues()

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
const customValue = computed(() => (fill.value.state === 'custom' ? fill.value.value : def.value))
const excluded = computed(() => fill.value.state === 'excluded')

// „individuell"/Freitext: sticky ref (vom Nutzer gesetzt -> kein Modus-Flip beim Tippen eines
// Options-Texts) PLUS Ableitung „Wert nicht in options". Der computed gatet auf state==='custom',
// daher KEIN veralteter Zustand nach reset()/excluded (loest Review-Befunde 1, 2, 4).
const individuellRef = ref(false)
onMounted(() => {
  if (fill.value.state === 'custom' && props.node.allowCustom && !options.value.includes(fill.value.value)) {
    individuellRef.value = true
  }
})
const individuell = computed(
  () => fill.value.state === 'custom' && !!props.node.allowCustom && (individuellRef.value || !options.value.includes(customValue.value)),
)
// aktuell gewaehlte Option (null = excluded/individuell). Orphan-Wert (nach Editor-Aenderung der
// options) faellt sichtbar auf die Standard-Option zurueck statt ins Leere/auf den Sentinel.
const selectedOption = computed<string | null>(() => {
  if (excluded.value || individuell.value) return null
  return options.value.includes(customValue.value) ? customValue.value : def.value
})

// --- Freitext-Feld: Tri-State wie gehabt ---
function onState(next: 'confirmed' | 'custom' | 'excluded'): void {
  if (next === 'custom') caseValues.set(props.node.id, { state: 'custom', value: customValue.value })
  else caseValues.set(props.node.id, { state: next })
}
function onInput(e: Event): void {
  caseValues.setCustom(props.node.id, (e.target as HTMLInputElement).value)
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
  // vorhandenen Freitext behalten, sonst leer starten
  const keep = fill.value.state === 'custom' && !options.value.includes(fill.value.value) ? fill.value.value : ''
  caseValues.setCustom(props.node.id, keep)
}
function pickExcluded(): void {
  caseValues.set(props.node.id, { state: 'excluded' })
}
function onSelectChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  if (v === '-2') pickExcluded()
  else if (v === '-1') pickIndividuell()
  else pickOption(options.value[Number(v)])
}
</script>

<template>
  <div class="flex flex-col gap-1" :class="!isSelect && excluded ? 'opacity-60' : ''">
    <!-- SELECT: Optionen immer sichtbar; Status steckt in der Auswahl -->
    <template v-if="isSelect">
      <span class="text-sm font-medium">{{ label }}</span>

      <!-- wenige Optionen -> Radios (als Gruppe mit Label) -->
      <div v-if="!useDropdown" role="radiogroup" :aria-label="label" class="flex flex-col gap-1 pl-1">
        <label v-for="opt in options" :key="opt" class="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" class="radio radio-sm shrink-0" :name="`sel-${node.id}`" :checked="selectedOption === opt" @change="pickOption(opt)" />
          <span>{{ opt }}</span>
        </label>
        <label v-if="node.allowCustom" class="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" class="radio radio-sm shrink-0" :name="`sel-${node.id}`" :checked="individuell" :aria-controls="`indiv-${node.id}`" @change="pickIndividuell" />
          <span>individuell …</span>
        </label>
        <input v-if="node.allowCustom && individuell" :id="`indiv-${node.id}`" class="input input-sm w-full" :value="customValue" :aria-label="`${label}: individuell`" placeholder="eigener Text" @input="onInput" />
        <!-- „nicht erhoben" optisch abgesetzt (Status, kein Wert); aktiv nicht gedimmt -->
        <label class="mt-1 flex cursor-pointer items-center gap-2 border-t border-base-200 pt-1.5 text-sm" :class="excluded ? 'text-base-content' : 'italic text-base-content/60'">
          <input type="radio" class="radio radio-sm shrink-0" :name="`sel-${node.id}`" :checked="excluded" @change="pickExcluded" />
          <span>nicht erhoben</span>
        </label>
      </div>

      <!-- viele Optionen -> Dropdown (Index-basiert + Sentinels, kollisionsfrei) -->
      <template v-else>
        <select class="select select-sm w-full" :value="excluded ? '-2' : individuell ? '-1' : String(options.indexOf(selectedOption ?? ''))" :aria-label="label" @change="onSelectChange">
          <option v-for="(opt, i) in options" :key="i" :value="i">{{ opt }}</option>
          <option v-if="node.allowCustom" :value="-1">individuell …</option>
          <option :value="-2">nicht erhoben</option>
        </select>
        <input v-if="node.allowCustom && individuell" :id="`indiv-${node.id}`" class="input input-sm w-full" :value="customValue" :aria-label="`${label}: individuell`" placeholder="eigener Text" @input="onInput" />
      </template>
    </template>

    <!-- FREITEXT-Feld: Tri-State (Eingabe erst bei ✎) -->
    <template v-else>
      <div class="flex items-center gap-2">
        <TriStateToggle :model-value="triState" :label="label" @update:model-value="onState" />
        <span class="text-sm font-medium">{{ label }}</span>
      </div>
      <p v-if="fill.state === 'confirmed'" class="pl-9 text-sm text-base-content/70" :class="node.multiline ? 'whitespace-pre-wrap' : ''">{{ def || '(kein Standardwert)' }}</p>
      <div v-else-if="fill.state === 'custom'" class="pl-9">
        <!-- mehrzeilig -> grosses Textfeld (Sheet, live); sonst die einzeilige Zeile wie bisher -->
        <LongTextField v-if="node.multiline" :model-value="customValue" :title="label" @update:model-value="caseValues.setCustom(node.id, $event)" />
        <input v-else class="input input-sm w-full" :value="customValue" :aria-label="`${label}: eigener Wert`" @input="onInput" />
      </div>
      <p v-else class="pl-9 text-sm italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>
    </template>
  </div>
</template>
