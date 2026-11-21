<script setup lang="ts">
/**
 * Auswahl für eine ganze Sammlung: je Art (Vorlagen, gespeicherte Abschnitte, Textbausteine) eine ImportPickList,
 * nur die Arten, die enthalten sind. Gemeinsam für App und Online-Editor. Enthält die Sammlung nur eine Art, sieht
 * sie genau aus wie bisher (keine Zwischenüberschrift).
 */
import { computed } from 'vue'
import ImportPickList from './ImportPickList.vue'
import { treeItems, snippetItems, type CollectionContent, type CollectionRows } from '../importPick'

const props = defineProps<{
  content: CollectionContent
  existing: { trees: readonly string[]; blocks: readonly string[]; snippets: readonly string[] }
  blocked?: { trees?: readonly (string | null)[]; blocks?: readonly (string | null)[] }
}>()
const rows = defineModel<CollectionRows>('rows', { required: true })

const total = computed(() => props.content.trees.length + props.content.blocks.length + props.content.snippets.length)
const arten = computed(() => [props.content.trees, props.content.blocks, props.content.snippets].filter((x) => x.length).length)
const mehrere = computed(() => total.value > 1)
const set = (k: keyof CollectionRows, v: CollectionRows[keyof CollectionRows]): void => {
  rows.value = { ...rows.value, [k]: v }
}
</script>

<template>
  <div class="min-h-0 space-y-3 overflow-y-auto" data-import-collection>
    <section v-if="content.trees.length" class="space-y-1">
      <h4 v-if="arten > 1" class="text-xs font-semibold uppercase tracking-wide text-base-content/75">Vorlagen</h4>
      <ImportPickList :rows="rows.trees" :items="treeItems(content.trees)" art="vorlage" :existing-titles="existing.trees" :blocked="blocked?.trees" :checkboxes="mehrere" @update:rows="set('trees', $event)" />
    </section>
    <section v-if="content.blocks.length" class="space-y-1">
      <h4 v-if="arten > 1" class="text-xs font-semibold uppercase tracking-wide text-base-content/75">Gespeicherte Abschnitte</h4>
      <ImportPickList :rows="rows.blocks" :items="treeItems(content.blocks)" art="abschnitt" :existing-titles="existing.blocks" :blocked="blocked?.blocks" :checkboxes="mehrere" @update:rows="set('blocks', $event)" />
    </section>
    <section v-if="content.snippets.length" class="space-y-1">
      <h4 v-if="arten > 1" class="text-xs font-semibold uppercase tracking-wide text-base-content/75">Textbausteine</h4>
      <ImportPickList :rows="rows.snippets" :items="snippetItems(content.snippets)" art="textbaustein" :existing-titles="existing.snippets" :checkboxes="mehrere" @update:rows="set('snippets', $event)" />
    </section>
  </div>
</template>
