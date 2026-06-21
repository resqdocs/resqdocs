<script setup lang="ts">
import { ref } from 'vue'
import { useBausteine } from '@/composables/useBausteine'
import BausteinEditor from './BausteinEditor.vue'

/** Bausteine (wiederverwendbare neutrale Blöcke). Anlegen/umbenennen/löschen,
 *  read-only JSON + voll bearbeiten (Variante A). */
const { blocks, addBlock, renameBlock, deleteBlock } = useBausteine()
const openJson = ref<string | null>(null)
const editingId = ref<string | null>(null)

function toggleJson(id: string): void {
  openJson.value = openJson.value === id ? null : id
}
function toggleEdit(id: string): void {
  editingId.value = editingId.value === id ? null : id
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-2 p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Blöcke</h3>
        <button class="btn btn-primary btn-xs" type="button" @click="addBlock">+ Baustein</button>
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="b in blocks" :key="b.id" class="rounded border border-base-300 p-2">
          <div class="flex items-center gap-2">
            <input
              class="input input-bordered input-sm flex-1"
              :value="b.title"
              aria-label="Baustein-Titel"
              @change="renameBlock(b.id, ($event.target as HTMLInputElement).value)"
            />
            <button class="btn btn-ghost btn-xs" type="button" @click="toggleEdit(b.id)">{{ editingId === b.id ? 'Schließen' : 'Bearbeiten' }}</button>
            <button class="btn btn-ghost btn-xs" type="button" @click="toggleJson(b.id)">JSON</button>
            <button class="btn btn-ghost btn-xs text-error" type="button" @click="deleteBlock(b.id)">✕</button>
          </div>
          <pre
            v-if="openJson === b.id"
            class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-base-200 p-2 text-xs"
          >{{ JSON.stringify(b.block, null, 2) }}</pre>
          <!-- Voll-Editor (Variante A): isolierte Scratch-Session, frisch pro Öffnen (key) -->
          <BausteinEditor
            v-if="editingId === b.id"
            :key="b.id"
            :library-block="b"
            class="mt-2"
            @close="editingId = null"
          />
        </li>
        <li v-if="!blocks.length" class="px-1 py-1 text-sm text-base-content/60">Noch keine Bausteine.</li>
      </ul>
    </div>
  </section>
</template>
