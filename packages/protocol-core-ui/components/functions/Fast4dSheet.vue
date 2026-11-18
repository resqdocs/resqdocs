<script setup lang="ts">
/**
 * Eingabe-Sheet der Funktion „FAST4D" (Schlaganfall-Screening): sieben Befunde (Face, Arm, Speech +
 * Doppelbilder, Gesichtsfelddefekt, Dreh-/Schwankschwindel, Dysmetrie/Ataxie), je „unauffällig /
 * auffällig / nicht prüfbar". Für Face und Arm optional die Seite. Die Zeit (Symptombeginn / zuletzt
 * gesund gesehen / unklar) wird erfasst, zählt aber nicht zum Ergebnis. KEIN Punktescore: positiv ab
 * einem auffälligen Befund, bewusst ohne Schwelle (Rechenkern scores.fast4d, docs/medical-sources.md).
 *
 * Kein Befund ist vorbelegt: ein nicht angetippter Befund ist „nicht erhoben", kein unterstelltes
 * „unauffällig" - dafür gibt es „Alle unauffällig" als bewussten Tipp. Kopf, Status und Aktionen
 * stehen fest, nur die Befundliste scrollt (acht Blöcke passen auf kein Telefon).
 */
import { computed, reactive, ref } from 'vue'
import type { FAST4DRow, Fast4dBefund } from '@resqdocs/protocol-core/model'
import { fast4d } from '@resqdocs/protocol-core/tools/scores.mjs'
import { FAST4D_UHRZEIT, FAST4D_ZEICHEN, fast4dInput, type Fast4dId } from '@resqdocs/protocol-core/tools/fast4dDefs.mjs'
import InfoTip from '@resqdocs/protocol-core-ui/components/InfoTip.vue'
import { INFO } from '@resqdocs/protocol-core-ui/terms'

const props = defineProps<{ initial?: FAST4DRow }>()
const emit = defineEmits<{ apply: [row: FAST4DRow]; close: [] }>()

// Zeichen, Schlüssel, Uhrzeit-Prüfung und Zuordnung zum Rechenkern: eine Quelle (tools/fast4dDefs.mjs).
// Hier steht nur, was das Blatt zusätzlich braucht: Buchstabe, Name und Hilfetext je Zeichen.
type ItemId = Fast4dId
type Seite = 're' | 'li'
type ZeitArt = 'onset' | 'lsw' | 'unknown'
interface Item { id: ItemId; letter: string; name: string; help: string; side?: true }

const FAST_ITEMS: Item[] = [
  { id: 'face', letter: 'F', name: 'Face – Gesicht', help: 'Lächeln oder Zähne zeigen lassen. Hängt ein Mundwinkel?', side: true },
  { id: 'arm', letter: 'A', name: 'Arm', help: 'Beide Arme vorhalten, Handflächen nach oben. Sinkt ein Arm ab oder dreht er sich ein?', side: true },
  { id: 'speech', letter: 'S', name: 'Speech – Sprache', help: 'Einfachen Satz nachsprechen lassen. Verwaschen, Wortfindungsstörung oder keine Sprache?' },
]
const D_ITEMS: Item[] = [
  { id: 'diplopia', letter: 'D', name: 'Doppelbilder', help: 'Finger waagerecht und senkrecht verfolgen lassen. Werden Doppelbilder angegeben?' },
  { id: 'field', letter: 'D', name: 'Gesichtsfelddefekt', help: 'Fehlt ein Teil des Gesichtsfelds oder sieht ein Auge nicht?' },
  { id: 'vertigo', letter: 'D', name: 'Dreh-/Schwankschwindel', help: 'Plötzlich aufgetretener Schwindel? Fallneigung zu einer Seite?' },
  { id: 'ataxia', letter: 'D', name: 'Dysmetrie/Ataxie', help: 'Finger-Nase-Versuch mit geschlossenen Augen. Unsicher oder daneben?' },
]
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'FAST', items: FAST_ITEMS },
  { label: '4D', items: D_ITEMS },
]
// Vollständigkeit zählt gegen die eine Quelle: fehlte hier ein Zeichen, bliebe das Blatt unvollständig statt still zu kürzen.
const ALL_IDS: ItemId[] = FAST4D_ZEICHEN.map((z) => z.id)
const BEFUNDE: { v: Fast4dBefund; glyph: string; label: string }[] = [
  { v: 'neg', glyph: '✓', label: 'unauffällig' },
  { v: 'pos', glyph: '!', label: 'auffällig' },
  { v: 'na', glyph: '–', label: 'nicht prüfbar' },
]
const SEITEN: { v: Seite; label: string }[] = [
  { v: 're', label: 'rechts' },
  { v: 'li', label: 'links' },
]
const ZEITEN: { v: ZeitArt; label: string }[] = [
  { v: 'onset', label: 'Symptombeginn' },
  { v: 'lsw', label: 'Zuletzt gesund gesehen' },
  { v: 'unknown', label: 'unklar' },
]

