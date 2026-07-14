<script setup lang="ts">
/**
 * Geteilte Snippet-Auswahl (Bausteine-Rework): EIN Bottom-Sheet/Modal für Editor UND Einsatz. Die Snippets
 * aus der Bibliothek (useBausteine, geteilter Singleton-Ref) stehen zur Auswahl; „Einfügen" emittiert den
 * reinen Text des Gewählten; der Host mappt ihn auf seine v1-Primitive (Editor: Feld-Vorgabe via
 * tree.insertSnippet, Einsatz: useCaseValues.setCustom). Reine Auswahl — mutiert nichts, schließt NICHT
 * selbst (der Host schließt nach select). Lädt sich selbst (reload, wenn noch nicht geladen).
 *
 * `multiple` (nur Einsatz): Checkbox-Liste statt <select> — mehrere Mustertexte auf einmal, in LISTEN-
 * reihenfolge mit Leerzeile verkettet zu EINEM select:[text] (Host-Kontrakt unverändert; der Host hängt
 * den Block an den bestehenden Feldwert an). Ohne `multiple` (Editor) bleibt es die Einzelauswahl per
 * <select> — dort ist ein Snippet by design ein eigenes Feld, kein Kombinieren.
 *
 * Teleport an body wie die Score-Sheets: im Einsatz-Shell sperrt ein backdrop-blur-Vorfahr ein fixed/Modal
 * sonst ein. Struktur nach Vorbild MoveToPicker.vue (daisyUI modal modal-bottom / ab sm modal-middle).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useBausteine } from '@/composables/useBausteine'

const props = withDefaults(defineProps<{ title?: string; multiple?: boolean }>(), {
  title: 'Snippet einfügen',
  multiple: false,
})
const emit = defineEmits<{ select: [text: string]; close: [] }>()

const { snippets, loaded, reload } = useBausteine()
onMounted(() => {
  if (!loaded.value) void reload()
})

// Nur Snippets MIT Text sind einfügbar — ein leeres Snippet würde ein Feld auf „abweichend, aber leer"
// setzen (Verify). Leere aus der Auswahl filtern; der Empty-State greift, wenn keins Text hat.
const usable = computed(() => snippets.value.filter((s) => s.text.trim() !== ''))

// --- EINZELauswahl (Editor): <select>, id-basiert (robust gegen async reload). ---
const sel = ref<string>('')
watch(
  usable,
  (list) => {
    if (props.multiple) return
    if (!list.some((s) => s.id === sel.value)) sel.value = list[0]?.id ?? ''
  },
  { immediate: true },
)
const selectedText = computed(() => usable.value.find((s) => s.id === sel.value)?.text ?? '')

// --- MEHRFACHauswahl (Einsatz): Checkbox-Liste; verkettet in LISTENreihenfolge (nicht Tipp-Reihenfolge)
//     -> vorhersehbar; feinsortieren kann der Nutzer danach im großen Textfeld. ---
const checked = ref<string[]>([])
function toggle(id: string): void {
  checked.value = checked.value.includes(id) ? checked.value.filter((x) => x !== id) : [...checked.value, id]
}
watch(usable, (list) => {
  if (!props.multiple) return
  const ids = new Set(list.map((s) => s.id)) // nach reload verschwundene abwählen
  checked.value = checked.value.filter((id) => ids.has(id))
})
const combinedText = computed(() =>
  usable.value
    .filter((s) => checked.value.includes(s.id))
    .map((s) => s.text)
    .join('\n\n'),
)

const canInsert = computed(() => (props.multiple ? checked.value.length > 0 : !!sel.value))
const insertLabel = computed(() => (props.multiple && checked.value.length ? `Einfügen (${checked.value.length})` : 'Einfügen'))
function confirm(): void {
  if (!canInsert.value) return
  emit('select', props.multiple ? combinedText.value : selectedText.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-box flex max-h-[80vh] flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <p class="text-xs text-base-content/60">
          Eingefügt wird eine <strong>Kopie</strong> des Textes — keine Verknüpfung. Änderst du das Snippet später, füge es neu ein.
          <template v-if="multiple"> Mehrere ausgewählte werden mit Leerzeile verkettet und ans Feld angehängt.</template>
        </p>

        <!-- MEHRFACH: Checkbox-Liste (44pt-Zeilen), scrollbar bei vielen Snippets. min-h-0 am Scroll-
             Container + shrink-0 an den Zeilen: sonst staucht Flexbox (v. a. iOS-WebKit) die Zeilen
             unter ihre Inhaltsgröße statt zu scrollen -> mehrzeilige Zeilen überlappen sich. -->
        <template v-if="multiple && usable.length">
          <div class="-mx-1 flex max-h-[40vh] min-h-0 flex-col overflow-y-auto" role="group" aria-label="Snippets auswählen">
            <label v-for="s in usable" :key="s.id" class="flex min-h-11 shrink-0 cursor-pointer items-start gap-2 rounded-lg px-1 py-2 hover:bg-base-200">
              <input type="checkbox" class="checkbox checkbox-sm mt-0.5 shrink-0" :checked="checked.includes(s.id)" @change="toggle(s.id)" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium">{{ s.title || '(ohne Titel)' }}</span>
                <span class="block truncate text-xs text-base-content/50">{{ s.text }}</span>
              </span>
            </label>
          </div>
          <p v-if="combinedText.trim()" class="max-h-32 shrink-0 overflow-y-auto whitespace-pre-wrap rounded-lg bg-base-200 p-2 text-xs text-base-content/70">{{ combinedText }}</p>
        </template>

        <!-- EINZEL: <select> (Editor-Pfad, unverändert) -->
        <template v-else-if="usable.length">
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
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!canInsert" @click="confirm">{{ insertLabel }}</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
    </div>
  </Teleport>
</template>
