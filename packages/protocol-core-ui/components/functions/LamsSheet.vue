<script setup lang="ts">
/**
 * Eingabe-Sheet der Score-Funktion „LAMS" (Los Angeles Motor Scale): drei motorische Befunde
 * (Gesicht 0–1, Armhalteversuch 0–2, Händedruck 0–2) je als Auswahl mit sichtbarem Punktwert.
 * Live-Vorschau: Summe 0–5 + Hinweis ab 4 (Rechenkern scores.lams, quellenbelegt in
 * docs/medical-sources.md). „Übernehmen" schreibt die EINE Score-Zeile zurück (ScoreFunction).
 *
 * Kein Befund ist vorbelegt: ein nicht angetippter Befund ist „nicht erhoben", kein unterstelltes
 * „unauffällig". Teleport an body + daisyUI .modal wie News2Sheet.
 */
import { computed, reactive } from 'vue'
import type { LAMSRow } from '@resqdocs/protocol-core/model'
import { lams } from '@resqdocs/protocol-core/tools/scores.mjs'
import InfoTip from '@resqdocs/protocol-core-ui/components/InfoTip.vue'
import { INFO } from '@resqdocs/protocol-core-ui/terms'

const props = defineProps<{ initial?: LAMSRow }>()
const emit = defineEmits<{ apply: [row: LAMSRow]; close: [] }>()

type ItemId = 'face' | 'arm' | 'grip'
type Punkte = 0 | 1 | 2
const ITEMS: { id: ItemId; name: string; help: string; opts: { v: Punkte; label: string }[] }[] = [
  { id: 'face', name: 'Gesicht', help: 'Lächeln oder Zähne zeigen lassen.', opts: [{ v: 0, label: 'unauffällig' }, { v: 1, label: 'Fazialisparese' }] },
  { id: 'arm', name: 'Armhalteversuch', help: 'Beide Arme vorhalten lassen.', opts: [{ v: 0, label: 'unauffällig' }, { v: 1, label: 'sinkt ab' }, { v: 2, label: 'fällt sofort' }] },
  { id: 'grip', name: 'Händedruck', help: 'Beide Hände drücken lassen.', opts: [{ v: 0, label: 'normal' }, { v: 1, label: 'schwach' }, { v: 2, label: 'kein Händedruck' }] },
]

const picked = reactive<Record<ItemId, Punkte | null>>({
  face: props.initial?.lamsFace ?? null,
  arm: props.initial?.lamsArm ?? null,
  grip: props.initial?.lamsGrip ?? null,
})

// Vollständig = alle drei Befunde gewählt. VOR dem lams-Aufruf prüfen (scores.lams wirft sonst).
const values = computed<Required<LAMSRow> | null>(() => {
  const { face, arm, grip } = picked
  if (face == null || face === 2 || arm == null || grip == null) return null
  return { lamsFace: face, lamsArm: arm, lamsGrip: grip }
})
const result = computed(() => (values.value ? lams({ face: values.value.lamsFace, arm: values.value.lamsArm, grip: values.value.lamsGrip }) : null))

// Farbe der GEWÄHLTEN Option nach Punktwert (volle Klassen-Literale -> Tailwind purged sie nicht).
// Die Bedeutung trägt der Text + Punktwert, die Farbe unterstützt nur.
function optClass(id: ItemId, v: Punkte): string {
  if (picked[id] !== v) return ''
  return v === 0 ? 'btn-success' : v === 1 ? 'btn-warning' : 'btn-error'
}
// Badge-Farbe wie die Einsatz-Ampel: 0 grün, 1–3 gelb, ab 4 (LVO-Hinweis) rot.
const scoreClass = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.lvoSuspected ? 'badge-error' : r.score >= 1 ? 'badge-warning' : 'badge-success'
})

function apply(): void {
  if (values.value) emit('apply', values.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="LAMS berechnen">
      <div class="modal-box flex max-h-[90vh] flex-col space-y-3 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">LAMS berechnen</h3>

        <div class="flex flex-col">
          <div v-for="it in ITEMS" :key="it.id" class="flex flex-col space-y-2 border-t border-base-300 py-3 first:border-t-0 first:pt-0">
            <div>
              <p class="text-sm font-semibold">{{ it.name }}</p>
              <p class="text-xs text-base-content/75">{{ it.help }}</p>
            </div>
            <div class="join w-full" role="group" :aria-label="it.name">
              <button
                v-for="o in it.opts"
                :key="o.v"
                type="button"
                class="btn btn-sm join-item h-auto min-h-11 flex-1 gap-1.5 px-2 py-1 leading-tight"
                :class="optClass(it.id, o.v)"
                :aria-pressed="picked[it.id] === o.v"
                :aria-label="`${it.name}: ${o.label}, ${o.v} ${o.v === 1 ? 'Punkt' : 'Punkte'}`"
                @click="picked[it.id] = o.v"
              >
                <span>{{ o.label }}</span>
                <span class="badge badge-xs shrink-0 tabular-nums" aria-hidden="true">{{ o.v }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 rounded-lg bg-base-200 p-2 text-sm">
          <p class="min-w-0 flex-1" role="status">
            <template v-if="result">
              <span class="badge badge-sm align-middle" :class="scoreClass">LAMS {{ result.score }}/5</span>
              <span class="ml-2 text-base-content/75">{{ result.lvoSuspected ? 'Hinweis auf proximalen Verschluss (LVO)' : 'unter der Schwelle von 4' }}</span>
            </template>
            <span v-else class="italic text-base-content/75">Alle drei Befunde wählen für den Score.</span>
          </p>
          <InfoTip :info="INFO.lamsColors" />
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!result" @click="apply">Übernehmen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
