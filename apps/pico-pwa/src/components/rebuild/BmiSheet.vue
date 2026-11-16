<script setup lang="ts">
/**
 * Eingabe-Sheet der Funktion „BMI": Gewicht (kg) und Größe (cm) → Live-Vorschau von Wert und WHO-Klasse;
 * „Übernehmen" schreibt die EINE Zeile zurück (ScoreFunction). Rechenkern scores.bmi
 * (docs/medical-sources.md: WHO TRS 894). Die Klassen gelten für Erwachsene - das Blatt sagt es.
 */
import { computed, ref } from 'vue'
import type { BMIRow } from '@resqdocs/protocol-core/model'
import { bmi } from '@resqdocs/protocol-core/tools/scores.mjs'

const props = defineProps<{ initial?: BMIRow }>()
const emit = defineEmits<{ apply: [row: BMIRow]; close: [] }>()

// Leeres Feld = null (nichts unterstellen). v-model.number liefert bei leerem Input NaN -> auf null normieren.
const weight = ref<number | null>(props.initial?.bmiWeight ?? null)
const height = ref<number | null>(props.initial?.bmiHeight ?? null)
const norm = (v: number | null): number | null => (v == null || !Number.isFinite(v) || v <= 0 ? null : v)

const result = computed(() => {
  const w = norm(weight.value)
  const h = norm(height.value)
  if (w == null || h == null) return null
  return bmi({ weightKg: w, heightCm: h })
})

function apply(): void {
  const w = norm(weight.value)
  const h = norm(height.value)
  if (w == null || h == null) return
  emit('apply', { bmiWeight: w, bmiHeight: h })
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="BMI berechnen">
      <div class="modal-box flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">BMI berechnen</h3>

        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">Gewicht in kg</span>
          <input v-model.number="weight" type="number" inputmode="decimal" min="1" step="0.1" placeholder="z. B. 80"
                 class="input input-sm w-full" aria-label="Gewicht in kg" @keyup.enter="apply" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">Größe in cm</span>
          <input v-model.number="height" type="number" inputmode="numeric" min="1" step="1" placeholder="z. B. 180"
                 class="input input-sm w-full" aria-label="Größe in cm" @keyup.enter="apply" />
        </label>

        <p class="rounded-lg bg-base-200 p-2 text-sm" role="status">
          <template v-if="result"><strong>BMI {{ String(result.value).replace('.', ',') }}</strong> <span class="text-base-content/70">{{ result.klass }}</span></template>
          <span v-else class="italic text-base-content/50">Beide Werte eingeben für das Ergebnis.</span>
        </p>
        <p class="text-xs text-base-content/60">Einordnung nach WHO, gilt für Erwachsene.</p>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!result" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
