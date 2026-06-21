<script setup lang="ts">
import { onMounted } from 'vue'
import { useBausteine } from '@/composables/useBausteine'
import BlockLibrarySection from './BlockLibrarySection.vue'
import SnippetLibrarySection from './SnippetLibrarySection.vue'

/**
 * Textbausteine-Tab (#13-F3; bis #138 "Bausteine"). Verwaltet neutrale, wiederverwendbare
 * Bausteine + Snippets in der lokalen Library. Eingefügt werden sie im Protokoll-Editor
 * über "Aus Textbausteinen einfügen" (Copy-on-insert). Keine Patientendaten, kein caseState.
 */
const { libraryMode, reload } = useBausteine()
onMounted(reload)
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-base font-semibold">Textbausteine</h2>
    <p class="text-sm text-base-content/60">
      Wiederverwendbare Blöcke und Snippets zum Einsetzen in deine Vorlagen.
    </p>

    <div role="note" class="alert alert-info text-sm">
      Textbausteine sind neutrale, wiederverwendbare Inhalte. Keine Patientendaten oder Einsatzdaten speichern.
    </div>
    <p class="text-xs" :class="libraryMode === 'sqlite' ? 'text-base-content/60' : 'text-warning'">
      <template v-if="libraryMode === 'sqlite'">Textbausteine werden lokal auf diesem Gerät gespeichert.</template>
      <template v-else>Web-Entwicklung: Textbausteine sind nur in-memory und nach App-Neustart weg.</template>
    </p>

    <BlockLibrarySection />
    <SnippetLibrarySection />

    <p class="text-xs text-base-content/50">
      Einfügen ins Protokoll: im Protokoll-Editor über „Aus Textbausteinen einfügen" (als Kopie).
    </p>
  </div>
</template>
