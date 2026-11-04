<script setup lang="ts">
/** Die Icons der Tab-Leiste. Eine Quelle, damit ein Verweis auf einen Tab genauso aussieht wie der Tab selbst. */
import type { TabName } from '../terms.ts'

defineProps<{ tab: TabName }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="tab === 'einsatz'">
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1" />
      <path d="M9 11h6M9 15h4" />
    </template>
    <template v-else-if="tab === 'vorlagen'">
      <rect x="8" y="3" width="12" height="15" rx="2" />
      <path d="M4 7v12a2 2 0 0 0 2 2h11" />
      <path d="M11.5 8h5M11.5 11.5h5" />
    </template>
    <template v-else-if="tab === 'bausteine'">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </template>
    <template v-else>
      <path d="M4 7h9M19 7h1M4 17h5M15 17h5" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
    </template>
  </svg>
</template>
