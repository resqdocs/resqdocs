<script setup lang="ts">
import { computed, ref } from 'vue'
import { RELEASE_HISTORY } from '@/releaseNotes/notesAsset'
import { baseVersion } from '@/releaseNotes/releaseNotes'
import ReleaseTimeline from '@/components/ReleaseTimeline.vue'

/**
 * Versionsverlauf: was mit welcher Version dazugekommen ist. Die Texte stammen aus den Release-Notes
 * (release-notes/de), die mit der App ausgeliefert werden - kein Netzabruf.
 *
 * Darstellung: Zeitleiste (ReleaseTimeline, dieselbe wie auf der Seite „Neu“ der Einführung), jede Version
 * eine aufklappbare Karte. Offen startet nur die installierte Version.
 */
const props = defineProps<{ appVersion: string }>()
defineEmits<{ back: [] }>()
const installed = computed(() => baseVersion(props.appVersion))
const notes = RELEASE_HISTORY

const startOpen = notes.some((n) => n.version === installed.value) ? installed.value : notes[0]?.version
const open = ref<Set<string>>(new Set(startOpen ? [startOpen] : []))
const allOpen = computed(() => open.value.size === notes.length)
function toggleAll(): void {
  open.value = allOpen.value ? new Set() : new Set(notes.map((n) => n.version))
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <button type="button" class="btn btn-ghost btn-sm min-h-11 self-start gap-1 px-2" @click="$emit('back')">
      <span aria-hidden="true">‹</span> Einstellungen
    </button>
    <div class="flex items-end justify-between gap-3">
      <div class="flex flex-col">
        <h2 class="text-base font-semibold">Versionsverlauf</h2>
        <p class="text-sm text-base-content/75">Was mit welcher Version dazugekommen ist.</p>
      </div>
      <button type="button" class="btn btn-ghost btn-sm min-h-11 shrink-0 px-2 font-normal text-primary" @click="toggleAll">
        {{ allOpen ? 'Alle zuklappen' : 'Alle aufklappen' }}
      </button>
    </div>

    <ReleaseTimeline v-model:open="open" :notes="notes" :app-version="appVersion" />
  </div>
</template>
