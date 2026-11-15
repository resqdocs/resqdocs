<script setup lang="ts">
/** Eine Bedingung bearbeiten: „im Auswahlfeld X ist eine dieser Optionen gewaehlt". Geteilt von den
 *  Regeln fuer das Erscheinen und fuer den abhaengigen Standardwert (ContainerProperties). */
import { computed } from 'vue'
import type { Condition, Container, Field } from '@resqdocs/protocol-core/model'
import { findNode } from '@resqdocs/protocol-core/creator'

const props = defineProps<{
  root: Container
  condition: Condition
  /** Felder, die als Quelle erlaubt sind (ohne Kreis). Das gesetzte Feld wird immer mit angeboten. */
  choices: Field[]
  /** Ueberschrift ueber den Optionen, z. B. „Wenn eine davon gewählt ist" */
  optionsLabel: string
}>()
const emit = defineEmits<{ update: [condition: Condition] }>()

const label = (f: Field): string => f.title?.trim() || f.id
const source = computed<Field | null>(() => {
  const found = props.condition.fieldId ? findNode(props.root, props.condition.fieldId) : null
  return found && found.type === 'field' && found.options?.some((o) => o !== '') ? found : null
})
const sourceOptions = computed<string[]>(() => [...new Set((source.value?.options ?? []).filter((o) => o !== ''))])
/** Gewaehlte Optionen, die es im Feld nicht mehr gibt (umbenannt oder geloescht). */
const stale = computed<string[]>(() => props.condition.options.filter((o) => !sourceOptions.value.includes(o)))
const fieldChoices = computed<Field[]>(() => {
  const s = source.value
  return s && !props.choices.some((f) => f.id === s.id) ? [s, ...props.choices] : props.choices
})

function setField(fieldId: string): void {
  emit('update', { ...props.condition, fieldId, options: [] }) // anderes Feld, andere Optionen: Auswahl beginnt neu
}
function toggle(option: string, on: boolean): void {
  const chosen = new Set(props.condition.options.filter((o) => o !== option))
  if (on) chosen.add(option)
  // Reihenfolge wie im Feld; Optionen, die es dort nicht mehr gibt, bleiben hinten stehen, bis man sie abwaehlt.
  const ordered = [...sourceOptions.value.filter((o) => chosen.has(o)), ...[...chosen].filter((o) => !sourceOptions.value.includes(o))]
  emit('update', { ...props.condition, options: ordered })
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="!source" role="alert" class="flex items-start gap-1 text-sm text-error">
      <span aria-hidden="true">⚠</span>
      <span>Dieses Feld gibt es nicht mehr oder es hat keine Auswahl-Optionen mehr. Die Bedingung wirkt nicht.</span>
    </p>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Feld</legend>
      <select class="select w-full" :value="source ? condition.fieldId : ''" aria-label="Feld der Bedingung" @change="setField(($event.target as HTMLSelectElement).value)">
        <option v-if="!source" value="" disabled>Feld wählen …</option>
        <option v-for="f in fieldChoices" :key="f.id" :value="f.id">{{ label(f) }}</option>
      </select>
    </fieldset>
    <fieldset v-if="source" class="fieldset">
      <legend class="fieldset-legend">{{ optionsLabel }}</legend>
      <label v-for="o in sourceOptions" :key="o" class="flex min-h-9 cursor-pointer items-center gap-2 py-0.5">
        <input type="checkbox" class="checkbox checkbox-sm shrink-0" :checked="condition.options.includes(o)" @change="toggle(o, ($event.target as HTMLInputElement).checked)" />
        <span class="text-sm">{{ o }}</span>
      </label>
      <label v-for="o in stale" :key="'alt-' + o" class="flex min-h-9 cursor-pointer items-center gap-2 py-0.5 text-error">
        <input type="checkbox" class="checkbox checkbox-sm shrink-0" checked @change="toggle(o, false)" />
        <span class="text-sm">{{ o }} <span class="text-xs">(gibt es im Feld nicht mehr)</span></span>
      </label>
      <p v-if="!condition.options.length" class="text-xs text-warning">Noch keine Option gewählt: Die Bedingung wirkt erst mit mindestens einer.</p>
    </fieldset>
  </div>
</template>
