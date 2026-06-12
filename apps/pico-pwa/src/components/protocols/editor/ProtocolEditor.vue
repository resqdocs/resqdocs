<script setup lang="ts">
import VariableEditor from './VariableEditor.vue'
import BlockList from './BlockList.vue'
import BlockEditor from './BlockEditor.vue'

/**
 * Geführter Editor (#13-C): Blöcke und Punkte des AUSGEWÄHLTEN Protokolls
 * strukturiert bearbeiten. Variablen und visibleIf sind bewusst Folge-Slices.
 * Nutzt ausschließlich die geteilte Creator-Session (packages/shared/creator) —
 * keine Domain-/CRUD-Logik in Vue dupliziert.
 */
</script>

<template>
  <div class="flex flex-col gap-3">
    <div role="note" class="alert alert-warning text-sm">
      Nur neutrale Protokollvorlagen bearbeiten. Keine Patientendaten oder Einsatzdaten in Vorlagen
      speichern.
    </div>
    <VariableEditor />
    <BlockList />
    <BlockEditor />
  </div>
</template>
