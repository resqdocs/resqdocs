<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'
import { VARIABLE_TYPES } from '@resqdocs/protocol-core/creator/creator.mjs'

const { selected, selectedVariableId, selectVariable, addVariable } = useCreatorSession()

const TYPE_LABELS: Record<string, string> = { select: 'Auswahl', boolean: 'Ja/Nein', text: 'Text', number: 'Zahl' }
const newType = ref<string>('select')
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h4 class="font-medium">Variablen</h4>
      <div class="flex gap-1">
        <select v-model="newType" class="select select-bordered select-xs" aria-label="Variablen-Typ">
          <option v-for="t in VARIABLE_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
        </select>
        <button class="btn btn-primary btn-xs" type="button" @click="addVariable(newType)">+ Variable</button>
      </div>
    </div>
    <ul class="flex flex-col gap-1">
      <li
        v-for="v in selected?.variables ?? []"
        :key="v.id"
        class="flex items-center gap-2 rounded border border-base-300 px-2 py-1"
        :class="{ 'border-primary': v.id === selectedVariableId }"
      >
        <button type="button" class="flex-1 truncate text-left text-sm" @click="selectVariable(v.id)">
          <span class="badge badge-ghost badge-sm mr-2">{{ TYPE_LABELS[v.type] ?? v.type }}</span>
          {{ v.label ?? v.id }}
        </button>
      </li>
      <li v-if="!(selected?.variables ?? []).length" class="px-1 py-1 text-sm text-base-content/60">
        Noch keine Variablen.
      </li>
    </ul>
  </div>
</template>
