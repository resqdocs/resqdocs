<script setup lang="ts">
/**
 * Geteilte Block-Auswahl (Bausteine-Rework Slice 2): EIN Bottom-Sheet/Modal zum Einfügen eines
 * wiederverwendbaren Blocks (v1-Container-Teilbaum) in die aktive Vorlage. Die Blöcke aus der Bibliothek
 * (useBlockLibrary, geteilter Singleton-Ref) stehen in einem <select>; „Einfügen" emittiert den gewählten
 * Container; der Host re-IDt ihn kollisionsfrei und hängt ihn an (tree.insertBlock). Reine Auswahl —
 * mutiert nichts, schließt NICHT selbst (der Host schließt nach select). Teleport an body wie SnippetPicker
 * (im Einsatz-Shell sperrt ein backdrop-blur-Vorfahr ein fixed/Modal sonst ein).
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { blockStructureLabel } from '../blockSummary.ts'
import { useBlockLibrary } from '../useBlockLibrary.ts'

withDefaults(defineProps<{ title?: string }>(), { title: 'Block einfügen' })
const emit = defineEmits<{ select: [block: Container]; close: [] }>()

const { blocks, loaded, reload } = useBlockLibrary()
onMounted(() => {
  if (!loaded.value) void reload()
})

// Auswahl per <select> (id-basiert, robust gegen async reload). Vorauswahl aufs erste; „Einfügen"
// emittiert den gewählten Container (select:[block]-Contract) — der Host kopiert + re-IDt.
const sel = ref<string>('')
watch(
  blocks,
  (list) => {
    if (!list.some((b) => b.id === sel.value)) sel.value = list[0]?.id ?? ''
  },
  { immediate: true },
)
const selected = computed<Container | null>(() => blocks.value.find((b) => b.id === sel.value) ?? null)
const childPreview = computed(() => {
  const b = selected.value
  if (!b) return ''
  const names = b.children.map((c) => (c.title && c.title.trim()) || c.id)
  return names.join(' · ')
})
function confirm(): void {
  const b = selected.value
  if (b) emit('select', b)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-box flex max-h-[80vh] flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <p class="text-xs text-base-content/60">
          Eingefügt wird eine <strong>Kopie</strong> der Struktur — keine Verknüpfung. Änderst du den Block später, füge ihn neu ein.
        </p>

        <template v-if="blocks.length">
          <select v-model="sel" class="select select-bordered select-sm w-full" aria-label="Block auswählen">
            <option v-for="b in blocks" :key="b.id" :value="b.id">{{ (b.title && b.title.trim()) || '(ohne Titel)' }}</option>
          </select>
          <p v-if="selected" class="max-h-32 overflow-y-auto rounded-lg bg-base-200 p-2 text-xs text-base-content/70">
            <span class="font-medium">{{ blockStructureLabel(selected) }}</span>
            <span v-if="childPreview"> — {{ childPreview }}</span>
          </p>
        </template>
        <p v-else-if="loaded" class="px-2 py-6 text-center text-sm text-base-content/50">
          Noch keine Blöcke. Lege im Vorlagen-Editor an einem Container „Als Baustein speichern" an.
        </p>
        <p v-else class="px-2 py-6 text-center text-sm text-base-content/50">Lade …</p>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!sel" @click="confirm">Einfügen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
