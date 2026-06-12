<script setup lang="ts">
import { useBausteine } from '@/composables/useBausteine'

/** Snippets (neutrale Textbausteine). Anlegen/bearbeiten/löschen. */
const { snippets, addSnippet, updateSnippet, deleteSnippet } = useBausteine()
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-2 p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Snippets</h3>
        <button class="btn btn-primary btn-xs" type="button" @click="addSnippet">+ Snippet</button>
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="s in snippets" :key="s.id" class="flex flex-col gap-1 rounded border border-base-300 p-2">
          <div class="flex items-center gap-2">
            <input
              class="input input-bordered input-sm flex-1"
              :value="s.title"
              placeholder="Titel"
              aria-label="Snippet-Titel"
              @change="updateSnippet(s.id, { title: ($event.target as HTMLInputElement).value })"
            />
            <button class="btn btn-ghost btn-xs text-error" type="button" @click="deleteSnippet(s.id)">✕</button>
          </div>
          <textarea
            class="textarea textarea-bordered textarea-sm w-full"
            rows="2"
            :value="s.text"
            placeholder="Neutraler Text …"
            aria-label="Snippet-Text"
            @change="updateSnippet(s.id, { text: ($event.target as HTMLTextAreaElement).value })"
          />
        </li>
        <li v-if="!snippets.length" class="px-1 py-1 text-sm text-base-content/60">Noch keine Snippets.</li>
      </ul>
    </div>
  </section>
</template>
