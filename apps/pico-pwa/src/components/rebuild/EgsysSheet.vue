<script setup lang="ts">
/**
 * Eingabe-Sheet der Funktion „EGSYS" (Synkope: Hinweise auf eine kardiale Ursache): sechs Punkte aus
 * der Anamnese, je Ja/Nein, mit Punktwerten von +4 bis -1. Ab 3 Punkten nennt die Studie eine kardiale
 * Synkope wahrscheinlich (Rechenkern scores.egsys, docs/medical-sources.md: Del Rosso et al. 2008).
 *
 * Der Hinweis, dass weniger als 3 Punkte nichts ausschließen, steht unten bei der Auswertung, sobald
 * das Ergebnis unter 3 Punkten liegt - nur hier, nicht im Einsatz und nie im Protokolltext. Kein Punkt
 * ist vorbelegt - dafür gibt es „Alle nein" als bewussten Tipp.
 */
import { computed, reactive } from 'vue'
import type { EGSYSRow, EgsysAntwort } from '@resqdocs/protocol-core/model'
import { egsys, EGSYS_LOW_HINT } from '@resqdocs/protocol-core/tools/scores.mjs'
import InfoTip from '@resqdocs/protocol-core-ui/components/InfoTip.vue'
import { INFO } from '@resqdocs/protocol-core-ui/terms'

const props = defineProps<{ initial?: EGSYSRow }>()
const emit = defineEmits<{ apply: [row: EGSYSRow]; close: [] }>()

type ItemId = 'palpitations' | 'heartDisease' | 'effort' | 'supine' | 'triggers' | 'prodromes'
interface Item { id: ItemId; points: string; name: string; help: string }

const ITEMS: Item[] = [
  { id: 'palpitations', points: '+4', name: 'Palpitationen vor der Synkope', help: 'Herzklopfen, Herzrasen oder Herzstolpern unmittelbar vor dem Bewusstseinsverlust.' },
  { id: 'heartDisease', points: '+3', name: 'Herzerkrankung oder auffälliges EKG', help: 'Eine bekannte Herzerkrankung oder ein EKG, das nicht normal ist.' },
  { id: 'effort', points: '+3', name: 'Synkope bei Belastung', help: 'Während körperlicher Anstrengung aufgetreten.' },
  { id: 'supine', points: '+2', name: 'Synkope im Liegen', help: 'Im Liegen aufgetreten.' },
  { id: 'triggers', points: '−1', name: 'Auslöser oder begünstigende Umstände', help: 'Zum Beispiel warmer oder voller Raum, langes Stehen, Angst, Schmerz oder starke Gefühle.' },
  { id: 'prodromes', points: '−1', name: 'Vegetative Prodromi', help: 'Übelkeit oder Erbrechen vor der Synkope.' },
]
const ALL_IDS: ItemId[] = ITEMS.map((i) => i.id)
const ANTWORTEN: { v: EgsysAntwort; label: string }[] = [
  { v: 'yes', label: 'Ja' },
  { v: 'no', label: 'Nein' },
]

const picked = reactive<Record<ItemId, EgsysAntwort | null>>({
  palpitations: props.initial?.egsysPalpitations ?? null,
  heartDisease: props.initial?.egsysHeartDisease ?? null,
  effort: props.initial?.egsysEffort ?? null,
  supine: props.initial?.egsysSupine ?? null,
  triggers: props.initial?.egsysTriggers ?? null,
  prodromes: props.initial?.egsysProdromes ?? null,
})

function pick(id: ItemId, v: EgsysAntwort): void {
  picked[id] = v
}
function allNo(): void {
  for (const id of ALL_IDS) picked[id] = 'no'
}

const openCount = computed(() => ALL_IDS.filter((id) => picked[id] == null).length)

