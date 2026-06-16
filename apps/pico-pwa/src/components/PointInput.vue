<script setup lang="ts">
import { computed, ref } from 'vue'
import BefundItem, { type BefundValue } from '@/components/BefundItem.vue'
import TriStateToggle, { type TriState } from '@/components/TriStateToggle.vue'
import LongTextModal from '@/components/LongTextModal.vue'
import MedplanScanSection from '@/components/MedplanScanSection.vue'
import PackageScanOverlay from '@/components/PackageScanOverlay.vue'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { extractPznFromPackageCode, packageScanName, type PackageBarcodeFormat } from '@/medications/packageScan'
import type { MedikamenteRow, ProtocolPoint } from '@shared/renderer/render.mjs'
import type { PointValue } from '@/composables/caseState'

/**
 * Eingabe für einen einzelnen Protokoll-Punkt (field/finding/findingGroup/list/text).
 *
 * Liest den aktuellen Wert aus dem flüchtigen `values`-Record und meldet Änderungen
 * über `set`. Sichtbarkeit/Platzhalter werden hier NICHT aufgelöst — das macht der
 * Renderer in der Vorschau (keine Duplizierung der Renderer-Logik). Siehe
 * docs/app-runtime.md, offene Punkte für #13.
 */
const props = defineProps<{
  point: ProtocolPoint
  values: Record<string, PointValue>
  /** Zentrale Platzhalter-Auflösung (runtime.mjs). Fallback: unverändert. */
  resolve?: (input: string) => string
}>()
const emit = defineEmits<{ set: [payload: { id: string; value: PointValue | undefined }] }>()

/** Platzhalter in UI-Texten über die geteilte Runtime-Funktion auflösen. */
function r(input: string | undefined): string {
  const s = input ?? ''
  return props.resolve ? props.resolve(s) : s
}

/**
 * UI-Fallback ohne `label`: ID lesbar machen (vorerkrankungen -> Vorerkrankungen).
 * Nur Anzeige - die Renderer-Ausgabe bleibt label-frei (payload16-treu, #27).
 */
