<script setup lang="ts">
/**
 * Geteilte Snippet-Auswahl (Bausteine-Rework): EIN Bottom-Sheet/Modal für Editor UND Einsatz. Die Snippets
 * aus der Bibliothek (useBausteine, geteilter Singleton-Ref) stehen in einem <select> (clean bei vielen);
 * „Einfügen" emittiert den reinen Text des Gewählten; der Host mappt ihn auf seine v1-Primitive (Editor:
 * Feld-Vorgabe via tree.insertSnippet, Einsatz: useCaseValues.setCustom). Reine Auswahl — mutiert nichts,
 * schließt NICHT selbst (der Host schließt nach select). Lädt sich selbst (reload, wenn noch nicht geladen).
 *
 * Teleport an body wie die Score-Sheets: im Einsatz-Shell sperrt ein backdrop-blur-Vorfahr ein fixed/Modal
 * sonst ein. Struktur nach Vorbild MoveToPicker.vue (daisyUI modal modal-bottom / ab sm modal-middle).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useBausteine } from '@/composables/useBausteine'

withDefaults(defineProps<{ title?: string }>(), { title: 'Snippet einfügen' })
const emit = defineEmits<{ select: [text: string]; close: [] }>()

const { snippets, loaded, reload } = useBausteine()
onMounted(() => {
  if (!loaded.value) void reload()
})

// Nur Snippets MIT Text sind einfügbar — ein leeres Snippet würde ein Feld auf „abweichend, aber leer"
// setzen (Verify). Leere aus der Auswahl filtern; der Empty-State greift, wenn keins Text hat.
const usable = computed(() => snippets.value.filter((s) => s.text.trim() !== ''))

// Auswahl per <select> (id-basiert, robust gegen async reload, das Reihenfolge/Menge aendern kann).
// Vorauswahl aufs erste Snippet, sobald geladen bzw. wenn die aktuelle Auswahl wegfaellt; „Einfuegen"
// emittiert den Text des Gewaehlten (select:[text]-Contract unveraendert).
const sel = ref<string>('')
watch(
  usable,
  (list) => {
    if (!list.some((s) => s.id === sel.value)) sel.value = list[0]?.id ?? ''
  },
  { immediate: true },
)
const selectedText = computed(() => usable.value.find((s) => s.id === sel.value)?.text ?? '')
function confirm(): void {
  const s = usable.value.find((x) => x.id === sel.value)
  if (s) emit('select', s.text)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-box flex max-h-[80vh] flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <p class="text-xs text-base-content/60">
          Eingefügt wird eine <strong>Kopie</strong> des Textes — keine Verknüpfung. Änderst du das Snippet später, füge es neu ein.
        </p>

        <template v-if="usable.length">
          <select v-model="sel" class="select select-bordered select-sm w-full" aria-label="Snippet auswählen">
            <option v-for="s in usable" :key="s.id" :value="s.id">{{ s.title || '(ohne Titel)' }}</option>
          </select>
          <p v-if="selectedText.trim()" class="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-base-200 p-2 text-xs text-base-content/70">{{ selectedText }}</p>
        </template>
        <p v-else-if="loaded" class="px-2 py-6 text-center text-sm text-base-content/50">
          Noch keine Snippets mit Text. Lege im Tab „Bausteine" welche an.
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