// Vollständig = alle sechs Punkte beantwortet. VOR dem egsys-Aufruf prüfen (scores.egsys wirft sonst).
const row = computed<EGSYSRow | null>(() => {
  if (openCount.value > 0) return null
  return {
    egsysPalpitations: picked.palpitations!,
    egsysHeartDisease: picked.heartDisease!,
    egsysEffort: picked.effort!,
    egsysSupine: picked.supine!,
    egsysTriggers: picked.triggers!,
    egsysProdromes: picked.prodromes!,
  }
})
const result = computed(() => {
  const r = row.value
  if (!r) return null
  return egsys({
    palpitations: r.egsysPalpitations!, heartDisease: r.egsysHeartDisease!, effort: r.egsysEffort!,
    supine: r.egsysSupine!, triggers: r.egsysTriggers!, prodromes: r.egsysProdromes!,
  })
})

// Gewählte Antwort neutral hervorheben: Ja/Nein ist hier weder gut noch schlecht, erst die Summe zählt.
function optClass(id: ItemId, v: EgsysAntwort): string {
  return picked[id] === v ? 'btn-neutral' : ''
}
const resultClass = computed(() => (result.value?.cardiacSuspected ? 'badge-error' : 'badge-neutral'))
const resultLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  return `EGSYS ${r.score} ${Math.abs(r.score) === 1 ? 'Punkt' : 'Punkte'}`
})
const resultDetail = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.cardiacSuspected ? 'Ab 3 Punkten: kardiale Ursache wahrscheinlich.' : 'Unter 3 Punkten.'
})

function apply(): void {
  if (row.value) emit('apply', row.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="EGSYS erheben">
      <div class="modal-box flex max-h-[90vh] flex-col gap-3 overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="flex shrink-0 items-center gap-2">
          <h3 class="text-base font-semibold">EGSYS erheben</h3>
          <button type="button" class="btn btn-ghost btn-sm ml-auto min-h-11" @click="allNo">Alle nein</button>
        </div>

        <div class="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1">
          <p class="pb-2 text-xs text-base-content/60">
            Nach einer Synkope: sechs Fragen aus der Anamnese. Ab 3 Punkten ist eine kardiale Ursache wahrscheinlich.
          </p>

          <div v-for="it in ITEMS" :key="it.id" class="flex flex-col gap-2 border-t border-base-300 py-3">
            <div class="flex items-start gap-2">
              <span class="flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md bg-base-200 px-1 text-xs font-bold" :aria-label="`${it.points} Punkte`">{{ it.points }}</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold">{{ it.name }}</p>
                <p class="text-xs text-base-content/60">{{ it.help }}</p>
              </div>
            </div>
            <div class="join w-full" role="group" :aria-label="it.name">
              <button
                v-for="o in ANTWORTEN"
                :key="o.v"
                type="button"
                class="btn btn-sm join-item min-h-11 flex-1"
                :class="optClass(it.id, o.v)"
                :aria-pressed="picked[it.id] === o.v"
                :aria-label="`${it.name}: ${o.label}`"
                @click="pick(it.id, o.v)"
              >
                {{ o.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Hinweis nur bei der Auswertung und nur, wenn das Ergebnis negativ ist (Maintainer). -->
        <p v-if="result && !result.cardiacSuspected" class="flex shrink-0 items-start gap-1.5 rounded-lg bg-warning/15 px-3 py-2 text-sm" role="note">
          <span aria-hidden="true">⚠</span><span>{{ EGSYS_LOW_HINT }}</span>
        </p>
        <div class="flex shrink-0 items-center gap-2 rounded-lg bg-base-200 p-2 text-sm">
          <p class="min-w-0 flex-1" role="status">
            <template v-if="result">
              <span class="badge badge-sm align-middle" :class="resultClass">{{ resultLabel }}</span>
              <span class="ml-2 text-base-content/70">{{ resultDetail }}</span>
            </template>
            <span v-else class="italic text-base-content/50">Noch {{ openCount }} von 6 Punkten offen.</span>
          </p>
          <InfoTip :info="INFO.egsysColors" />
        </div>

        <div class="modal-action mt-0 shrink-0">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!result" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
