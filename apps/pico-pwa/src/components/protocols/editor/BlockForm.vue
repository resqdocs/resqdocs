<script setup lang="ts">
import { ref, watch } from 'vue'
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import { useBausteine } from '@/composables/useBausteine'

/** hideBlockActions: blendet Block-Aktionen (Duplizieren/Als Baustein speichern/
 *  Löschen) aus — genutzt im Baustein-Editor (Variante A), wo diese nicht passen.
 *  Default false → Protokoll-Editor unverändert. */
withDefaults(defineProps<{ hideBlockActions?: boolean }>(), { hideBlockActions: false })

const { currentBlock, updateCurrentBlock, duplicateBlock, removeBlock } = useCreatorSessionCtx()
const { addBlockFromExisting } = useBausteine()

// Lokaler Titel-State: leerer Titel wird NICHT committet (updateBlock lehnt ihn ab).
const title = ref('')
const confirmDelete = ref(false)
const saveStatus = ref<{ ok: boolean; msg: string } | null>(null)
const saving = ref(false)
watch(
  () => currentBlock.value?.id,
  () => {
    title.value = currentBlock.value?.title ?? ''
    confirmDelete.value = false
    saveStatus.value = null
  },
  { immediate: true },
)

function commitTitle(): void {
  const t = title.value.trim()
  if (t && t !== currentBlock.value?.title) updateCurrentBlock({ title: t })
}
async function saveAsBaustein(): Promise<void> {
  if (!currentBlock.value || saving.value) return
  saving.value = true
  try {
    const r = await addBlockFromExisting(currentBlock.value)
    saveStatus.value = r.ok
      ? { ok: true, msg: `Als Baustein „${r.title}" gespeichert.` }
      : { ok: false, msg: `Speichern abgelehnt: ${r.error}` }
  } finally {
    saving.value = false
  }
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
    <div v-if="!hideBlockActions" class="flex flex-wrap gap-2">
      <button class="btn btn-sm" type="button" @click="duplicateBlock(currentBlock.id)">Block duplizieren</button>
      <button class="btn btn-sm" type="button" :disabled="saving" @click="saveAsBaustein">Als Baustein speichern</button>
      <button class="btn btn-outline btn-error btn-sm" type="button" @click="confirmDelete = true">Block löschen</button>
    </div>
    <p v-if="saveStatus && !hideBlockActions" role="status" aria-live="polite" class="text-xs" :class="saveStatus.ok ? 'text-success' : 'text-error'">
      {{ saveStatus.msg }}
    </p>
    <div v-if="confirmDelete && !hideBlockActions" role="alert" class="alert alert-warning flex-wrap gap-2 text-sm">
      <span>Block „{{ currentBlock.title }}" löschen?</span>
      <span class="flex gap-2">
        <button class="btn btn-error btn-xs" type="button" @click="doDelete">Löschen</button>
        <button class="btn btn-ghost btn-xs" type="button" @click="confirmDelete = false">Abbrechen</button>
      </span>
    </div>
  </div>
</template>
