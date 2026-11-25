<script setup lang="ts">
/**
 * Eingabe-Sheet der Funktion „ZOPS" (Orientierung): vier Punkte (Zeit, Ort, Person, Situation), je
 * „orientiert / nicht orientiert / nicht prüfbar". KEIN Punktwert und keine Schwelle; der Text nennt
 * nur die Abweichung (Rechenkern scores.zops, docs/medical-sources.md).
 *
 * Kein Punkt ist vorbelegt: ein nicht angetippter Punkt ist „nicht erhoben", kein unterstelltes
 * „orientiert" - dafür gibt es „Alle orientiert" als bewussten Tipp.
 */
import { computed, reactive } from 'vue'
import type { ZOPSRow, ZopsBefund } from '@resqdocs/protocol-core/model'
import { zops } from '@resqdocs/protocol-core/tools/scores.mjs'
import InfoTip from '@resqdocs/protocol-core-ui/components/InfoTip.vue'
import { INFO } from '@resqdocs/protocol-core-ui/terms'
import { unchangedSince } from '@resqdocs/protocol-core-ui/sheetGuard'

const props = defineProps<{ initial?: ZOPSRow }>()
const emit = defineEmits<{ apply: [row: ZOPSRow]; close: [] }>()

type ItemId = 'time' | 'place' | 'person' | 'situation'
interface Item { id: ItemId; letter: string; name: string; help: string }

const ITEMS: Item[] = [
  { id: 'time', letter: 'Z', name: 'Zeit', help: 'Nach Wochentag, Monat oder Jahr fragen. Passt die Antwort ungefähr?' },
  { id: 'place', letter: 'O', name: 'Ort', help: 'Fragen, wo ihr gerade seid: zu Hause, in welcher Stadt, im Krankenhaus?' },
  { id: 'person', letter: 'P', name: 'Person', help: 'Nach dem eigenen Namen und dem Alter oder Geburtsdatum fragen.' },
  { id: 'situation', letter: 'S', name: 'Situation', help: 'Fragen, was passiert ist und warum der Rettungsdienst da ist.' },
]
const ALL_IDS: ItemId[] = ITEMS.map((i) => i.id)
const BEFUNDE: { v: ZopsBefund; glyph: string; label: string }[] = [
  { v: 'ok', glyph: '✓', label: 'orientiert' },
  { v: 'no', glyph: '!', label: 'nicht orientiert' },
  { v: 'na', glyph: '–', label: 'nicht prüfbar' },
]

const picked = reactive<Record<ItemId, ZopsBefund | null>>({
  time: props.initial?.zopsTime ?? null,
  place: props.initial?.zopsPlace ?? null,
  person: props.initial?.zopsPerson ?? null,
  situation: props.initial?.zopsSituation ?? null,
})

// Tipp neben das Fenster schließt nur, solange nichts geändert wurde.
const unchanged = unchangedSince(() => picked)
function pick(id: ItemId, v: ZopsBefund): void {
  picked[id] = v
}
function allOk(): void {
  for (const id of ALL_IDS) picked[id] = 'ok'
}

const openCount = computed(() => ALL_IDS.filter((id) => picked[id] == null).length)

// Vollständig = alle vier Punkte gewählt. VOR dem zops-Aufruf prüfen (scores.zops wirft sonst).
const row = computed<ZOPSRow | null>(() => {
  if (openCount.value > 0) return null
  return { zopsTime: picked.time!, zopsPlace: picked.place!, zopsPerson: picked.person!, zopsSituation: picked.situation! }
})
const result = computed(() => {
  const r = row.value
  if (!r) return null
  return zops({ time: r.zopsTime!, place: r.zopsPlace!, person: r.zopsPerson!, situation: r.zopsSituation! })
})

// Farbe der GEWÄHLTEN Option (volle Klassen-Literale -> Tailwind purged sie nicht). Die Bedeutung
// trägt Zeichen + Text, die Farbe unterstützt nur.
function optClass(id: ItemId, v: ZopsBefund): string {
  if (picked[id] !== v) return ''
  return v === 'ok' ? 'btn-success' : v === 'no' ? 'btn-warning' : 'btn-neutral'
}
// Badge wie die Einsatz-Ampel: nicht orientiert gelb, zu allen vier orientiert grün, sonst neutral
// (nichts auffällig, aber nicht alles prüfbar). Kein Rot.
const resultClass = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.notOriented.length) return 'badge-warning'
  return r.oriented ? 'badge-success' : 'badge-neutral'
})
const resultLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.untestable) return 'ZOPS nicht prüfbar'
  if (r.notOriented.length) return 'Nicht voll orientiert'
  return r.oriented ? 'ZOPS orientiert' : 'Orientiert, soweit prüfbar'
})
const resultDetail = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.untestable) return 'Kein Punkt prüfbar.'
  return `${r.orientedTo.length} von 4 orientiert${r.notTestable.length ? `, ${r.notTestable.length} nicht prüfbar` : ''}`
})

function apply(): void {
  if (row.value) emit('apply', row.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="ZOPS erheben">
      <div class="modal-box flex max-h-[90vh] flex-col space-y-3 overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="flex shrink-0 items-center gap-2">
          <h3 class="text-base font-semibold">ZOPS erheben</h3>
          <button type="button" class="btn btn-ghost btn-sm ml-auto min-h-11" @click="allOk">Alle orientiert</button>
        </div>

        <div class="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1">
          <div v-for="it in ITEMS" :key="it.id" class="flex flex-col space-y-2 border-t border-base-300 py-3">
            <div class="flex items-start gap-2">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-base-200 text-xs font-bold" aria-hidden="true">{{ it.letter }}</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold">{{ it.name }}</p>
                <p class="text-xs text-base-content/75">{{ it.help }}</p>
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

        <div class="flex shrink-0 items-center gap-2 rounded-lg bg-base-200 p-2 text-sm">
          <p class="min-w-0 flex-1" role="status">
            <template v-if="result">
              <span class="badge badge-sm align-middle" :class="resultClass">{{ resultLabel }}</span>
              <span class="ml-2 text-base-content/75">{{ resultDetail }}</span>
            </template>
            <span v-else class="italic text-base-content/75">Noch {{ openCount }} von 4 Punkten offen.</span>
          </p>
          <InfoTip :info="INFO.zopsColors" />
        </div>

        <div class="modal-action mt-0 shrink-0">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!result" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="unchanged() && emit('close')"></button>
    </div>
  </Teleport>
</template>
