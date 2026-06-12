<script setup lang="ts">
import { ref, watch } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'

const { currentBlock, updateCurrentBlock, duplicateBlock, removeBlock } = useCreatorSession()

// Lokaler Titel-State: leerer Titel wird NICHT committet (updateBlock lehnt ihn ab).
const title = ref('')
const confirmDelete = ref(false)
watch(
  () => currentBlock.value?.id,
  () => {
    title.value = currentBlock.value?.title ?? ''
    confirmDelete.value = false
  },
  { immediate: true },
)

function commitTitle(): void {
  const t = title.value.trim()
  if (t && t !== currentBlock.value?.title) updateCurrentBlock({ title: t })
}
function doDelete(): void {
  if (currentBlock.value) removeBlock(currentBlock.value.id)
  confirmDelete.value = false
}
</script>

<template>
  <div v-if="currentBlock" class="flex flex-col gap-2">
    <label class="form-control">
      <span class="label-text mb-1">Blocktitel</span>
      <input
        v-model="title"
        class="input input-bordered input-sm w-full"
        placeholder="Blocktitel"
        aria-label="Blocktitel"
        @input="commitTitle"
      />
    </label>
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        :checked="!!currentBlock.optional"
        aria-label="Block ist optional"
        @change="updateCurrentBlock({ optional: ($event.target as HTMLInputElement).checked })"
      />
      <span class="text-sm">optionaler Block (nur on-demand im Einsatz)</span>
    </label>
    <div class="flex gap-2">
      <button class="btn btn-sm" type="button" @click="duplicateBlock(currentBlock.id)">Block duplizieren</button>
      <button class="btn btn-outline btn-error btn-sm" type="button" @click="confirmDelete = true">Block löschen</button>
    </div>
    <div v-if="confirmDelete" role="alert" class="alert alert-warning flex-wrap gap-2 text-sm">
      <span>Block „{{ currentBlock.title }}" löschen?</span>
      <span class="flex gap-2">
        <button class="btn btn-error btn-xs" type="button" @click="doDelete">Löschen</button>
        <button class="btn btn-ghost btn-xs" type="button" @click="confirmDelete = false">Abbrechen</button>
      </span>
    </div>
  </div>
</template>
