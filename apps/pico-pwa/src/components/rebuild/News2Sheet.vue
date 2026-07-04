<script setup lang="ts">
/**
 * Eingabe-Sheet der Score-Funktion „NEWS2" (#55-Rework): die RCP-2017-Parameter (Atemfrequenz, SpO₂,
 * RR systolisch, Herzfrequenz, Temperatur, Bewusstsein ACVPU) + O₂-Gabe. `scale2` schaltet die SpO₂-Skala 2
 * (ärztlich dokumentiertes Ziel 88–92 %, z. B. COPD). Live-Vorschau: Aggregat-Score + Risiko (Rechenkern
 * scores.news2, quellenbelegt RCP 2017 in docs/medical-sources.md). „Übernehmen" schreibt die EINE
 * Score-Zeile zurück (ScoreFunction).
 *
 * Teleport an body wie die anderen Sheets (backdrop-blur-Vorfahr des Einsatz-Shells würde ein fixed/Modal
 * sonst einsperren). daisyUI .modal modal-bottom (mobil) / modal-middle (ab sm).
 */
import { computed, ref } from 'vue'
import type { NEWS2Row } from '@resqdocs/protocol-core/model'
import { news2 } from '@resqdocs/protocol-core/tools/scores.mjs'

const props = defineProps<{ initial?: NEWS2Row }>()
const emit = defineEmits<{ apply: [row: NEWS2Row]; close: [] }>()

// Leeres Zahlenfeld = null (kein 0 unterstellen). v-model.number liefert bei leerem Input NaN -> null.
const rr = ref<number | null>(props.initial?.rr ?? null)
const spo2 = ref<number | null>(props.initial?.spo2 ?? null)
const systolic = ref<number | null>(props.initial?.systolic ?? null)
const pulse = ref<number | null>(props.initial?.pulse ?? null)
const temp = ref<number | null>(props.initial?.temp ?? null)
const consciousness = ref<'A' | 'C' | 'V' | 'P' | 'U'>(props.initial?.consciousness ?? 'A')
const onOxygen = ref<boolean>(props.initial?.onOxygen ?? false)
const scale2 = ref<boolean>(props.initial?.scale2 ?? false)

const num = (v: number | null): number | null => (v == null || !Number.isFinite(v) || v < 0 ? null : v)
// SpO₂ ist physiologisch 0-100 % - >100 ist unmoeglich (Verify-Fund bug-304). Das HTML-max erzwingt bei
// v-model.number den gebundenen Wert NICHT -> die Obergrenze hier pruefen (Uebernehmen sperren + Hinweis).
const spo2TooHigh = computed(() => {
  const n = num(spo2.value)
  return n != null && n > 100
})
// Vollständig = alle 5 Vitalzahlen gesetzt (ACVPU hat den Default „A") UND SpO₂ <= 100. VOR dem news2-Aufruf
// pruefen: scores.news2 wirft bei fehlender Zahl/ungueltigem ACVPU.
// Kein expliziter Rueckgabetyp: TS inferiert die Vitalfelder als `number` (nicht number|undefined) -
// so ist das Objekt sowohl gueltiges News2Input (news2) als auch NEWS2Row (emit apply).
const values = computed(() => {
  const rrN = num(rr.value)
  const spo2N = num(spo2.value)
  const sysN = num(systolic.value)
  const pulseN = num(pulse.value)
  const tempN = num(temp.value)
  if (rrN == null || spo2N == null || spo2N > 100 || sysN == null || pulseN == null || tempN == null) return null
  return { rr: rrN, spo2: spo2N, systolic: sysN, pulse: pulseN, temp: tempN, consciousness: consciousness.value, onOxygen: onOxygen.value, scale2: scale2.value }
})
const result = computed(() => (values.value ? news2(values.value) : null))

const ACVPU: { v: 'A' | 'C' | 'V' | 'P' | 'U'; label: string }[] = [
  { v: 'A', label: 'A – wach' },
  { v: 'C', label: 'C – neue Verwirrtheit' },
  { v: 'V', label: 'V – auf Ansprache' },
  { v: 'P', label: 'P – auf Schmerzreiz' },
  { v: 'U', label: 'U – keine Reaktion' },
]
// Risiko-Farbe fürs Badge (daisyUI). risk = 'niedrig' | 'mittel' | 'hoch' (rein aggregat-basiert).
const riskClass = computed(() => {
  const r = result.value?.risk
  if (r === 'hoch') return 'badge-error'
  if (r === 'mittel') return 'badge-warning'
  return 'badge-success'
})

function apply(): void {
  if (values.value) emit('apply', values.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="NEWS2 berechnen">
      <div class="modal-box flex max-h-[90vh] flex-col gap-3 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">NEWS2 berechnen</h3>

        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Atemfrequenz /min</span>
            <input v-model.number="rr" type="number" inputmode="numeric" min="0" step="1" placeholder="z. B. 16"
                   class="input input-sm w-full" aria-label="Atemfrequenz pro Minute" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">SpO₂ %</span>
            <input v-model.number="spo2" type="number" inputmode="numeric" min="0" max="100" step="1" placeholder="z. B. 98"
                   class="input input-sm w-full" :class="{ 'input-error': spo2TooHigh }" aria-label="Sauerstoffsättigung in Prozent" />
            <span v-if="spo2TooHigh" class="text-xs text-error">Höchstens 100 %.</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">RR systolisch mmHg</span>
            <input v-model.number="systolic" type="number" inputmode="numeric" min="0" step="1" placeholder="z. B. 120"
                   class="input input-sm w-full" aria-label="Systolischer Blutdruck in mmHg" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Herzfrequenz /min</span>
            <input v-model.number="pulse" type="number" inputmode="numeric" min="0" step="1" placeholder="z. B. 72"
                   class="input input-sm w-full" aria-label="Herzfrequenz pro Minute" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Temperatur °C</span>
            <input v-model.number="temp" type="number" inputmode="decimal" min="0" step="0.1" placeholder="z. B. 36,8"
                   class="input input-sm w-full" aria-label="Körpertemperatur in Grad Celsius" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Bewusstsein (ACVPU)</span>
            <select v-model="consciousness" class="select select-sm w-full" aria-label="Bewusstsein nach ACVPU">
              <option v-for="o in ACVPU" :key="o.v" :value="o.v">{{ o.label }}</option>
            </select>
          </label>
        </div>

        <label class="flex cursor-pointer items-center gap-2 py-0">
          <input v-model="onOxygen" type="checkbox" class="toggle toggle-sm shrink-0" />
          <span class="text-sm">Sauerstoffgabe (O₂)</span>
        </label>
        <label class="flex cursor-pointer items-center gap-2 py-0">
          <input v-model="scale2" type="checkbox" class="toggle toggle-sm shrink-0" />
          <span class="text-sm">SpO₂-Skala 2 <span class="text-base-content/50">(ärztl. Ziel 88–92 %, z. B. COPD)</span></span>
        </label>

        <p class="rounded-lg bg-base-200 p-2 text-sm" role="status">
          <template v-if="result">
            <span class="badge badge-sm align-middle" :class="riskClass">NEWS2 {{ result.score }}</span>
            <span class="ml-2 text-base-content/70">Risiko {{ result.risk }}</span>
          </template>
          <span v-else class="italic text-base-content/50">Alle fünf Vitalwerte eingeben für Score + Risiko.</span>
        </p>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!result" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
