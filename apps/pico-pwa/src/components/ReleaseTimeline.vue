<script setup lang="ts">
import { computed } from 'vue'
import { baseVersion, splitLead, type NoteKind, type ReleaseNote } from '@/releaseNotes/releaseNotes'

/**
 * Zeitleiste der Versionen: Linie links, je Version ein Punkt und eine aufklappbare Karte. Zugeklappt reichen
 * Nummer, ein Satz und die Anzahl je Art; aufgeklappt stehen die Punkte. Gemeinsam genutzt vom
 * Versionsverlauf (Einstellungen) und der Seite „Neu“ der Einführung nach einem Update - beide sehen gleich aus.
 *
 * Welche Karten offen sind, bestimmt der Aufrufer (v-model:open).
 */
const props = defineProps<{ notes: readonly ReleaseNote[]; appVersion: string }>()
const open = defineModel<Set<string>>('open', { required: true })
const installed = computed(() => baseVersion(props.appVersion))

const items = computed(() =>
  props.notes.map((n) => ({ ...n, sections: n.sections.map((s) => ({ ...s, items: s.items.map(splitLead) })) })),
)

// Statische Klassennamen (Tailwind findet sie nur ausgeschrieben).
const DOT: Record<NoteKind, string> = { neu: 'bg-success', verbessert: 'bg-info', behoben: 'bg-warning' }

function toggle(version: string): void {
  const next = new Set(open.value)
  if (next.has(version)) next.delete(version)
  else next.add(version)
  open.value = next
}
</script>

<template>
  <!-- Zeitleiste: durchgehende Linie links, je Version ein Punkt (gefüllt = installiert). -->
  <ol class="relative flex flex-col gap-3">
    <span class="absolute bottom-4 left-[7px] top-4 w-px bg-base-300" aria-hidden="true"></span>
    <li v-for="note in items" :key="note.version" class="relative pl-7">
      <span
        class="absolute left-0 top-[18px] h-[15px] w-[15px] rounded-full border-2"
        :class="note.version === installed ? 'border-primary bg-primary' : 'border-base-300 bg-base-100'"
        aria-hidden="true"
      ></span>
      <section class="card bg-base-100 shadow-sm" :class="note.version === installed ? 'ring-1 ring-primary/40' : ''">
        <button
          type="button"
          class="flex min-h-11 w-full items-start justify-between gap-3 p-4 text-left"
          :aria-expanded="open.has(note.version)"
          :aria-controls="`v-${note.version}`"
          @click="toggle(note.version)"
        >
          <span class="flex min-w-0 flex-col gap-1.5">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-base font-semibold tabular-nums">{{ note.version }}</span>
              <span v-if="note.version === installed" class="badge badge-primary badge-sm">installiert</span>
            </span>
            <span v-if="note.summary" class="text-sm text-base-content/75" :class="open.has(note.version) ? '' : 'line-clamp-2'">{{ note.summary }}</span>
            <span class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/75">
              <span v-for="s in note.sections" :key="s.kind" class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full" :class="DOT[s.kind]" aria-hidden="true"></span>
                {{ s.items.length }} {{ s.label }}
              </span>
            </span>
          </span>
          <svg
            class="mt-1 h-4 w-4 shrink-0 text-base-content/75 transition-transform duration-200 motion-reduce:transition-none"
            :class="open.has(note.version) ? 'rotate-90' : ''"
            viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          ><path d="M6 3l5 5-5 5" /></svg>
        </button>

        <!-- Aufklappen über die Zeilenhöhe des Rasters: gleitet, ohne die Höhe messen zu müssen. -->
        <div
          :id="`v-${note.version}`"
          class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
          :class="open.has(note.version) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
          :aria-hidden="!open.has(note.version)"
        >
          <div class="overflow-hidden">
            <div class="flex flex-col gap-3 border-t border-base-200 px-4 pb-4 pt-3">
              <div v-for="s in note.sections" :key="s.kind" class="flex flex-col gap-1.5">
                <h4 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/75">
                  <span class="h-2 w-2 rounded-full" :class="DOT[s.kind]" aria-hidden="true"></span>
                  {{ s.label }}
                </h4>
                <ul class="flex flex-col gap-1.5 text-sm">
                  <li v-for="(item, i) in s.items" :key="i" class="flex gap-2">
                    <span class="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-base-content/40" aria-hidden="true"></span>
                    <span><strong v-if="item.lead" class="font-medium">{{ item.lead }}</strong>{{ item.lead ? ' ' : '' }}{{ item.text }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </li>
  </ol>
</template>
