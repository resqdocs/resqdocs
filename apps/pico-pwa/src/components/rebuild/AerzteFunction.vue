<script setup lang="ts">
/**
 * Einsatz-Komponente der Funktion „Ärzte". Spiegelt das Medikamentenplan-Muster (kompakte Summary-Zeile +
 * Edit-Karte, GENAU EINE offen) mit Arzt-Feldern (Name, Rolle, Ort, Telefon, Arztnummer). Eigener Zustand
 * im selben Werte-Store (getRows/setRows) -> Entwurf-Persistenz + DSGVO-Reset gratis.
 *
 * Scan: derselbe BMP-Parser wie der Medikamentenplan (ein Parse liefert Arzt UND Medikamente). Hier ist der
 * AUSSTELLENDE ARZT primaer; existiert auch ein Medikamentenplan im Protokoll, koennen die Medikamente
 * optional mit angelegt werden (Cross-Uebernahme, AerzteReviewSheet).
 */
import { computed, ref } from 'vue'
import type { FunctionNode, ArztRow, MedikamenteRow } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@/rebuild/useCaseValues'
import { useProtocolTree } from '@/rebuild/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { formatArzt } from '@resqdocs/protocol-core/functions/registry'
import AerzteReviewSheet from './AerzteReviewSheet.vue'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()
// Wurzel der aktiven Einsatz-Vorlage (Singleton) -> Cross-Funktion-Suche, ohne root durchzureichen.
const { einsatzRoot } = useProtocolTree()

const rows = computed<ArztRow[]>(() => caseValues.getRows(props.node.id) as ArztRow[])
const filledCount = computed(() => rows.value.filter((r) => r.name.trim()).length)
const label = computed(() => (props.node.title && props.node.title.trim()) || 'Ärzte')

const editingIndex = ref<number | null>(null)
let focusNext = false
function setEditName(el: unknown): void {
  if (el && focusNext) {
    focusNext = false
    ;(el as HTMLInputElement).focus()
  }
}

const summary = (r: ArztRow): string => formatArzt(r) || 'Leerer Arzt'

function setRow(i: number, patch: Partial<ArztRow>): void {
  caseValues.setRows(
    props.node.id,
    rows.value.map((r, j) => (j === i ? { ...r, ...patch } : r)),
  )
}
function removeRow(i: number): void {
  caseValues.setRows(
    props.node.id,
    rows.value.filter((_, j) => j !== i),
  )
  if (editingIndex.value === i) editingIndex.value = null
  else if (editingIndex.value !== null && i < editingIndex.value) editingIndex.value--
}
function openEdit(i: number): void {
  editingIndex.value = i
}
function closeEdit(): void {
  editingIndex.value = null
}
function onFocusOut(e: FocusEvent): void {
  const card = e.currentTarget as HTMLElement
  if (!card.contains(e.relatedTarget as Node | null)) closeEdit()
}
function addRow(): void {
  const cleaned = rows.value.filter((r) => r.name.trim())
  focusNext = true
  caseValues.setRows(props.node.id, [...cleaned, { name: '' }])
  editingIndex.value = cleaned.length
}

