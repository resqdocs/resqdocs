<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import type { ValidationResult } from '@resqdocs/protocol-core/creator/creator.mjs'
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import VariableEditor from './VariableEditor.vue'
import BlockList from './BlockList.vue'
import BlockEditor from './BlockEditor.vue'

/**
 * Geführter Editor (#13-C): Blöcke und Punkte des AUSGEWÄHLTEN Protokolls
 * strukturiert bearbeiten. Variablen und visibleIf sind bewusst Folge-Slices.
 * Nutzt ausschließlich die geteilte Creator-Session (packages/shared/creator) —
 * keine Domain-/CRUD-Logik in Vue dupliziert.
 *
 * Slice 2a: dezente, beim Editieren sichtbare Validierungs-Zusammenfassung.
 * Speist sich aus DERSELBEN `validation`-Computed wie ProtocolValidationPanel
 * (keine zweite Validierungslogik) — nur eine zusätzliche, sticky Darstellung.
 */
const { validation } = useCreatorSessionCtx()

// Ruhiges Feedback: die Live-Validierung wird ENTPRELLT gespiegelt, damit die
// Anzeige nicht bei jedem Tastendruck zuckt. ~600 ms nach der letzten Änderung
// übernimmt `shown` den aktuellen Stand. Der erste Wert wird sofort übernommen,
// damit ein bereits ungültiger Stand beim Öffnen nicht 600 ms unsichtbar bleibt.
const shown = ref<ValidationResult | null>(validation.value)
let timer: ReturnType<typeof setTimeout> | null = null
watch(validation, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { shown.value = v }, 600)
})
onUnmounted(() => { if (timer) clearTimeout(timer) })

const open = ref(false)
// Nur anzeigen, wenn es etwas zu melden gibt — valide Vorlagen bleiben unaufdringlich.
const hasIssues = computed(() => !!shown.value && (shown.value.errors.length > 0 || shown.value.warnings.length > 0))
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Dezente Validierungs-Zusammenfassung (Slice 2a): schwebt unten ÜBER der
         Bottom-Navigation (dock = fixed, height 4rem + safe-area-inset-bottom),
         mit Abstand dazu; erscheint nur bei Hinweisen/Fehlern, entprellt; auf
         Tap Details aufklappbar. fixed + z-20, damit sie beim Scrollen sichtbar
         über dem Inhalt und über dem Dock (z-1) schwebt. -->
    <div
      v-if="hasIssues && shown"
      class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-20 px-4"
      role="status"
      aria-live="polite"
    >
      <div
        class="mx-auto flex w-full max-w-xl flex-col gap-1 rounded-xl border bg-base-100 px-3 py-2 shadow-lg md:max-w-3xl xl:max-w-5xl"
        :class="shown.errors.length ? 'border-error/50' : 'border-warning/50'"
      >
        <button
          type="button"
          class="flex min-h-[2.75rem] items-center gap-2 text-left"
          :aria-expanded="open"
          :aria-label="open ? 'Validierungs-Hinweise einklappen' : 'Validierungs-Hinweise anzeigen'"
          @click="open = !open"
        >
          <span
            class="badge badge-sm"
            :class="shown.errors.length ? 'badge-error' : 'badge-warning'"
          >
            {{ shown.errors.length
              ? `${shown.errors.length} Fehler`
              : `${shown.warnings.length} ${shown.warnings.length === 1 ? 'Hinweis' : 'Hinweise'}` }}
          </span>
          <span
            v-if="shown.errors.length && shown.warnings.length"
            class="text-xs text-base-content/60"
          >+ {{ shown.warnings.length }} {{ shown.warnings.length === 1 ? 'Hinweis' : 'Hinweise' }}</span>
          <span class="ml-auto text-xs text-base-content/50">{{ open ? 'einklappen ▴' : 'Details ▾' }}</span>
        </button>
        <template v-if="open">
          <ul v-if="shown.errors.length" class="list-disc pl-5 text-xs text-error">
            <li v-for="(e, i) in shown.errors" :key="`e${i}`">{{ e }}</li>
          </ul>
          <ul v-if="shown.warnings.length" class="list-disc pl-5 text-xs text-warning">
            <li v-for="(w, i) in shown.warnings" :key="`w${i}`">{{ w }}</li>
          </ul>
        </template>
      </div>
    </div>

    <div role="note" class="alert alert-warning text-sm">
      Nur neutrale Protokollvorlagen bearbeiten. Keine Patientendaten oder Einsatzdaten in Vorlagen
      speichern.
    </div>
    <VariableEditor />
    <BlockList />
    <BlockEditor />
  </div>
</template>