const picked = reactive(
  Object.fromEntries(FAST4D_ZEICHEN.map((z) => [z.id, props.initial?.[z.rowKey] ?? null])) as Record<ItemId, Fast4dBefund | null>,
)
const side = reactive<Record<'face' | 'arm', Seite | null>>({
  face: props.initial?.fastFaceSide ?? null,
  arm: props.initial?.fastArmSide ?? null,
})
const timeMode = ref<ZeitArt | null>(props.initial?.fastTimeMode ?? null)
const time = ref(props.initial?.fastTime ?? '')

function pick(id: ItemId, v: Fast4dBefund): void {
  picked[id] = v
  // Seite gehört nur zu einem auffälligen Befund.
  if (v !== 'pos' && (id === 'face' || id === 'arm')) side[id] = null
}
function toggleSide(id: ItemId, v: Seite): void {
  if (id !== 'face' && id !== 'arm') return
  side[id] = side[id] === v ? null : v
}
function sideOf(id: ItemId): Seite | null {
  return id === 'face' || id === 'arm' ? side[id] : null
}
// Die Zeitangabe ist freiwillig: nochmal antippen nimmt sie zurück.
function toggleTimeMode(v: ZeitArt): void {
  timeMode.value = timeMode.value === v ? null : v
}
function allNeg(): void {
  for (const id of ALL_IDS) picked[id] = 'neg'
  side.face = null
  side.arm = null
}

const needsTime = computed(() => timeMode.value === 'onset' || timeMode.value === 'lsw')
const timeValid = computed(() => FAST4D_UHRZEIT.test(time.value))
const openCount = computed(() => ALL_IDS.filter((id) => picked[id] == null).length)

// Vollständig = alle sieben Befunde gewählt. VOR dem fast4d-Aufruf prüfen (scores.fast4d wirft sonst).
const row = computed<FAST4DRow | null>(() => {
  if (openCount.value > 0) return null
  const r: FAST4DRow = {}
  for (const z of FAST4D_ZEICHEN) {
    r[z.rowKey] = picked[z.id]!
    // Seite gehört nur zu einem auffälligen Befund (Face, Arm).
    const s = z.id === 'face' || z.id === 'arm' ? side[z.id] : null
    if (z.sideKey && picked[z.id] === 'pos' && s) r[z.sideKey] = s
  }
  if (timeMode.value) r.fastTimeMode = timeMode.value
  if (needsTime.value && timeValid.value) r.fastTime = time.value
  return r
})
const result = computed(() => {
  const r = row.value
  if (!r) return null
  return fast4d(fast4dInput(r as Parameters<typeof fast4dInput>[0]))
})

