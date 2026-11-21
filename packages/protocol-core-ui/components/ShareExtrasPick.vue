<script setup lang="ts">
/**
 * Beim Teilen und Exportieren zusätzlich gespeicherte Abschnitte und Textbausteine mitgeben (Maintainer
 * 2026-11-19): je ein Häkchen „… mitteilen“ (Standard aus); ist es gesetzt, erscheint die Liste zum Auswählen.
 * Gemeinsam für App (TemplateIO) und Online-Editor (ShareDialog, Export), damit beide gleich aussehen. Das Format
 * baut collectionIO.exportCollection. Leere Textbausteine sind nicht wählbar (die Gegenseite lehnte sie ab).
 */
import { computed } from 'vue'

const props = defineProps<{
  blocks: readonly { id: string; title?: string }[]
  snippets: readonly { id: string; title?: string; text: string }[]
}>()
const blockIds = defineModel<string[]>('blockIds', { required: true })
const snippetIds = defineModel<string[]>('snippetIds', { required: true })
const withBlocks = defineModel<boolean>('withBlocks', { required: true })
const withSnippets = defineModel<boolean>('withSnippets', { required: true })

const waehlbareSnippets = computed(() => props.snippets.filter((s) => s.text.trim()))
const name = (x: { id: string; title?: string }): string => x.title?.trim() || 'ohne Titel'
function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id)
}
const alleBlocks = computed(() => props.blocks.length > 0 && props.blocks.every((b) => blockIds.value.includes(b.id)))
const alleSnippets = computed(() => waehlbareSnippets.value.length > 0 && waehlbareSnippets.value.every((s) => snippetIds.value.includes(s.id)))
</script>

<template>
  <div class="space-y-2" data-share-extras>
    <div v-if="blocks.length" class="space-y-1">
      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input v-model="withBlocks" type="checkbox" class="checkbox checkbox-sm" data-share-with-blocks />
        <span class="text-sm">Gespeicherte Abschnitte mitteilen</span>
      </label>
      <div v-if="withBlocks" class="space-y-1 pl-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-base-content/75">{{ blockIds.length }} von {{ blocks.length }} gewählt</span>
          <button v-if="blocks.length > 1" type="button" class="btn btn-ghost btn-xs min-h-8" data-share-blocks-all @click="blockIds = alleBlocks ? [] : blocks.map((b) => b.id)">{{ alleBlocks ? 'Keine' : 'Alle' }}</button>
        </div>
        <div class="max-h-48 overflow-y-auto rounded border border-base-300">
          <label v-for="b in blocks" :key="b.id" class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-base-200 px-3 last:border-b-0">
            <input type="checkbox" class="checkbox checkbox-sm" :checked="blockIds.includes(b.id)" :data-share-block="b.id" @change="blockIds = toggle(blockIds, b.id, ($event.target as HTMLInputElement).checked)" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ name(b) }}</span>
          </label>
        </div>
      </div>
    </div>
    <div v-if="snippets.length" class="space-y-1">
      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input v-model="withSnippets" type="checkbox" class="checkbox checkbox-sm" data-share-with-snippets />
        <span class="text-sm">Textbausteine mitteilen</span>
      </label>
      <div v-if="withSnippets" class="space-y-1 pl-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-base-content/75">{{ snippetIds.length }} von {{ waehlbareSnippets.length }} gewählt</span>
          <button v-if="waehlbareSnippets.length > 1" type="button" class="btn btn-ghost btn-xs min-h-8" data-share-snippets-all @click="snippetIds = alleSnippets ? [] : waehlbareSnippets.map((s) => s.id)">{{ alleSnippets ? 'Keine' : 'Alle' }}</button>
        </div>
        <div class="max-h-48 overflow-y-auto rounded border border-base-300">
          <label v-for="s in snippets" :key="s.id" class="flex min-h-11 items-center gap-3 border-b border-base-200 px-3 last:border-b-0" :class="s.text.trim() ? 'cursor-pointer' : 'opacity-60'">
            <input type="checkbox" class="checkbox checkbox-sm" :checked="snippetIds.includes(s.id)" :disabled="!s.text.trim()" :data-share-snippet="s.id" @change="snippetIds = toggle(snippetIds, s.id, ($event.target as HTMLInputElement).checked)" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ name(s) }}</span>
            <span v-if="!s.text.trim()" class="text-xs text-base-content/75">leer</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
