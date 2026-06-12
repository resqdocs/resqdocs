<script setup lang="ts">
import { useCreatorSession } from '@/composables/useCreatorSession'

const { selected, selectedBlockId, selectBlock, addBlock, moveBlock } = useCreatorSession()
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-2 p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Blöcke</h3>
        <button class="btn btn-primary btn-xs" type="button" @click="addBlock">+ Block</button>
      </div>
      <ul class="menu w-full p-0">
        <li v-for="(b, i) in selected?.blocks ?? []" :key="b.id" class="flex-row items-center flex-nowrap">
          <button
            type="button"
            class="min-w-0 flex-1"
            :class="{ 'menu-active': b.id === selectedBlockId }"
            @click="selectBlock(b.id)"
          >
            <span class="flex-1 truncate text-left">{{ b.title || '(ohne Titel)' }}</span>
            <span v-if="b.optional" class="badge badge-ghost badge-sm">optional</span>
            <span class="badge badge-sm">{{ (b.points ?? []).length }}</span>
          </button>
          <!-- Umsortieren (#46) -->
          <button class="btn btn-ghost btn-xs px-1" type="button" :disabled="i === 0" :aria-label="`${b.title || b.id} nach oben`" @click="moveBlock(b.id, 'up')">↑</button>
          <button class="btn btn-ghost btn-xs px-1" type="button" :disabled="i === (selected?.blocks?.length ?? 0) - 1" :aria-label="`${b.title || b.id} nach unten`" @click="moveBlock(b.id, 'down')">↓</button>
        </li>
        <li v-if="!(selected?.blocks ?? []).length" class="px-3 py-2 text-sm text-base-content/60">
          Noch keine Blöcke. Lege einen an.
        </li>
      </ul>
    </div>
  </section>
</template>
