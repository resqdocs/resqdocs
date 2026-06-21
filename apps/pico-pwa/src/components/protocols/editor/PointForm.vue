<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import { TOOL_LABELS } from '@/tools/registry'

/**
 * Bewusst einfaches, typ-spezifisches Punkt-Formular. Schreibt über
 * updateCurrentPoint (Creator-Domainlogik) — keine eigene Logik. Lokaler
 * Form-State (synchron beim Punktwechsel) vermeidet Cursor-Sprünge.
 *
 * Typwechsel nach Anlage ist NICHT möglich (durch #13-A abgelehnt) — der Typ
 * wird nur angezeigt.
 */
const { currentPoint, updateCurrentPoint } = useCreatorSessionCtx()

interface FindingRow {
  id?: string
  label: string
  normal: string
  variants: string
}
const form = reactive<{
  label: string
  title: string
  default: string
  options: string
  multiline: boolean
  normal: string
  variants: string
  state: string
  content: string
  key: string
  entries: string
  findings: FindingRow[]
  tool: string
  collapsible: boolean
  required: boolean
}>({ label: '', title: '', default: '', options: '', multiline: false, normal: '', variants: '', state: 'normal', content: '', key: '', entries: '', findings: [], tool: '', collapsible: false, required: false })

watch(
  () => currentPoint.value?.id,
  () => {
    const p = currentPoint.value
    if (!p) return
    form.label = (p.label as string) ?? ''
    form.title = (p.title as string) ?? ''
    form.default = (p.default as string) ?? ''
    form.multiline = Boolean(p.multiline)
    form.options = Array.isArray(p.options) ? (p.options as string[]).join('\n') : ''
    form.normal = (p.normal as string) ?? ''
    form.variants = Array.isArray(p.variants) ? (p.variants as string[]).join('\n') : ''
    form.state = (p.state as string) ?? 'normal'
    form.content = (p.content as string) ?? ''
    form.key = (p.key as string) ?? ''
    form.tool = (p.tool as string) ?? ''
    form.collapsible = Boolean(p.collapsible)
    form.required = Boolean(p.required)
    form.entries = Array.isArray(p.entries) ? (p.entries as string[]).join('\n') : ''
    form.findings = Array.isArray(p.findings)
      ? (p.findings as FindingRow[]).map((f) => ({ id: f.id, label: f.label ?? '', normal: f.normal ?? '', variants: Array.isArray(f.variants) ? (f.variants as unknown as string[]).join('\n') : '' }))
      : []
  },
  { immediate: true },
)

const set = (patch: Record<string, unknown>) => updateCurrentPoint(patch)

function setEntries(): void {
  updateCurrentPoint({ entries: form.entries === '' ? [] : form.entries.split('\n') })
}
function commitFindings(): void {
  updateCurrentPoint({ findings: form.findings.map((f) => ({ id: f.id, label: f.label, normal: f.normal, ...(f.variants.trim() ? { variants: f.variants.split('\n').map((x) => x.trim()).filter(Boolean) } : {}) })) })
  // generierte ids zurücksynchronisieren (Stabilität, kein Churn)
  const fs = (currentPoint.value?.findings ?? []) as FindingRow[]
  fs.forEach((f, i) => { if (form.findings[i]) form.findings[i].id = f.id })
}
function addFinding(): void {
  form.findings.push({ label: '', normal: '', variants: '' })
  commitFindings()
}
function removeFinding(i: number): void {
  form.findings.splice(i, 1)
  commitFindings()
}
</script>

