<script setup lang="ts">
/**
 * Eingabe-Sheet der Score-Funktion „Pack-Years" (#55-Rework): Zigaretten/Tag + Raucherjahre → Live-
 * Vorschau der Packungsjahre; „Übernehmen" schreibt die EINE Score-Zeile zurück (ScoreFunction).
 * Rechenkern scores.packYears (dependency-frei, quellenbelegt: NCI Pack-Year-Definition, packs/Tag × Jahre).
 *
 * Teleport an body wie die Scan-Sheets (backdrop-blur-Vorfahr des Einsatz-Shells würde ein fixed/Modal
 * sonst einsperren). daisyUI .modal modal-bottom (mobil) / modal-middle (ab sm).
 */
import { computed, ref } from 'vue'
import type { PackYearsRow } from '@resqdocs/protocol-core/model'
import { packYears, packYearsShort } from '@resqdocs/protocol-core/tools/scores.mjs'

const props = defineProps<{ initial?: PackYearsRow }>()
const emit = defineEmits<{ apply: [row: PackYearsRow]; close: [] }>()

// Leeres Feld = null (kein 0 unterstellen). v-model.number liefert bei leerem Input NaN -> auf null normieren.
const cig = ref<number | null>(props.initial?.cigarettesPerDay ?? null)
const yrs = ref<number | null>(props.initial?.years ?? null)
const norm = (v: number | null): number | null => (v == null || !Number.isFinite(v) || v < 0 ? null : v)

const preview = computed(() => {
  const c = norm(cig.value)
  const y = norm(yrs.value)
  if (c == null || y == null) return null
  return packYears({ cigarettesPerDay: c, years: y }).raw
})
const previewText = computed(() => (preview.value == null ? '' : packYearsShort(preview.value)))

function apply(): void {
  const c = norm(cig.value)
  const y = norm(yrs.value)
  if (c == null || y == null) return
  emit('apply', { cigarettesPerDay: c, years: y })
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="Pack-Years berechnen">
      <div class="modal-box flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">Pack-Years berechnen</h3>

        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">Zigaretten pro Tag</span>
          <input v-model.number="cig" type="number" inputmode="numeric" min="0" step="1" placeholder="z. B. 20"
                 class="input input-sm w-full" aria-label="Zigaretten pro Tag" @keyup.enter="apply" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/60">Raucherjahre</span>
          <input v-model.number="yrs" type="number" inputmode="numeric" min="0" step="1" placeholder="z. B. 15"
                 class="input input-sm w-full" aria-label="Raucherjahre" @keyup.enter="apply" />
        </label>

        <p class="rounded-lg bg-base-200 p-2 text-sm" role="status">
          <template v-if="previewText"><strong>{{ previewText }}</strong> <span class="text-base-content/60">(Zig./Tag ÷ 20 × Jahre)</span></template>
          <span v-else class="italic text-base-content/50">Beide Werte eingeben für das Ergebnis.</span>
        </p>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="preview == null" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
