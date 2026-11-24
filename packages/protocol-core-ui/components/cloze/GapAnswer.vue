<script setup lang="ts">
/**
 * Die Antwort auf EINE Lücke eines Lückentexts, hinter der ein Feld steht. Groß und daumentauglich: jede
 * Antwort ist mindestens 44 px hoch, Eingaben haben 16 px Schrift. Jede Eingabe gilt sofort. Die
 * Zustände sind die des Feldes: Standardwert der Vorlage, eigener Wert, „nicht erhoben".
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { Field } from '@resqdocs/protocol-core/model'
import { defaultOptionValue, individuellPrefill, multiFill, multiSelected, startsEmpty, toggleMultiOption } from '@resqdocs/protocol-core/fill'
import { OPTION_SEARCH_MIN, visibleOptions } from '@resqdocs/protocol-core/textSearch'
import { useCaseValues } from '../../useCaseValues.ts'
import LongTextField from '../LongTextField.vue'

const props = defineProps<{ node: Field }>()
const emit = defineEmits<{ advance: [] }>()
const caseValues = useCaseValues()

const id = computed(() => props.node.id)
const label = computed(() => (props.node.title && props.node.title.trim()) || 'Lücke')
const fill = computed(() => caseValues.get(props.node.id, props.node))
const options = computed(() => [...new Set((props.node.options ?? []).filter((o) => o !== ''))])
const isSelect = computed(() => options.value.length > 0)
const isMulti = computed(() => isSelect.value && !!props.node.multiple)
const def = computed(() => (isSelect.value ? (startsEmpty(props.node) ? '' : defaultOptionValue(props.node)) : (props.node.default ?? '')))
const excluded = computed(() => fill.value.state === 'excluded')

// Lange Listen bekommen dieselbe Suche wie die Felder im Einsatz. Bei Mehrfachauswahl bleiben die
// gewählten Optionen oben stehen, auch wenn sie nicht zur Suche passen - so lassen sie sich abwählen.
const query = ref('')
const searchable = computed(() => options.value.length >= OPTION_SEARCH_MIN)
const shown = computed(() => (searchable.value ? visibleOptions(options.value, query.value, isMulti.value ? chosen.value : undefined) : options.value))

// „Eigener Text" neben einer Auswahl (nur wenn die Vorlage das erlaubt).
const writing = ref(false)
const ownText = computed(() => {
  const f = fill.value
  return f.state === 'custom' && !(f.values && f.values.length) && !options.value.includes(f.value) ? f.value : null
})
const showOwn = computed(() => isSelect.value && !!props.node.allowCustom && (writing.value || ownText.value !== null))
watch(id, () => {
  writing.value = false
  query.value = ''
})

const picked = computed<string | null>(() => {
  const f = fill.value
  if (f.state === 'excluded' || showOwn.value) return null
  if (f.state === 'custom') return options.value.includes(f.value) ? f.value : null
  return def.value || null
})
function pick(option: string): void {
  writing.value = false
  if (option === def.value) caseValues.set(id.value, { state: 'confirmed' })
  else caseValues.setCustom(id.value, option)
  emit('advance')
}

const chosen = computed(() => new Set(showOwn.value ? [] : multiSelected(props.node, fill.value)))
function toggle(option: string): void {
  writing.value = false
  const next = multiFill(props.node, toggleMultiOption(showOwn.value ? [] : multiSelected(props.node, fill.value), option, props.node))
  // Ein Pflichtfeld kann nicht auf „nicht erhoben" fallen: ohne Auswahl ist es wieder offen.
  caseValues.setFill(id.value, props.node.required && next.state === 'excluded' ? { state: 'confirmed' } : next)
}

const ownInput = ref<HTMLInputElement | null>(null)
function startOwn(): void {
  if (ownText.value === null) caseValues.setCustom(id.value, individuellPrefill(props.node, fill.value, caseValues.getPrevValue(id.value)))
  writing.value = true
  void nextTick(() => ownInput.value?.focus({ preventScroll: true }))
}

// Freitext-Lücke: der Standardwert steht zum Überschreiben im Feld.
const text = computed(() => (fill.value.state === 'custom' ? fill.value.value : fill.value.state === 'confirmed' ? def.value : ''))
function write(value: string): void {
  caseValues.setCustom(id.value, value)
}
function useDefault(): void {
  writing.value = false
  caseValues.set(id.value, { state: 'confirmed' })
  emit('advance')
}
function exclude(): void {
  writing.value = false
  caseValues.set(id.value, { state: 'excluded' })
  emit('advance')
}

const textInput = ref<HTMLInputElement | null>(null)
/** Tastatur gleich öffnen, wenn die Lücke einzeiligen Freitext erwartet. */
function focusText(): boolean {
  if (isSelect.value || props.node.multiline || !textInput.value) return false
  textInput.value.focus({ preventScroll: true })
  return true
}
defineExpose({ focusText })

