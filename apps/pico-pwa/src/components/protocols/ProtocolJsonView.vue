<script setup lang="ts">
import { ref } from 'vue'

/** Read-only JSON-Ansicht. Kein In-App-Editor, keine Speicherung. */
defineProps<{ json: string }>()
const open = ref(false)
</script>

<template>
  <div>
    <button class="btn btn-ghost btn-xs" type="button" @click="open = !open">
      {{ open ? 'JSON verbergen' : 'JSON ansehen (read-only)' }}
    </button>
    <pre
      v-if="open"
      class="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-base-200 p-3 text-xs"
    >{{ json }}</pre>
  </div>
</template>
