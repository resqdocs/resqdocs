<script setup lang="ts">
import { onMounted } from 'vue'
import { useBausteine } from '@/composables/useBausteine'
import { useBlockLibrary } from '@/rebuild/useBlockLibrary'
import SnippetLibrarySection from './SnippetLibrarySection.vue'
import BlockLibrarySection from './BlockLibrarySection.vue'

/**
 * Bausteine-Tab (#13-F3). Verwaltet neutrale, wiederverwendbare Inhalte in der lokalen Library.
 * Aktuell: Snippets (Textbausteine) — eingefügt über „Snippet einfügen" im Vorlagen-Editor (als
 * Feld-Vorgabe) oder im Einsatz (als Feldwert). Wiederverwendbare Blöcke folgen in einem späteren
 * Update (Slice 2). Keine Patientendaten, kein caseState.
 */
const { libraryMode, reload } = useBausteine()
const blockLibrary = useBlockLibrary()
// Fehler beim Boot-Laden NICHT verschlucken (sonst bleibt loaded still false). Der Loaded-Guard in
// addBausteinFromContainer holt einen fehlgeschlagenen Block-Load spaeter selbst nach.
onMounted(() => {
  reload().catch((err) => console.error('Bausteine (Snippets) laden fehlgeschlagen:', err))
  blockLibrary.reload().catch((err) => console.error('Bausteine (Blöcke) laden fehlgeschlagen:', err))
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-base font-semibold">Bausteine</h2>
    <p class="text-sm text-base-content/60">
      Wiederverwendbare Snippets und Blöcke für deine Vorlagen und Einsätze.
    </p>

    <div role="note" class="alert alert-info text-sm">
      Bausteine sind neutrale, wiederverwendbare Inhalte. Keine Patientendaten oder Einsatzdaten speichern.
    </div>
    <p class="text-xs" :class="libraryMode === 'sqlite' ? 'text-base-content/60' : 'text-warning'">
      <template v-if="libraryMode === 'sqlite'">Bausteine werden lokal auf diesem Gerät gespeichert.</template>
      <template v-else>Web-Entwicklung: Bausteine sind nur in-memory und nach App-Neustart weg.</template>
    </p>

    <SnippetLibrarySection />
    <BlockLibrarySection />

    <p class="text-xs text-base-content/50">
      Snippet einfügen: im Vorlagen-Editor als Feld-Vorgabe oder im Einsatz direkt als Feldwert.
      Blöcke anlegen: im Vorlagen-Editor an einem Container „Als Baustein speichern".
    </p>
  </div>
</template>
