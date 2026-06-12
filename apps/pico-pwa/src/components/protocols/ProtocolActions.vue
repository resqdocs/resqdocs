<script setup lang="ts">
import { ref } from 'vue'

/** Protokoll-Aktionen: Neu / Duplizieren / Umbenennen / Löschen (flüchtig, kein Speichern). */
const props = withDefaults(defineProps<{ selectedTitle: string | null; canAct: boolean; readOnly?: boolean }>(), { readOnly: false })
const emit = defineEmits<{ create: []; duplicate: []; rename: [title: string]; remove: [] }>()

const renaming = ref(false)
const draft = ref('')
const confirmDelete = ref(false)

function startRename(): void {
  draft.value = props.selectedTitle ?? ''
  renaming.value = true
}
function submitRename(): void {
  const t = draft.value.trim()
  if (!t) return
  emit('rename', t)
  renaming.value = false
}
function doRemove(): void {
  emit('remove')
  confirmDelete.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-primary btn-sm" type="button" @click="emit('create')">+ Neu</button>
      <button class="btn btn-sm" type="button" :disabled="!canAct" @click="emit('duplicate')">Duplizieren</button>
      <button class="btn btn-sm" type="button" :disabled="!canAct || props.readOnly" @click="startRename">Umbenennen</button>
      <button class="btn btn-outline btn-error btn-sm" type="button" :disabled="!canAct || props.readOnly" @click="confirmDelete = true">
        Löschen
      </button>
    </div>

    <div v-if="renaming" class="flex gap-2">
      <input
        v-model="draft"
        class="input input-bordered input-sm flex-1"
        placeholder="Neuer Titel"
        aria-label="Neuer Protokoll-Titel"
        @keyup.enter="submitRename"
      />
      <button class="btn btn-primary btn-sm" type="button" :disabled="!draft.trim()" @click="submitRename">OK</button>
      <button class="btn btn-ghost btn-sm" type="button" @click="renaming = false">Abbrechen</button>
    </div>

    <div v-if="confirmDelete" role="alert" class="alert alert-warning flex-wrap gap-2 text-sm">
      <span>„{{ selectedTitle }}" wirklich löschen?</span>
      <span class="flex gap-2">
        <button class="btn btn-error btn-xs" type="button" @click="doRemove">Löschen</button>
        <button class="btn btn-ghost btn-xs" type="button" @click="confirmDelete = false">Abbrechen</button>
      </span>
    </div>
  </div>
</template>