<template>
  <div v-if="currentPoint" class="flex flex-col gap-2">
    <div class="text-xs text-base-content/60">
      Typ: <span class="badge badge-ghost badge-sm">{{ currentPoint.type }}</span>
    </div>

    <!-- Pflichtpunkt (#71): bietet im Einsatz 'nicht erhoben' NICHT an -->
    <label class="flex items-center gap-2">
      <input
        v-model="form.required"
        type="checkbox"
        class="checkbox checkbox-sm"
        @change="set({ required: form.required || undefined })"
      />
      <span class="label-text">Immer dokumentieren (Pflichtpunkt - „nicht erhoben" entfällt)</span>
    </label>

    <!-- Label (alle Typen außer text optional) -->
    <label v-if="currentPoint.type !== 'text'" class="form-control">
      <span class="label-text mb-1">Label (wird getippt, darf leer sein)</span>
      <input v-model="form.label" class="input input-bordered input-sm w-full" @input="set({ label: form.label })" />
    </label>

    <!-- field -->
    <template v-if="currentPoint.type === 'field'">
      <label class="form-control">
        <span class="label-text mb-1">Titel (nur Anzeige im Editor/Einsatz, wird nicht getippt)</span>
        <input v-model="form.title" class="input input-bordered input-sm w-full" placeholder="z. B. Nikotin" @input="set({ title: form.title || undefined })" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Standardinhalt (optional, als Hinweis)</span>
        <input v-model="form.default" class="input input-bordered input-sm w-full" @input="set({ default: form.default })" />
      </label>
      <!-- Auswahlwerte (#74): im Einsatz als Combobox (antippen oder frei tippen) -->
      <label class="form-control">
        <span class="label-text mb-1">Auswahlwerte (optional, eine pro Zeile)</span>
        <textarea
          v-model="form.options"
          rows="2"
          class="textarea textarea-bordered textarea-sm w-full"
          placeholder="z. B. normal&#10;trocken"
          @input="set({ options: form.options.trim() ? form.options.split('\n').map((x) => x.trim()).filter(Boolean) : undefined })"
        />
      </label>
      <!-- Langer Text (#91) -->
      <label class="flex items-center gap-2">
        <input
          v-model="form.multiline"
          type="checkbox"
          class="checkbox checkbox-sm"
          @change="set({ multiline: form.multiline || undefined })"
        />
        <span class="label-text">Langer Text (Modal-Editor, z. B. Anamnese/Verlauf)</span>
      </label>
      <!-- Feld-Tool (#54): Ergebnis des Tools fliesst im Einsatz in dieses Feld -->
      <label class="form-control">
        <span class="label-text mb-1">Tool anbieten (im Einsatz unter dem Feld)</span>
        <select
          v-model="form.tool"
          class="select select-bordered select-sm w-full max-w-xs"
          @change="set({ tool: form.tool || undefined })"
        >
          <option value="">kein Tool</option>
          <option v-for="(label, id) in TOOL_LABELS" :key="id" :value="id">{{ label }}</option>
        </select>
      </label>
    </template>

    <!-- finding -->
    <template v-if="currentPoint.type === 'finding'">
      <label class="form-control">
        <span class="label-text mb-1">Normalbefund-Text</span>
        <input v-model="form.normal" class="input input-bordered input-sm w-full" @input="set({ normal: form.normal })" />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Varianten (#73, eine pro Zeile, im Einsatz wählbar)</span>
        <textarea
          v-model="form.variants"
          rows="2"
          class="textarea textarea-bordered textarea-sm w-full"
          placeholder="z. B. vesikulär mit feuchten RGs"
          @input="set({ variants: form.variants.trim() ? form.variants.split('\n').map((x) => x.trim()).filter(Boolean) : undefined })"
        />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Standard-Zustand</span>
        <select v-model="form.state" class="select select-bordered select-sm w-40" @change="set({ state: form.state })">
          <option value="normal">normal</option>
          <option value="abnormal">auffällig</option>
        </select>
      </label>
    </template>

    <!-- findingGroup -->
    <template v-if="currentPoint.type === 'findingGroup'">
      <label class="form-control">
        <span class="label-text mb-1">Schlüssel (z. B. xABCDE-Buchstabe)</span>
        <input v-model="form.key" class="input input-bordered input-sm w-24" @input="set({ key: form.key })" />
      </label>
      <!-- Einklappbar (#42): reines UI-Flag fuer die Einsatzansicht -->
      <label class="flex items-center gap-2">
        <input
          v-model="form.collapsible"
          type="checkbox"
          class="checkbox checkbox-sm"
          @change="set({ collapsible: form.collapsible || undefined })"
        />
        <span class="label-text">Einklappbar im Einsatz</span>
      </label>
      <div class="flex flex-col gap-2">
        <span class="label-text">Befunde</span>
        <div v-for="(f, i) in form.findings" :key="i" class="flex flex-col gap-1 rounded border border-base-300 p-2">
          <input v-model="f.label" class="input input-bordered input-xs w-full" placeholder="Label" @input="commitFindings" />
          <div class="flex gap-1">
            <input v-model="f.normal" class="input input-bordered input-xs flex-1" placeholder="Normalbefund" @input="commitFindings" />
            <button class="btn btn-ghost btn-xs text-error" type="button" @click="removeFinding(i)">✕</button>
          </div>
          <textarea
            v-model="f.variants"
            rows="1"
            class="textarea textarea-bordered textarea-xs w-full"
            placeholder="Varianten (#73, eine pro Zeile)"
            @input="commitFindings"
          />
        </div>
        <button class="btn btn-xs w-32" type="button" @click="addFinding">+ Befund</button>
      </div>
    </template>

    <!-- list -->
    <label v-if="currentPoint.type === 'list'" class="form-control">
      <span class="label-text mb-1">Einträge (eine Zeile pro Eintrag)</span>
      <textarea v-model="form.entries" rows="3" class="textarea textarea-bordered textarea-sm w-full" @input="setEntries" />
    </label>

    <!-- medikamente (#146): Zeilen entstehen NUR im Einsatz - Vorlagen
         enthalten keine Patientendaten, also auch keine Medikamente. -->
    <p v-if="currentPoint.type === 'medikamente'" class="rounded bg-base-200 p-2 text-xs text-base-content/70">
      Medikamenten-Zeilen (Name, Dosierung, Kommentar) werden im <strong>Einsatz</strong> erfasst -
      per BMP-Scan vorbefüllt oder von Hand. Die Vorlage definiert nur Position und Beschriftung.
    </p>

    <!-- text -->
    <label v-if="currentPoint.type === 'text'" class="form-control">
      <span class="label-text mb-1">Textinhalt</span>
      <textarea v-model="form.content" rows="3" class="textarea textarea-bordered textarea-sm w-full" @input="set({ content: form.content })" />
    </label>
  </div>
</template>
