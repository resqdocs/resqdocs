<script setup lang="ts">
/**
 * Auswahl beim Import von Vorlagen - eine oder mehrere, egal ob Datei, Link, QR oder Einfügen. Gemeinsam für
 * App (ImportChoiceDialog) und Online-Editor (ImportDialog), damit beide gleich aussehen und sich gleich verhalten.
 *
 * Je Vorlage: übernehmen ja/nein, Name (vorausgefüllt, frei änderbar - „damit klar ist, was man importiert hat“,
 * Maintainer) und, nur wenn es den Namen schon gibt, „Als neue Vorlage“ (Standard, datensicher) oder
 * „Überschreiben“. Die Entscheidung setzt protocol-core/library.importWithChoices um.
 *
 * `blocked[i]` = Grund, warum Vorlage i nicht übernommen werden kann (z. B. zu neue Elemente) - nicht wählbar.
 */
import { computed } from 'vue'
import type { Container, Node } from '@resqdocs/protocol-core/model'
import type { PickRow } from '../importPick'

const props = defineProps<{ trees: readonly Container[]; existingTitles: readonly string[]; blocked?: readonly (string | null)[] }>()
const rows = defineModel<PickRow[]>('rows', { required: true })

const norm = (t: string | undefined): string => (t ?? '').trim().toLowerCase()
const existing = computed(() => new Set(props.existingTitles.map(norm)))
const countElements = (n: Node): number => (n.type === 'container' ? n.children.reduce((s, c) => s + 1 + countElements(c), 0) : 0)

const items = computed(() =>
  props.trees.map((t, i) => {
    const row = rows.value[i]
    const name = row?.name.trim() || t.title?.trim() || ''
    return {
      i,
      original: t.title?.trim() || 'ohne Titel',
      elements: countElements(t),
      clash: !!name && existing.value.has(norm(name)),
      shown: name || 'ohne Titel',
      blocked: props.blocked?.[i] ?? null,
    }
  }),
)
const selectable = computed(() => items.value.filter((x) => !x.blocked).map((x) => x.i))
const allTaken = computed(() => selectable.value.length > 0 && selectable.value.every((i) => rows.value[i]?.take))
const many = computed(() => props.trees.length > 1)

function patch(i: number, p: Partial<PickRow>): void {
  rows.value = rows.value.map((r, k) => (k === i ? { ...r, ...p } : r))
}
function toggleAll(): void {
  const on = !allTaken.value
  rows.value = rows.value.map((r, k) => (selectable.value.includes(k) ? { ...r, take: on } : r))
}
</script>

<template>
  <fieldset class="flex flex-col gap-2" data-import-pick>
    <div v-if="many" class="flex items-center justify-between gap-2">
      <legend class="text-sm font-medium">{{ trees.length }} Vorlagen enthalten. Welche übernehmen?</legend>
      <button type="button" class="btn btn-ghost btn-xs min-h-8" data-pick-all @click="toggleAll">{{ allTaken ? 'Keine' : 'Alle' }}</button>
    </div>
    <div class="flex max-h-[55vh] flex-col overflow-y-auto rounded border border-base-300">
      <div v-for="x in items" :key="x.i" class="flex items-start gap-3 border-b border-base-200 px-3 py-2 last:border-b-0" :class="x.blocked ? 'opacity-60' : ''" :data-pick-row="x.i">
        <input
          v-if="many"
          type="checkbox"
          class="checkbox checkbox-sm mt-2.5"
          :checked="rows[x.i]?.take"
          :disabled="!!x.blocked"
          :aria-label="`${x.original} übernehmen`"
          :data-pick-take="x.i"
          @change="patch(x.i, { take: ($event.target as HTMLInputElement).checked })"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <label class="flex flex-col gap-0.5">
            <span class="text-xs text-base-content/60">Name · {{ x.elements }} {{ x.elements === 1 ? 'Element' : 'Elemente' }}</span>
            <input
              class="input input-sm w-full"
              :value="rows[x.i]?.name"
              :placeholder="x.original"
              :disabled="!!x.blocked || !rows[x.i]?.take"
              :aria-label="`Name für ${x.original}`"
              :data-pick-name="x.i"
              @input="patch(x.i, { name: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <p v-if="x.blocked" class="text-xs text-warning">{{ x.blocked }}</p>
          <div v-else-if="x.clash && rows[x.i]?.take" class="flex flex-col gap-1" :data-pick-clash="x.i">
            <span class="text-xs text-base-content/70">Eine Vorlage „{{ x.shown }}“ gibt es schon.</span>
            <!-- Farben nach Bedeutung: die sichere Wahl grün, Überschreiben rot. Nicht btn-primary - die Hauptfarbe
                 des ResQDocs-Themes ist Rot und ließe „Als neue Vorlage“ wie eine Warnung aussehen. -->
            <div class="join w-full" role="group" :aria-label="`Was passiert mit „${x.shown}“?`">
              <button type="button" class="btn btn-xs join-item min-h-9 flex-1" :class="!rows[x.i]?.overwrite ? 'btn-success' : ''" :aria-pressed="!rows[x.i]?.overwrite" :data-pick-new="x.i" @click="patch(x.i, { overwrite: false })">Als neue Vorlage</button>
              <button type="button" class="btn btn-xs join-item min-h-9 flex-1" :class="rows[x.i]?.overwrite ? 'btn-error' : ''" :aria-pressed="!!rows[x.i]?.overwrite" :data-pick-overwrite="x.i" @click="patch(x.i, { overwrite: true })">Überschreiben</button>
            </div>
            <span class="text-xs" :class="rows[x.i]?.overwrite ? 'text-error' : 'text-base-content/60'">
              {{ rows[x.i]?.overwrite ? `Ersetzt die vorhandene Vorlage „${x.shown}“.` : `Kommt als „${x.shown} (Import)“ dazu, nichts wird überschrieben.` }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </fieldset>
</template>
