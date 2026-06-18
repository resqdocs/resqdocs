<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ekgAxisTable } from '@resqdocs/protocol-core/tools/scores.mjs'
import ToolModal from './ToolModal.vue'

/**
 * EKG-Lagetyp (#85): QRS-Hauptausschlag je Ableitung I/II/III (positiv/negativ)
 * antippen; nur wenn alle positiv sind, entscheidet zusätzlich die grössere
 * R-Zacke (I vs. III) zwischen Indifferenz- und Steiltyp. Nicht eindeutige
 * Konstellationen → "Angaben kontrollieren". Eigene Umsetzung/Wording.
 */
const emit = defineEmits<{ apply: [text: string] }>()

type Defl = 'pos' | 'neg'
type RLarger = 'I' | 'III' | 'unclear'
const I = ref<Defl>('pos')
const II = ref<Defl>('pos')
const III = ref<Defl>('pos')
const rLarger = ref<RLarger>('unclear')

// markRaw-frei: stabile Liste der Ableitungs-Refs für das Template.
const leads = [
  { name: 'I', model: I },
  { name: 'II', model: II },
  { name: 'III', model: III },
]

function resetInputs(): void {
  I.value = 'pos'; II.value = 'pos'; III.value = 'pos'; rLarger.value = 'unclear'
}

/** Der R-Vergleich ist nur bei allseits positivem Hauptausschlag relevant. */
const needsR = computed(() => I.value === 'pos' && II.value === 'pos' && III.value === 'pos')
watch(needsR, (v) => { if (!v) rLarger.value = 'unclear' })

const result = computed(() =>
  ekgAxisTable({ leadI: I.value, leadII: II.value, leadIII: III.value, rLarger: rLarger.value }),
)
const resultText = computed(() => (result.value.typ ? result.value.text : ''))
</script>

<template>
  <ToolModal
    button-label="Lagetyp bestimmen"
    title="EKG-Lagetyp"
    :result-text="resultText"
    @apply="emit('apply', $event)"
    @opened="resetInputs"
  >
    <p class="text-xs text-base-content/60">
      Hauptausschlag des QRS-Komplexes (bezogen auf die isoelektrische Linie) je Ableitung wählen.
    </p>

    <div v-for="lead in leads" :key="lead.name" class="form-control">
      <span class="label-text mb-1">Ableitung {{ lead.name }} — QRS überwiegend</span>
      <div class="join">
        <button
          type="button" class="btn join-item btn-sm"
          :class="lead.model.value === 'pos' ? 'btn-primary' : 'btn-outline'"
          @click="lead.model.value = 'pos'"
        >positiv</button>
        <button
          type="button" class="btn join-item btn-sm"
          :class="lead.model.value === 'neg' ? 'btn-primary' : 'btn-outline'"
          @click="lead.model.value = 'neg'"
        >negativ</button>
      </div>
    </div>

    <div v-if="needsR" class="form-control">
      <span class="label-text mb-1">Grössere R-Zacke in …</span>
      <div class="join">
        <button
          type="button" class="btn join-item btn-sm"
          :class="rLarger === 'I' ? 'btn-primary' : 'btn-outline'"
          @click="rLarger = 'I'"
        >Ableitung I</button>
        <button
          type="button" class="btn join-item btn-sm"
          :class="rLarger === 'III' ? 'btn-primary' : 'btn-outline'"
          @click="rLarger = 'III'"
        >Ableitung III</button>
        <button
          type="button" class="btn join-item btn-sm"
          :class="rLarger === 'unclear' ? 'btn-primary' : 'btn-outline'"
          @click="rLarger = 'unclear'"
        >unklar</button>
      </div>
    </div>

    <p v-if="!result.typ" class="text-sm text-warning">{{ result.text }}</p>
  </ToolModal>
</template>