const ROW = 'btn h-auto min-h-11 w-full justify-start gap-3 whitespace-normal py-2 text-left text-base font-normal [overflow-wrap:anywhere]'
</script>

<template>
  <div class="space-y-2" data-gap-answer>
    <template v-if="isSelect">
      <!-- autocorrect/autocapitalize aus: iOS verfälscht sonst getippte Codes. -->
      <input v-if="searchable" v-model="query" type="search" class="input w-full text-base" :aria-label="`${label} durchsuchen`" placeholder="Nummer oder Text suchen" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" data-gap-search />
      <div class="space-y-1.5" role="group" :aria-label="label">
        <template v-if="isMulti">
          <label v-for="o in shown" :key="o" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border px-3 py-2 text-base [overflow-wrap:anywhere]" :class="chosen.has(o) ? 'border-neutral bg-base-200 font-medium' : 'border-base-300'">
            <input type="checkbox" class="checkbox shrink-0" :checked="chosen.has(o)" @change="toggle(o)" />
            <span class="min-w-0 flex-1">{{ o }}</span>
          </label>
        </template>
        <template v-else>
          <button v-for="o in shown" :key="o" type="button" :class="[ROW, picked === o ? 'btn-neutral' : '']" :aria-pressed="picked === o" data-gap-option @click="pick(o)">
            <span class="min-w-0 flex-1">{{ o }}</span>
            <span v-if="o === def" class="shrink-0 text-sm">Standard</span>
          </button>
        </template>
        <p v-if="!shown.length" class="text-sm text-base-content/80">Keine Treffer</p>
      </div>
      <template v-if="node.allowCustom">
        <button v-if="!showOwn" type="button" :class="ROW" data-gap-own @click="startOwn">Eigener Text …</button>
        <LongTextField v-else-if="node.customMultiline" :model-value="ownText ?? ''" :title="label" @update:model-value="write" />
        <input v-else ref="ownInput" type="text" class="input w-full text-base" :value="ownText ?? ''" :aria-label="`${label}: eigener Text`" placeholder="Eigener Text" enterkeyhint="next" @input="write(($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('advance')" />
      </template>
    </template>

    <template v-else>
      <LongTextField v-if="node.multiline" :model-value="text" :title="label" :required="node.required" @update:model-value="write" />
      <input v-else ref="textInput" type="text" class="input w-full text-base" :value="text" :aria-label="label" :aria-required="node.required || undefined" :placeholder="excluded ? 'nicht erhoben – tippen zum Schreiben' : 'Tippen oder diktieren …'" enterkeyhint="next" data-gap-input @input="write(($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('advance')" />
      <button v-if="def !== '' && fill.state !== 'confirmed'" type="button" :class="ROW" data-gap-default @click="useDefault">
        <span class="min-w-0 flex-1">{{ def }}</span>
        <span class="shrink-0 text-sm">Standard</span>
      </button>
    </template>

    <button v-if="!node.required" type="button" :class="[ROW, excluded ? 'btn-neutral' : '']" :aria-pressed="excluded" data-gap-exclude @click="exclude">nicht erhoben</button>
  </div>
</template>
