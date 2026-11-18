<script setup lang="ts">
/**
 * Import von Vorlagen: je Vorlage übernehmen ja/nein, Name frei wählbar, bei Namensgleichheit
 * „Als neue Vorlage“ (Standard) oder „Überschreiben“. Erscheint über allen Tabs, sobald eine Import-Stelle etwas
 * abgelegt hat (useImportChoice). Abbrechen übernimmt nichts.
 */
import { computed, ref, watch } from 'vue'
import ImportPickList from '@resqdocs/protocol-core-ui/components/ImportPickList.vue'
import { initialRows, toChoices, type PickRow } from '@resqdocs/protocol-core-ui/importPick'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { pendingImport, clearImport } from '@/composables/useImportChoice'

const tree = useProtocolTree()
const rows = ref<PickRow[]>([])
const result = ref<string | null>(null)
const existingTitles = computed(() => tree.protocols.value.map((p) => p.title ?? ''))
const taken = computed(() => rows.value.filter((r) => r.take).length)

watch(pendingImport, (p) => {
  rows.value = p ? initialRows(p.trees) : []
  result.value = null
}, { immediate: true })

function take(): void {
  const p = pendingImport.value
  if (!p || !taken.value) return
  const { added, overwritten, renamed } = tree.importWithChoices(toChoices(p.trees, rows.value))
  p.onDone?.(added)
  const n = added.length
  const teile = [
    `${n} ${n === 1 ? 'Vorlage' : 'Vorlagen'} übernommen.`,
    overwritten ? `${overwritten} ${overwritten === 1 ? 'vorhandene Vorlage' : 'vorhandene Vorlagen'} ersetzt.` : '',
    renamed ? `${renamed} mit dem Zusatz „(Import)“, weil der Name schon vergeben war.` : '',
  ]
  result.value = teile.filter(Boolean).join(' ')
}
function close(): void {
  clearImport()
  result.value = null
}
</script>

<template>
  <Teleport to="body">
    <div v-if="pendingImport" class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label="Vorlagen übernehmen" data-import-choice>
      <div class="modal-box flex max-h-[90vh] flex-col space-y-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">{{ pendingImport.trees.length === 1 ? 'Vorlage übernehmen' : 'Vorlagen übernehmen' }}</h3>
        <template v-if="!result">
          <ImportPickList v-model:rows="rows" :trees="pendingImport.trees" :existing-titles="existingTitles" />
          <div class="modal-action mt-0">
            <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="close">Abbrechen</button>
            <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!taken" data-import-take @click="take">
              {{ taken === 0 ? 'Vorlagen wählen' : taken === 1 ? '1 Vorlage übernehmen' : `${taken} Vorlagen übernehmen` }}
            </button>
          </div>
        </template>
        <template v-else>
          <p class="text-sm" role="status">{{ result }} Du findest sie im Vorlagen-Tab.</p>
          <div class="modal-action mt-0">
            <button type="button" class="btn btn-primary btn-sm min-h-11" @click="close">Fertig</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