// Farbe der GEWÄHLTEN Option (volle Klassen-Literale -> Tailwind purged sie nicht). Die Bedeutung
// trägt Zeichen + Text, die Farbe unterstützt nur.
function optClass(id: ItemId, v: Fast4dBefund): string {
  if (picked[id] !== v) return ''
  return v === 'neg' ? 'btn-success' : v === 'pos' ? 'btn-warning' : 'btn-neutral'
}
// Badge wie die Einsatz-Ampel: auffällig gelb, alle sieben unauffällig grün, sonst neutral
// (nichts auffällig, aber nicht alles prüfbar). Kein Rot.
const resultClass = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.positive) return 'badge-warning'
  return r.notTestable.length === 0 ? 'badge-success' : 'badge-neutral'
})
const resultLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.untestable ? 'FAST4D nicht prüfbar' : r.positive ? 'FAST4D positiv' : 'FAST4D negativ'
})
const resultDetail = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.untestable) return 'Kein Befund prüfbar.'
  return `${r.count} von 7 auffällig${r.notTestable.length ? `, ${r.notTestable.length} nicht prüfbar` : ''}`
})

function apply(): void {
  if (row.value) emit('apply', row.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="FAST4D erheben">
      <div class="modal-box flex max-h-[90vh] flex-col space-y-3 overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="flex shrink-0 items-center gap-2">
          <h3 class="text-base font-semibold">FAST4D erheben</h3>
          <button type="button" class="btn btn-ghost btn-sm ml-auto min-h-11" @click="allNeg">Alle unauffällig</button>
        </div>

        <div class="-mx-1 flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto overscroll-contain px-1">
          <section v-for="g in GROUPS" :key="g.label" class="flex flex-col">
            <p class="pb-1 text-xs font-semibold uppercase tracking-wide text-base-content/75">{{ g.label }}</p>

            <div v-for="it in g.items" :key="it.id" class="flex flex-col space-y-2 border-t border-base-300 py-3">
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
              <div v-if="it.side && picked[it.id] === 'pos'" class="flex items-center gap-2" role="group" :aria-label="`${it.name}: Seite`">
                <span class="text-xs text-base-content/75">Seite</span>
                <button
                  v-for="s in SEITEN"
                  :key="s.v"
                  type="button"
                  class="btn btn-sm min-h-11 rounded-full px-4"
                  :class="sideOf(it.id) === s.v ? 'btn-neutral' : 'btn-outline'"
                  :aria-pressed="sideOf(it.id) === s.v"
                  @click="toggleSide(it.id, s.v)"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>

            <!-- T: Zeit gehört zur FAST-Gruppe, wird erfasst, zählt aber nicht zum Ergebnis. -->
            <div v-if="g.label === 'FAST'" class="flex flex-col space-y-2 border-t border-base-300 py-3">
              <div class="flex items-start gap-2">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-base-200 text-xs font-bold" aria-hidden="true">T</span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold">Time – Zeit</p>
                  <p class="text-xs text-base-content/75">Wird erfasst, zählt nicht zum Ergebnis.</p>
                </div>
              </div>
              <div class="join w-full" role="group" aria-label="Zeitangabe">
                <button
                  v-for="z in ZEITEN"
                  :key="z.v"
                  type="button"
                  class="btn btn-sm join-item h-auto min-h-11 flex-1 px-1.5 py-1 leading-tight"
                  :class="timeMode === z.v ? 'btn-neutral' : ''"
                  :aria-pressed="timeMode === z.v"
                  @click="toggleTimeMode(z.v)"
                >
                  {{ z.label }}
                </button>
              </div>
              <label v-if="needsTime" class="flex items-center gap-2">
                <span class="text-xs text-base-content/75">Uhrzeit</span>
                <input v-model="time" type="time" class="input input-sm min-h-11 w-32" aria-label="Uhrzeit" />
                <span v-if="!timeValid" class="text-xs text-base-content/75">Ohne Uhrzeit erscheint die Zeit nicht im Text.</span>
              </label>
            </div>
          </section>
        </div>

        <div class="flex shrink-0 items-center gap-2 rounded-lg bg-base-200 p-2 text-sm">
          <p class="min-w-0 flex-1" role="status">
            <template v-if="result">
              <span class="badge badge-sm align-middle" :class="resultClass">{{ resultLabel }}</span>
              <span class="ml-2 text-base-content/75">{{ resultDetail }}</span>
            </template>
            <span v-else class="italic text-base-content/75">Noch {{ openCount }} von 7 Befunden offen.</span>
          </p>
          <InfoTip :info="INFO.fast4dColors" />
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
