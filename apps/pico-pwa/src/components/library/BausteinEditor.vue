<script setup lang="ts">
import { provide, ref } from 'vue'
import { SCHEMA_VERSION } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { Block } from '@resqdocs/protocol-core/creator/creator.mjs'
import { createCreatorSession } from '@/composables/useCreatorSession'
import { creatorSessionKey } from '@/composables/creatorSessionContext'
import { useBausteine } from '@/composables/useBausteine'
import type { LibraryBlock } from '@/storage/types'
import BlockEditor from '@/components/protocols/editor/BlockEditor.vue'

/**
 * Baustein voll bearbeiten (Variante A). Lädt den LibraryBlock.block in eine
 * ISOLIERTE Scratch-Session (persist:false → kein Auto-Persist/Restore, der echte
 * creator.session bleibt unberührt), unterschiebt sie dem Editor-Subtree per
 * provide(creatorSessionKey, …) und speichert beim „Speichern" zurück in die
 * Library. Variablen-Bedingungen entfallen (Bausteine haben keine Variablen →
 * VisibleIfEditor bietet nur Punkt-Bezüge). Jede Edit-Instanz ist frisch (v-if).
 */
const props = defineProps<{ libraryBlock: LibraryBlock }>()
const emit = defineEmits<{ close: [] }>()

const { updateBlockContent } = useBausteine()

// Wegwerf-Protokoll um den Baustein-Block; tiefe (proxy-/mutationssichere) Kopie.
const wrapped = {
  schemaVersion: SCHEMA_VERSION,
  id: '_baustein_scratch',
  title: props.libraryBlock.title,
  variables: [],
  blocks: [JSON.parse(JSON.stringify(props.libraryBlock.block)) as Block],
}
const scratch = createCreatorSession({ persist: false, seed: [wrapped] })
provide(creatorSessionKey, scratch)

const saveStatus = ref<{ ok: boolean; msg: string } | null>(null)
const saving = ref(false)

async function save(): Promise<void> {
  if (saving.value) return
  const edited = scratch.selected.value?.blocks?.[0]
  if (!edited) return
  saving.value = true
  try {
    const r = await updateBlockContent(props.libraryBlock.id, edited as Block)
    if (r.ok) {
      saveStatus.value = { ok: true, msg: 'Baustein gespeichert.' }
      emit('close')
    } else {
      saveStatus.value = { ok: false, msg: `Speichern abgelehnt: ${r.error}` }
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 rounded-lg border border-primary/40 bg-base-100 p-3">
    <h4 class="font-semibold">Baustein bearbeiten: {{ libraryBlock.title }}</h4>
    <!-- Voller Block-/Punkt-Editor auf der isolierten Scratch-Session;
         Block-Aktionen (Duplizieren/Löschen/Als-Baustein) hier ausgeblendet. -->
    <BlockEditor :hide-block-actions="true" />
    <p v-if="saveStatus" role="status" aria-live="polite" class="text-xs" :class="saveStatus.ok ? 'text-success' : 'text-error'">
      {{ saveStatus.msg }}
    </p>
    <div class="flex gap-2">
      <button class="btn btn-primary btn-sm" type="button" :disabled="saving" @click="save">Speichern</button>
      <button class="btn btn-ghost btn-sm" type="button" :disabled="saving" @click="$emit('close')">Abbrechen</button>
    </div>
  </div>
</template>
