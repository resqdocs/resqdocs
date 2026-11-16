<script setup lang="ts">
/**
 * Eingabe-Sheet der Funktion „Sgarbossa (mod. nach Smith)": drei gleichwertige EKG-Kriterien, je
 * „erfüllt / nicht erfüllt / nicht beurteilbar". Positiv ab EINEM erfüllten Kriterium, kein Punktwert
 * (Rechenkern scores.sgarbossa, docs/medical-sources.md: Sgarbossa 1996, Smith 2012).
 *
 * Der Hinweis, dass negative Kriterien einen akuten Koronarverschluss nicht ausschließen, steht unten bei
 * der Auswertung, sobald das Ergebnis negativ ist - nur hier, nicht im Einsatz und nie im Protokolltext.
 * Kein Kriterium ist vorbelegt.
 */
import { computed, reactive } from 'vue'
import type { SgarbossaRow, SgarbossaBefund } from '@resqdocs/protocol-core/model'
import { sgarbossa, SGARBOSSA_NEGATIVE_HINT } from '@resqdocs/protocol-core/tools/scores.mjs'
import InfoTip from '@resqdocs/protocol-core-ui/components/InfoTip.vue'
import { INFO } from '@resqdocs/protocol-core-ui/terms'

const props = defineProps<{ initial?: SgarbossaRow }>()
const emit = defineEmits<{ apply: [row: SgarbossaRow]; close: [] }>()

type ItemId = 'concordantElevation' | 'concordantDepression' | 'discordantElevation'
interface Item { id: ItemId; nr: string; name: string; help: string }

const ITEMS: Item[] = [
  { id: 'concordantElevation', nr: '1', name: 'Konkordante ST-Hebung', help: 'ST-Hebung von mindestens 1 mm in einer Ableitung, in der der QRS-Komplex nach oben zeigt.' },
  { id: 'concordantDepression', nr: '2', name: 'Konkordante ST-Senkung in V1–V3', help: 'ST-Senkung von mindestens 1 mm in V1, V2 oder V3.' },
  { id: 'discordantElevation', nr: '3', name: 'Überhöhte diskordante ST-Hebung', help: 'ST-Hebung entgegen dem QRS-Komplex von mindestens 1 mm, die mindestens ein Viertel so hoch ist, wie die S-Zacke tief ist (ST/S ab 0,25).' },
]
const ALL_IDS: ItemId[] = ITEMS.map((i) => i.id)
const BEFUNDE: { v: SgarbossaBefund; glyph: string; label: string }[] = [
  { v: 'pos', glyph: '!', label: 'erfüllt' },
  { v: 'neg', glyph: '✓', label: 'nicht erfüllt' },
  { v: 'na', glyph: '–', label: 'nicht beurteilbar' },
]

const picked = reactive<Record<ItemId, SgarbossaBefund | null>>({
  concordantElevation: props.initial?.sgbConcordantElevation ?? null,
  concordantDepression: props.initial?.sgbConcordantDepression ?? null,
  discordantElevation: props.initial?.sgbDiscordantElevation ?? null,
})

function pick(id: ItemId, v: SgarbossaBefund): void {
  picked[id] = v
}
function allNeg(): void {
  for (const id of ALL_IDS) picked[id] = 'neg'
}

const openCount = computed(() => ALL_IDS.filter((id) => picked[id] == null).length)

// Vollständig = alle drei Kriterien gewählt. VOR dem Aufruf prüfen (scores.sgarbossa wirft sonst).
const row = computed<SgarbossaRow | null>(() => {
  if (openCount.value > 0) return null
  return {
    sgbConcordantElevation: picked.concordantElevation!,
    sgbConcordantDepression: picked.concordantDepression!,
    sgbDiscordantElevation: picked.discordantElevation!,
  }
})
const result = computed(() => {
  const r = row.value
  if (!r) return null
  return sgarbossa({
    concordantElevation: r.sgbConcordantElevation!,
    concordantDepression: r.sgbConcordantDepression!,
    discordantElevation: r.sgbDiscordantElevation!,
  })
})

// Farbe der GEWÄHLTEN Option (volle Klassen-Literale -> Tailwind purged sie nicht). „Nicht erfüllt"
// bleibt neutral und wird nie grün: negativ ist hier keine Entwarnung.
function optClass(id: ItemId, v: SgarbossaBefund): string {
  if (picked[id] !== v) return ''
  return v === 'pos' ? 'btn-error' : 'btn-neutral'
}
const resultClass = computed(() => (result.value?.positive ? 'badge-error' : 'badge-neutral'))
const resultLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.untestable ? 'Nicht beurteilbar' : r.positive ? 'Sgarbossa positiv' : 'Sgarbossa negativ'
})
const resultDetail = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.untestable) return 'Kein Kriterium beurteilbar.'
  return `${r.count} von 3 erfüllt${r.notAssessable.length ? `, ${r.notAssessable.length} nicht beurteilbar` : ''}`
})

function apply(): void {
  if (row.value) emit('apply', row.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="Sgarbossa erheben">
      <div class="modal-box flex max-h-[90vh] flex-col gap-3 overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="flex shrink-0 items-center gap-2">
          <h3 class="text-base font-semibold">Sgarbossa erheben</h3>
          <button type="button" class="btn btn-ghost btn-sm ml-auto min-h-11" @click="allNeg">Keins erfüllt</button>
        </div>

        <div class="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1">
          <p class="pb-2 text-xs text-base-content/60">
            Modifiziert nach Smith. Für EKGs mit Linksschenkelblock oder Schrittmacher-Rhythmus. Ein erfülltes Kriterium genügt.
          </p>

          <div v-for="it in ITEMS" :key="it.id" class="flex flex-col gap-2 border-t border-base-300 py-3">
            <div class="flex items-start gap-2">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-base-200 text-xs font-bold" aria-hidden="true">{{ it.nr }}</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold">{{ it.name }}</p>
                <p class="text-xs text-base-content/60">{{ it.help }}</p>
              </div>
            </div>
            <div class="join w-full" role="group" :aria-label="it.name">
              <button
                v-for="o in BEFUNDE"
                :key="o.v"
                type="button"
                class="btn btn-sm join-item h-auto min-h-11 flex-1 gap-1 px-1.5 py-1 leading-tight"
                :class="optClass(it.id, o.v)"
                :aria-pressed="picked[it.id] === o.v"
                :aria-label="`${it.name}: ${o.label}`"
                @click="pick(it.id, o.v)"
              >
                <span aria-hidden="true">{{ o.glyph }}</span>
                <span>{{ o.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Hinweis nur bei der Auswertung und nur, wenn das Ergebnis negativ ist (Maintainer). -->
        <p v-if="result?.negative" class="flex shrink-0 items-start gap-1.5 rounded-lg bg-warning/15 px-3 py-2 text-sm" role="note">
          <span aria-hidden="true">⚠</span><span>{{ SGARBOSSA_NEGATIVE_HINT }}</span>
        </p>
        <div class="flex shrink-0 items-center gap-2 rounded-lg bg-base-200 p-2 text-sm">
          <p class="min-w-0 flex-1" role="status">
            <template v-if="result">
              <span class="badge badge-sm align-middle" :class="resultClass">{{ resultLabel }}</span>
              <span class="ml-2 text-base-content/70">{{ resultDetail }}</span>
            </template>
            <span v-else class="italic text-base-content/50">Noch {{ openCount }} von 3 Kriterien offen.</span>
          </p>
          <InfoTip :info="INFO.sgarbossaColors" />
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
