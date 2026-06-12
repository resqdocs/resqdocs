<script setup lang="ts">
import { reactive, computed, ref, watch } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'

/**
 * Variablen-Formular (#13-D). Typ wird nur angezeigt (Typwechsel nach Anlage
 * nicht vorgesehen, #13-A). Löschen ist BLOCKIERT, solange Referenzen bestehen
 * (konservativer Default laut #13-Spec) — betroffene Referenzen werden gezeigt.
 */
const { currentVariable, updateCurrentVariable, removeVariable, variableReferences } = useCreatorSession()

interface OptionRow { value: string; label: string }
const form = reactive<{ label: string; default: string; bool: boolean; grammar: boolean; options: OptionRow[] }>(
  { label: '', default: '', bool: false, grammar: false, options: [] },
)
const confirmDelete = ref(false)

watch(
  () => currentVariable.value?.id,
  () => {
    const v = currentVariable.value
    confirmDelete.value = false
    if (!v) return
    form.label = (v.label as string) ?? ''
    form.default = v.default == null ? '' : String(v.default)
    form.bool = v.default === true
    form.grammar = v.grammar === 'de-gender'
    form.options = Array.isArray(v.options) ? (v.options as OptionRow[]).map((o) => ({ value: o.value, label: o.label })) : []
  },
  { immediate: true },
)

const references = computed(() => (currentVariable.value ? variableReferences(currentVariable.value.id) : []))
const canDelete = computed(() => references.value.length === 0)

const set = (patch: Record<string, unknown>) => updateCurrentVariable(patch)
function setLabel(): void { set({ label: form.label }) }
function setGrammar(): void { set({ grammar: form.grammar ? 'de-gender' : undefined }) }
function setTextDefault(): void { set({ default: form.default === '' ? undefined : form.default }) }
function setNumberDefault(): void { set({ default: form.default === '' ? undefined : Number(form.default) }) }
function setBoolDefault(): void { set({ default: form.bool }) }
function setSelectDefault(): void { set({ default: form.default === '' ? undefined : form.default }) }
function commitOptions(): void { set({ options: form.options.map((o) => ({ value: o.value, label: o.label })) }) }
function addOption(): void { form.options.push({ value: '', label: '' }); commitOptions() }
function removeOption(i: number): void { form.options.splice(i, 1); commitOptions() }

function doDelete(): void {
  if (currentVariable.value && canDelete.value) removeVariable(currentVariable.value.id)
  confirmDelete.value = false
}
</script>

<template>
  <div v-if="currentVariable" class="flex flex-col gap-2 rounded-lg bg-base-200 p-3">
    <div class="text-xs text-base-content/60">
      Variable · Typ: <span class="badge badge-ghost badge-sm">{{ currentVariable.type }}</span>
      <span class="ml-1">id: {{ currentVariable.id }}</span>
    </div>

    <label class="form-control">
      <span class="label-text mb-1">Label</span>
      <input v-model="form.label" class="input input-bordered input-sm w-full" @input="setLabel" />
    </label>

    <!-- select: Optionen + Default + Grammatik -->
    <template v-if="currentVariable.type === 'select'">
      <div class="flex flex-col gap-1">
        <span class="label-text">Optionen (Wert / Anzeige)</span>
        <div v-for="(o, i) in form.options" :key="i" class="flex gap-1">
          <input v-model="o.value" class="input input-bordered input-xs w-24" placeholder="Wert" @input="commitOptions" />
          <input v-model="o.label" class="input input-bordered input-xs flex-1" placeholder="Anzeige" @input="commitOptions" />
          <button class="btn btn-ghost btn-xs text-error" type="button" @click="removeOption(i)">✕</button>
        </div>
        <button class="btn btn-xs w-28" type="button" @click="addOption">+ Option</button>
      </div>
      <label class="form-control">
        <span class="label-text mb-1">Standardwert</span>
        <select v-model="form.default" class="select select-bordered select-sm w-full" @change="setSelectDefault">
          <option value="">(kein)</option>
          <option v-for="o in form.options" :key="o.value" :value="o.value">{{ o.label || o.value }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.grammar" type="checkbox" class="checkbox checkbox-sm" @change="setGrammar" />
        <span>Grammatik „de-gender" (Platzhalter Patientin/Patient …)</span>
      </label>
    </template>

    <!-- boolean -->
    <label v-else-if="currentVariable.type === 'boolean'" class="form-control">
      <span class="label-text mb-1">Standardwert</span>
      <select v-model="form.bool" class="select select-bordered select-sm w-40" @change="setBoolDefault">
        <option :value="false">nein</option>
        <option :value="true">ja</option>
      </select>
    </label>

    <!-- number -->
    <label v-else-if="currentVariable.type === 'number'" class="form-control">
      <span class="label-text mb-1">Standardwert</span>
      <input v-model="form.default" type="number" class="input input-bordered input-sm w-40" @input="setNumberDefault" />
    </label>

    <!-- text -->
    <label v-else class="form-control">
      <span class="label-text mb-1">Standardwert</span>
      <input v-model="form.default" class="input input-bordered input-sm w-full" @input="setTextDefault" />
    </label>

    <!-- Löschen mit Referenzschutz -->
    <div class="mt-1 flex flex-col gap-1">
      <div v-if="!canDelete" role="alert" class="alert alert-warning text-xs">
        <span>
          Wird noch verwendet ({{ references.length }}) – Löschen blockiert. Entferne zuerst die Bezüge:
          <span class="font-mono">{{ references.map((r) => r.where).join(', ') }}</span>
        </span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-error btn-sm" type="button" :disabled="!canDelete" @click="confirmDelete = true">
          Variable löschen
        </button>
      </div>
      <div v-if="confirmDelete" role="alert" class="alert alert-warning flex-wrap gap-2 text-sm">
        <span>Variable „{{ currentVariable.label ?? currentVariable.id }}" löschen?</span>
        <span class="flex gap-2">
          <button class="btn btn-error btn-xs" type="button" @click="doDelete">Löschen</button>
          <button class="btn btn-ghost btn-xs" type="button" @click="confirmDelete = false">Abbrechen</button>
        </span>
      </div>
    </div>
  </div>
</template>