// --- BMP-Scan: zieht den ausstellenden Arzt (+ optional die Medikamente in einen vorhandenen Plan) ---
const bmpOpen = ref(false)
function onScanApply(doctor: ArztRow, meds?: MedikamenteRow[]): void {
  const cleaned = rows.value.filter((r) => r.name.trim())
  caseValues.setRows(props.node.id, [...cleaned, doctor])
  // Cross-Uebernahme: gewaehlte Medikamente an die erste Medikamentenplan-Funktion anhaengen (falls vorhanden).
  if (meds && meds.length) {
    const medNodes = collectFunctionNodes(einsatzRoot.value, 'medikamentenplan')
    if (medNodes.length) {
      const id = medNodes[0].id
      // id ist eine medikamentenplan-Funktion -> ihre rows sind MedikamenteRow (nur MedplanFunction schreibt sie).
      const existing = caseValues.getRows(id) as MedikamenteRow[]
      caseValues.setRows(id, [...existing.filter((m) => m.name.trim()), ...meds])
    }
  }
  editingIndex.value = null
  bmpOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold">{{ label }}</span>
      <span v-if="filledCount" class="badge badge-neutral badge-sm">{{ filledCount }}</span>
    </div>

    <template v-for="(r, i) in rows" :key="i">
      <!-- READ: kompakte Summary-Zeile (Antippen -> bearbeiten) -->
      <button
        v-if="editingIndex !== i"
        type="button"
        class="flex min-h-11 w-full items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
        :aria-expanded="false"
        :aria-label="`Arzt ${i + 1}: ${summary(r)} — bearbeiten`"
        @click="openEdit(i)"
      >
        <span class="min-w-0 flex-1 truncate text-sm">{{ summary(r) }}</span>
        <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
      </button>

      <!-- EDIT: Karte (Ring + Inputs + Fertig) -->
      <div
        v-else
        class="flex flex-col gap-2 rounded-xl border border-primary/40 bg-base-200 p-3 ring-1 ring-primary/20"
        @focusout="onFocusOut"
        @keydown.esc="closeEdit"
      >
        <div class="flex items-center gap-2">
          <input
            :ref="setEditName"
            class="input input-sm flex-1 font-medium"
            :value="r.name"
            placeholder="Arzt / Praxis"
            :aria-label="`Arzt ${i + 1} Name`"
            @input="setRow(i, { name: ($event.target as HTMLInputElement).value })"
          />
          <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 text-error" :aria-label="`${r.name || 'Arzt ' + (i + 1)} entfernen`" @click="removeRow(i)">✕</button>
        </div>
        <div class="flex gap-2">
          <select class="select select-sm w-32 shrink-0" :value="r.rolle ?? ''" aria-label="Rolle" @change="setRow(i, { rolle: (($event.target as HTMLSelectElement).value || undefined) as ArztRow['rolle'] })">
            <option value="">Rolle —</option>
            <option value="Hausarzt">Hausarzt</option>
            <option value="Facharzt">Facharzt</option>
          </select>
          <input class="input input-sm min-w-0 flex-1" :value="r.ort ?? ''" placeholder="Ort" aria-label="Ort" @input="setRow(i, { ort: ($event.target as HTMLInputElement).value })" />
        </div>
        <div class="flex gap-2">
          <input class="input input-sm min-w-0 flex-1" :value="r.telefon ?? ''" placeholder="Telefon" inputmode="tel" aria-label="Telefon" @input="setRow(i, { telefon: ($event.target as HTMLInputElement).value })" />
          <input class="input input-sm min-w-0 flex-1" :value="r.arztnummer ?? ''" placeholder="Arztnummer" aria-label="Arztnummer" @input="setRow(i, { arztnummer: ($event.target as HTMLInputElement).value })" />
        </div>
        <button type="button" class="btn btn-primary btn-sm min-h-11 self-end" @click="closeEdit">Fertig</button>
      </div>
    </template>

    <p v-if="!rows.length" class="text-xs italic text-base-content/50">Noch keine Ärzte erfasst.</p>

    <!-- Aktionsleiste: manuell anlegen + Plan scannen (zieht den ausstellenden Arzt aus dem BMP). -->
    <div class="flex gap-2">
      <button type="button" class="btn btn-primary btn-sm min-h-11 grow gap-1" @click="addRow"><span aria-hidden="true">＋</span> Arzt</button>
      <button type="button" class="btn btn-outline btn-sm min-h-11 grow gap-2" @click="bmpOpen = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5 shrink-0" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
        Arzt aus Plan scannen
      </button>
    </div>

    <!-- BMP-Scan + Review (teleportet sich selbst) -->
    <AerzteReviewSheet v-if="bmpOpen" @apply="onScanApply" @close="bmpOpen = false" />
  </div>
</template>
