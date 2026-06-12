<script setup lang="ts">
import type { ProtocolTemplate } from '@shared/renderer/render.mjs'

/** Liste der (neutralen) Protokolle der flüchtigen Creator-Session. */
defineProps<{ protocols: ProtocolTemplate[]; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <ul class="menu w-full rounded-box bg-base-100 p-0">
    <li v-for="p in protocols" :key="p.id">
      <button
        type="button"
        :class="{ 'menu-active': p.id === selectedId }"
        @click="emit('select', p.id as string)"
      >
        <span class="flex-1 truncate text-left">{{ p.title }}</span>
      </button>
    </li>
    <li v-if="!protocols.length" class="px-3 py-2 text-sm text-base-content/60">Keine Protokolle.</li>
  </ul>
</template>
