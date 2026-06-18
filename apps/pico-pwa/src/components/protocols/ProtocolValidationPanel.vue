<script setup lang="ts">
import type { ValidationResult } from '@resqdocs/protocol-core/creator/creator.mjs'

/** Zeigt das Ergebnis von assertValidProtocolDraft (keine eigene Validierungslogik). */
defineProps<{ validation: ValidationResult | null }>()
</script>

<template>
  <div v-if="validation" class="flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <span class="badge" :class="validation.valid ? 'badge-success' : 'badge-error'">
        {{ validation.valid ? 'gültig' : 'ungültig' }}
      </span>
      <span class="text-xs text-base-content/60">
        {{ validation.errors.length }} Fehler · {{ validation.warnings.length }} Warnungen
      </span>
    </div>
    <ul v-if="validation.errors.length" class="list-disc pl-5 text-sm text-error">
      <li v-for="(e, i) in validation.errors" :key="`e${i}`">{{ e }}</li>
    </ul>
    <ul v-if="validation.warnings.length" class="list-disc pl-5 text-sm text-warning">
      <li v-for="(w, i) in validation.warnings" :key="`w${i}`">{{ w }}</li>
    </ul>
  </div>
</template>
