<script setup lang="ts">
/**
 * Einstellungen „Lückentext" eines Abschnitts (Vorlage): den Abschnitt als Lückentext ausgeben, das
 * Einrichten-Fenster öffnen. Aus einem normalen Abschnitt wird ein Lückentext, in dem jedes Feld schon
 * als Lücke steht; zurück bleiben die Felder erhalten. Beide Wege stehen jederzeit offen.
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { clozeOf } from '@resqdocs/protocol-core/cloze'
import { toCloze } from '@resqdocs/protocol-core/clozeEdit'
import { useTreeEditor } from '../../treeEditor.ts'
import { clozeEditRequest } from '../../clozeEditRequest.ts'
import ClozeEditorDialog from './ClozeEditorDialog.vue'

const props = defineProps<{ node: Container; root: Container }>()
const tree = useTreeEditor()
const cloze = computed(() => clozeOf(props.node))
const gapCount = computed(() => new Set((cloze.value?.parts ?? []).flatMap((p) => (typeof p === 'string' ? [] : [p.gap]))).size)

const editor = ref<InstanceType<typeof ClozeEditorDialog> | null>(null)
function edit(): void {
  void editor.value?.open()
}
function setCloze(on: boolean): void {
  tree.update(props.node.id, { cloze: on ? toCloze(props.node).cloze : undefined })
  if (on) void nextTick(edit)
}
// Gerade über das ＋-Menü angelegt: das Einrichten-Fenster gleich öffnen.
watch(
  [clozeEditRequest, () => props.node.id],
  () => {
    if (clozeEditRequest.value !== props.node.id || !cloze.value) return
    clozeEditRequest.value = null
    void nextTick(edit)
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-2 rounded-lg bg-base-200/50 px-4 py-3" data-cloze-settings>
    <label class="flex w-full cursor-pointer items-center gap-2">
      <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="!!cloze" data-cloze-toggle @change="setCloze(($event.target as HTMLInputElement).checked)" />
      <span class="text-sm font-medium">Lückentext</span>
    </label>
    <p class="text-xs text-base-content/75">
      {{ cloze ? `Der Abschnitt gibt einen Text mit ${gapCount} ${gapCount === 1 ? 'Lücke' : 'Lücken'} aus. Ausgeschaltet bleiben die Felder, der Text entfällt.` : 'Der Abschnitt gibt einen frei geschriebenen Text aus, in dem seine Felder als Lücken stehen.' }}
    </p>
    <button v-if="cloze" type="button" class="btn btn-neutral btn-sm w-full" data-cloze-edit @click="edit">Lückentext bearbeiten</button>
    <ClozeEditorDialog v-if="cloze" ref="editor" :node="node" :root="root" />
  </div>
</template>