function humanize(id: string | undefined): string {
  const s = (id ?? '').replace(/[-_]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Anzeige-Name (#70): title (nur Anzeige) > label (getippt) > lesbare id. */
function displayName(p: { title?: unknown; label?: unknown; id?: unknown; key?: unknown }): string {
  return r(p.title as string) || r(p.label as string) || (p.key as string) || humanize(p.id as string)
}

function asFinding(raw: PointValue | undefined, fallbackState?: string): BefundValue {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if ('excluded' in raw) return { state: 'excluded' }
    const o = raw as { value?: string; state?: string }
    return { state: o.state === 'abnormal' ? 'abnormal' : 'normal', value: o.value }
  }
  if (typeof raw === 'string') return { state: 'abnormal', value: raw }
  return { state: fallbackState === 'abnormal' ? 'abnormal' : 'normal' }
}

/** BefundValue -> Einsatz-Override (excluded ist der Renderer-Vertrag, #71). */
function befundOverride(v: BefundValue): PointValue {
  if (v.state === 'excluded') return { excluded: true } as PointValue
  if (v.state === 'normal') return (v.value ? { state: 'normal', value: v.value } : { state: 'normal' }) as PointValue
  return { state: 'abnormal', value: v.value } as PointValue
}

function fieldText(id: string): string {
  const raw = props.values[id]
  return typeof raw === 'string' ? raw : ''
}

/** Tri-State des Felds (#71): Standard / eigener Text / nicht erhoben. */
function fieldTri(id: string): TriState {
  const raw = props.values[id]
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'excluded' in raw) return 'excluded'
  return typeof raw === 'string' ? 'custom' : 'confirmed'
}

/** Standardtext der Vorlage (wird bei ✓ getippt, bei ✎ vorbelegt). */
function fieldStandard(): string {
  return r(((props.point.value as string) || (props.point.default as string)) ?? '')
}

function onFieldTri(t: TriState): void {
  const id = props.point.id as string
  if (t === 'confirmed') emit('set', { id, value: undefined })
  else if (t === 'custom') emit('set', { id, value: fieldStandard() })
  else emit('set', { id, value: { excluded: true } as PointValue })
}

const listText = computed(() => {
  const raw = props.values[props.point.id ?? '']
  const entries = Array.isArray(raw) ? raw : (props.point.entries as string[] | undefined) ?? []
  return entries.join('\n')
})

function onField(e: Event): void {
  const v = (e.target as HTMLInputElement).value
  emit('set', { id: props.point.id as string, value: v === '' ? undefined : v })
}
function onList(e: Event): void {
  const lines = (e.target as HTMLTextAreaElement).value.split('\n')
  emit('set', { id: props.point.id as string, value: lines })
}

// --- medikamente (#146): Zeilen {name, dosierung, kommentar} nur im Einsatz ---

const medScanOpen = ref(false)

function medRows(): MedikamenteRow[] {
  const raw = props.values[props.point.id ?? '']
  return Array.isArray(raw) && raw.every((r) => typeof r === 'object') ? (raw as MedikamenteRow[]) : []
}
function setMedRows(rows: MedikamenteRow[]): void {
  // Leer = nicht erhoben = weglassen (#71-Grundsatz): Wert komplett entfernen.
  emit('set', { id: props.point.id as string, value: rows.length ? (rows as PointValue) : undefined })
}
function updateMedRow(i: number, key: keyof MedikamenteRow, e: Event): void {
  const rows = medRows().map((r, idx) => (idx === i ? { ...r, [key]: (e.target as HTMLInputElement).value } : r))
  setMedRows(rows)
}
function addMedRow(): void {
  setMedRows([...medRows(), { name: '', dosierung: '', kommentar: '' }])
}
function removeMedRow(i: number): void {
  setMedRows(medRows().filter((_, idx) => idx !== i))
}
function applyScannedRows(rows: MedikamenteRow[]): void {
  // Gescannte Zeilen ergaenzen den Bestand (Patient nimmt ggf. mehr als im Plan).
  setMedRows([...medRows(), ...rows])
  medScanOpen.value = false
}

// --- Packungs-Scan pro Zeile (#167): EINE Packung -> PZN -> Name in GENAU diese Zeile.
// Getrennt vom BMP-Scan. Datensparsam: nur die PZN/der Name werden uebernommen,
// nie die Roh-Payload (Serien-/Chargen-/Verfalldaten werden in der Extraktion verworfen).
const pkgScanRow = ref<number | null>(null)
const pkgScanMsg = ref<string | null>(null)
const lookup = useMedicationLookup()
void lookup.ensureLoaded()

function openPackageScan(i: number): void {
  pkgScanMsg.value = null
  pkgScanRow.value = i
}
function addAndScanPackage(): void {
  const rows = [...medRows(), { name: '', dosierung: '', kommentar: '' }]
  setMedRows(rows)
  openPackageScan(rows.length - 1)
}
function onPackageDecoded(p: { text: string; format: PackageBarcodeFormat }): void {
  const i = pkgScanRow.value
  pkgScanRow.value = null
  if (i === null) return
  const pzn = extractPznFromPackageCode(p.text, p.format)
  if (!pzn) { pkgScanMsg.value = 'Keine PZN im Packungscode gefunden.'; return } // Zeile unveraendert
  const name = packageScanName(pzn, lookup.resolve(pzn))
  // NUR diese Zeile fuellen; Dosierung/Kommentar bleiben erhalten.
  setMedRows(medRows().map((r, idx) => (idx === i ? { ...r, name } : r)))
  pkgScanMsg.value = `Übernommen: ${name}`
}
</script>

<template>
  <!-- field, dreistufig (#71): ✓ Standardtext der Vorlage · ✎ eigener Text
       (mit Standard vorbelegt) · − nicht erhoben (keine Zeile in der Ausgabe). -->
  <div v-if="point.type === 'field'" class="form-control" :class="{ 'opacity-50': fieldTri(point.id as string) === 'excluded' }">
    <div class="mb-1 flex items-center gap-2">
      <TriStateToggle
        :model-value="fieldTri(point.id as string)"
        :allow-excluded="!point.required"
        :label="displayName(point)"
        @update:model-value="onFieldTri"
      />
      <span class="label-text">{{ displayName(point) }}</span>
    </div>
    <p v-if="fieldTri(point.id as string) === 'confirmed'" class="text-sm text-base-content/60">
      {{ fieldStandard() || 'kein Standardtext - ✎ zum Eintragen' }}
    </p>
    <!-- custom + multiline (#91): Modal-Editor fuer lange Freitexte -->
    <LongTextModal
      v-else-if="fieldTri(point.id as string) === 'custom' && point.multiline"
      :title="displayName(point)"
      :model-value="fieldText(point.id as string)"
      @update:model-value="emit('set', { id: point.id as string, value: $event === '' ? undefined : $event })"
    />
    <!-- custom: bei options eine Combobox (#74) - Auswahl per Tap ODER Freitext -->
    <input
      v-else-if="fieldTri(point.id as string) === 'custom'"
      type="text"
      class="input input-bordered input-sm w-full"
      :value="fieldText(point.id as string)"
      :placeholder="r((point.default as string) || point.label) || 'Eintrag …'"
      :aria-label="r(point.label ?? point.id)"
      :list="((point.options as string[]) ?? []).length ? `opt-${point.id}` : undefined"
      @input="onField"
    />
    <datalist v-if="fieldTri(point.id as string) === 'custom' && ((point.options as string[]) ?? []).length" :id="`opt-${point.id}`">
      <option v-for="o in (point.options as string[])" :key="o" :value="r(o)" />
    </datalist>
    <p v-else class="text-sm italic text-base-content/60">nicht erhoben - erscheint nicht im Protokoll</p>
  </div>

  <!-- finding: Normalbefund bestätigen oder abweichend eingeben -->
  <BefundItem
    v-else-if="point.type === 'finding'"
    :label="displayName(point)"
    :normal-text="r(point.normal as string)"
    :variants="((point.variants as string[]) ?? []).map(r)"
    :model-value="asFinding(values[point.id as string], point.state as string)"
    :required="Boolean(point.required)"
    @update:model-value="emit('set', { id: point.id as string, value: befundOverride($event) })"
  />

  <!-- findingGroup: mehrere Befunde unter einem xABCDE-Buchstaben.
       collapsible (#42): als zuklappbare Sektion (Zustand bleibt erhalten,
       Ausgabe unveraendert - reines UI-Flag). -->
  <details
    v-else-if="point.type === 'findingGroup' && point.collapsible"
    class="group rounded-lg border border-base-300"
  >
    <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      <span>{{ point.key }}<span v-if="point.label"> – {{ r(point.label) }}</span></span>
      <span class="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
    </summary>
    <div class="px-3 pb-2">
      <BefundItem
        v-for="f in (point.findings as any[])"
        :key="f.id"
        :label="displayName(f)"
        :normal-text="r(f.normal)"
        :variants="((f.variants as string[]) ?? []).map(r)"
        :model-value="asFinding(values[f.id], f.state)"
        :required="Boolean(f.required ?? point.required)"
        @update:model-value="emit('set', { id: f.id, value: befundOverride($event) })"
      />
    </div>
  </details>
  <fieldset v-else-if="point.type === 'findingGroup'" class="rounded-lg border border-base-300 p-2">
    <legend class="px-1 text-sm font-semibold">
      {{ point.key }}<span v-if="point.label"> – {{ r(point.label) }}</span>
    </legend>
    <BefundItem
      v-for="f in (point.findings as any[])"
      :key="f.id"
      :label="displayName(f)"
      :normal-text="r(f.normal)"
      :variants="((f.variants as string[]) ?? []).map(r)"
      :model-value="asFinding(values[f.id], f.state)"
      :required="Boolean(f.required ?? point.required)"
      @update:model-value="emit('set', { id: f.id, value: befundOverride($event) })"
    />
  </fieldset>

  <!-- list: eine Zeile pro Eintrag -->
  <label v-else-if="point.type === 'list'" class="form-control">
    <span v-if="point.label" class="label-text mb-1">{{ r(point.label) }}</span>
    <textarea
      class="textarea textarea-bordered textarea-sm w-full"
      rows="3"
      :value="listText"
      :aria-label="r(point.label ?? point.id)"
      @input="onList"
    />
  </label>

  <!-- text: fixer Inhalt (z. B. Aufklärung). Platzhalter zentral aufgelöst (wie Vorschau). -->
  <p v-else-if="point.type === 'text'" class="rounded bg-base-200 p-2 text-sm text-base-content/70">
    {{ r(point.content as string) }}
  </p>

  <!-- medikamente (#146): eine Zeile je Medikament (Name/Dosierung/Kommentar),
       BMP-Scan fuellt vor, manuell ergaenzbar. Keine Zeile = nicht erhoben. -->
  <div v-else-if="point.type === 'medikamente'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-2">
    <span class="text-sm font-semibold">{{ displayName(point) }}</span>

    <div v-for="(row, i) in medRows()" :key="i" class="flex flex-col gap-1 rounded bg-base-200/60 p-2">
      <div class="flex items-center gap-1">
        <input
          type="text"
          class="input input-bordered input-sm w-full"
          placeholder="Medikament (z. B. Ramipril 5 mg)"
          :value="row.name"
          :aria-label="`Medikament ${i + 1}: Name`"
          @input="updateMedRow(i, 'name', $event)"
        />
        <button
          class="btn btn-ghost btn-xs shrink-0"
          type="button"
          :aria-label="`Medikament ${i + 1}: Barcode scannen`"
          title="Barcode scannen"
          @click="openPackageScan(i)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4" aria-hidden="true">
            <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" stroke-linecap="round" />
            <path d="M7 8v8M10 8v8M13 8v8M16 8v8" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="btn btn-ghost btn-xs shrink-0"
          type="button"
          :aria-label="`Medikament ${i + 1} entfernen`"
          @click="removeMedRow(i)"
        >✕</button>
      </div>
      <div class="flex gap-1">
        <input
          type="text"
          class="input input-bordered input-sm w-1/3"
          placeholder="1-0-1-0"
          :value="row.dosierung"
          :aria-label="`Medikament ${i + 1}: Dosierung`"
          @input="updateMedRow(i, 'dosierung', $event)"
        />
        <input
          type="text"
          class="input input-bordered input-sm flex-1"
          placeholder="Kommentar (z. B. laut Patient erhöht)"
          :value="row.kommentar"
          :aria-label="`Medikament ${i + 1}: Kommentar`"
          @input="updateMedRow(i, 'kommentar', $event)"
        />
      </div>
    </div>
    <p v-if="!medRows().length" class="text-sm italic text-base-content/60">
      keine Medikamente erfasst - erscheint nicht im Protokoll
    </p>

    <div class="flex flex-wrap gap-2">
      <button class="btn btn-sm" type="button" @click="addMedRow">+ Medikament</button>
      <button class="btn btn-sm" type="button" @click="addAndScanPackage">Packung scannen</button>
      <button class="btn btn-sm" type="button" @click="medScanOpen = !medScanOpen">
        {{ medScanOpen ? 'Scanner schließen' : 'BMP scannen' }}
      </button>
    </div>
    <p v-if="pkgScanMsg" class="text-xs text-base-content/70">{{ pkgScanMsg }}</p>
    <MedplanScanSection v-if="medScanOpen" structured @apply-rows="applyScannedRows" />

    <!-- Packungs-Scan (#167): EINE Packung in die gewaehlte Zeile; getrennt vom BMP-Scan. -->
    <PackageScanOverlay v-if="pkgScanRow !== null" @decoded="onPackageDecoded" @cancel="pkgScanRow = null" />
  </div>
</template>
