<script setup lang="ts">
/**
 * Save-Status der Vorlagen-Bibliothek (Slice 3). Macht den schon laufenden Auto-Save sichtbar -
 * keine Logikaenderung. Asymmetrie (quellenbasiert, GitLab Pajamas): Erfolg blendet sich aus,
 * Fehler bleibt sichtbar + Retry. Im Web-Dev (Memory) ein dezenter „nicht persistent"-Hinweis.
 */
import { useProtocolPersistence } from '@/rebuild/protocolPersistence'

const { saveStatus, libraryMode, retrySave } = useProtocolPersistence()
</script>

<template>
  <span role="status" aria-live="polite" class="inline-flex items-center gap-1 text-xs">
    <template v-if="saveStatus === 'saving'">
      <span class="loading loading-spinner loading-xs"></span>
      <span class="text-base-content/60">Speichert …</span>
    </template>
    <template v-else-if="saveStatus === 'saved'">
      <span class="text-success" aria-hidden="true">✓</span>
      <span class="text-base-content/60">Gespeichert</span>
    </template>
    <template v-else-if="saveStatus === 'error'">
      <span class="text-error" aria-hidden="true">!</span>
      <span class="text-error">Nicht gespeichert</span>
      <button type="button" class="btn btn-ghost btn-xs text-error" @click="retrySave">Erneut</button>
    </template>
    <span v-else-if="libraryMode === 'memory'" class="text-warning">nicht persistent (Web)</span>
  </span>
</template>
