<script setup lang="ts">
/** Verweis auf einen Tab im Fliesstext: kleines Tab-Icon plus Name, z. B. im ▣ Einsatz. Ohne Anfuehrungszeichen, das Icon reicht. */
import TabIcon from './TabIcon.vue'
import { TAB_LABEL, type TabName } from '../terms.ts'

defineProps<{ tab: TabName }>()
</script>

<template>
  <span class="whitespace-nowrap font-medium"><TabIcon :tab="tab" class="mr-0.5 inline-block size-[1.15em] align-[-0.2em]" /> {{ TAB_LABEL[tab] }}</span>
</template>
