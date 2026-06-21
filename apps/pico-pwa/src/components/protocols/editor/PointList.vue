<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import { POINT_TYPES } from '@resqdocs/protocol-core/creator/creator.mjs'
import type { ValidationIssue } from '@resqdocs/protocol-core/creator/creator.mjs'

const { currentBlock, selectedPointId, selectPoint, addPoint, duplicatePoint, removePoint, movePoint, validation } =
  useCreatorSessionCtx()

/**
 * Feldscharfe Zuordnung (#2b): Befunde aus validation.issues dem verursachenden
 * Punkt zuordnen. Punkt-ids sind protokollweit eindeutig; zusätzlich gegen die
 * aktuelle Block-id geprüft. Nur Anzeige — keine eigene Validierungslogik.
 */
const issuesByPoint = computed(() => {
  const map = new Map<string, ValidationIssue[]>()
  for (const it of validation.value?.issues ?? []) {
    if (!it.pointId || (it.blockId && it.blockId !== currentBlock.value?.id)) continue
    const list = map.get(it.pointId) ?? []
    list.push(it)
    map.set(it.pointId, list)
  }
  return map
})
function pointIssues(p: { id?: string }): ValidationIssue[] {
  return (p.id && issuesByPoint.value.get(p.id)) || []
}

const TYPE_LABELS: Record<string, string> = {
  field: 'Feld',
  finding: 'Befund',
  findingGroup: 'Befundgruppe',
  list: 'Liste',
  text: 'Text',
  medikamente: 'Medikamente',
}
const newType = ref<string>('field')

const TYPE_BADGE: Record<string, string> = {
  field: 'Feld',
  finding: 'Befund',
  findingGroup: 'Gruppe',
  list: 'Liste',
  text: 'Text',
  medikamente: 'Medikation',
}
function pointLabel(p: { type?: string; title?: string; label?: string; key?: string }): string {
  return (p.title as string) || (p.label as string) || (p.key as string) || TYPE_LABELS[p.type ?? ''] || (p.type ?? 'Punkt')
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h4 class="font-medium">Punkte</h4>
      <div class="flex gap-1">
        <select v-model="newType" class="select select-bordered select-xs" aria-label="Punkt-Typ">
          <option v-for="t in POINT_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
        </select>
        <button class="btn btn-primary btn-xs" type="button" @click="addPoint(newType)">+ Punkt</button>
      </div>
    </div>

    <ul class="flex flex-col gap-1">
      <li
        v-for="(p, i) in currentBlock?.points ?? []"
        :key="(p.id as string) ?? `p-${i}`"
        class="flex items-center gap-2 rounded border border-base-300 px-2 py-1"
        :class="{ 'border-primary': p.id === selectedPointId }"
      >
        <button type="button" class="min-w-0 flex-1 truncate text-left text-sm" @click="selectPoint(p.id as string)">
          <span class="badge badge-ghost badge-sm mr-2 shrink-0">{{ TYPE_BADGE[p.type as string] ?? p.type }}</span>
          {{ pointLabel(p) }}
        </button>
        <!-- Feldscharfer Validierungs-Marker (#2b): nur Anzeige, dezent -->
        <span
          v-if="pointIssues(p).length"
          class="badge badge-xs shrink-0"
          :class="pointIssues(p).some((x) => x.severity === 'error') ? 'badge-error' : 'badge-warning'"
          :title="pointIssues(p).map((x) => x.message).join('\n')"
          :aria-label="`${pointIssues(p).length} Validierungs-Hinweis(e): ${pointIssues(p).map((x) => x.message).join('; ')}`"
        >!</span>
        <!-- Umsortieren (#46) -->
        <button class="btn btn-ghost btn-xs px-1" type="button" :disabled="i === 0" :aria-label="`${pointLabel(p)} nach oben`" @click="movePoint(p.id as string, 'up')">↑</button>
        <button class="btn btn-ghost btn-xs px-1" type="button" :disabled="i === (currentBlock?.points?.length ?? 0) - 1" :aria-label="`${pointLabel(p)} nach unten`" @click="movePoint(p.id as string, 'down')">↓</button>
        <button class="btn btn-ghost btn-xs" type="button" title="Duplizieren" @click="duplicatePoint(p.id as string)">⧉</button>
        <button class="btn btn-ghost btn-xs text-error" type="button" title="Löschen" @click="removePoint(p.id as string)">✕</button>
      </li>
      <li v-if="!(currentBlock?.points ?? []).length" class="px-1 py-1 text-sm text-base-content/60">
        Noch keine Punkte in diesem Block.
      </li>
    </ul>
  </div>
</template>
