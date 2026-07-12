<script setup lang="ts">
/**
 * „Verschieben nach …" als SITEMAP mit positionsgenauen Einfuegestellen (sourced move-sitemap-picker).
 * Zeigt den ganzen Baum (Einrueckung wie ContainerTreeNode); zwischen/um die Eintraege liegen antippbare
 * Slots = Paar (targetParentId, index). Markieren + „Einfügen" (bewusst, kein Direkt-Tap, da kein Undo).
 * Der bewegte Knoten + sein Teilbaum sind kein Ziel; die zwei No-Op-Stellen an seiner aktuellen Position
 * sind unterdrueckt. KEINE neue Tree-Logik - nur das vorhandene reparent(id, parent, index).
 */
import { ref, computed } from 'vue'
import type { Node, Container } from '@resqdocs/protocol-core/model'
import { useTreeEditor } from '../treeEditor.ts'
import { parentOf } from '@resqdocs/protocol-core/creator'

const props = defineProps<{ nodeId: string; nodeLabel: string }>()
const emit = defineEmits<{ close: [] }>()
const tree = useTreeEditor()

const label = (n: Node): string => (n.title && n.title.trim()) || n.id
const icon = (n: Node): string => (n.type === 'function' ? '⊕' : n.type === 'field' ? '◆' : '▸')
const indent = (d: number): string => Math.min(d, 8) * 10 + 4 + 'px'

interface SlotRow { kind: 'slot'; parentId: string; index: number; depth: number; lineLabel: string; a11yLabel: string; key: string }
interface NodeRow { kind: 'node'; node: Node; depth: number; text: string; isMoving: boolean; key: string }
type Row = SlotRow | NodeRow

const movingParent = computed<Container | null>(() => parentOf(tree.root.value, props.nodeId) as Container | null)
const movingIndex = computed(() => (movingParent.value ? movingParent.value.children.findIndex((c) => c.id === props.nodeId) : -1))

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const mp = movingParent.value
  const mi = movingIndex.value
  const walk = (n: Node, depth: number): void => {
    const isMoving = n.id === props.nodeId
    out.push({ kind: 'node', node: n, depth, text: depth === 0 ? `⌂ ${label(n)}` : label(n), isMoving, key: `n:${n.id}` })
    if (n.type !== 'container' || isMoving) return // Blatt ODER bewegter Container: kein Ziel, keine Slots/Kinder
    const kids = n.children
    for (let k = 0; k <= kids.length; k++) {
      // No-Op-Stellen direkt um die aktuelle Position des bewegten Knotens unterdruecken.
      const suppressed = !!mp && n.id === mp.id && (k === mi || k === mi + 1)
      if (!suppressed) {
        const a11yLabel =
          kids.length === 0
            ? `Als Erstes in „${label(n)}“ einfügen`
            : k === kids.length
              ? `Als Letztes in „${label(n)}“ einfügen`
              : `Vor „${label(kids[k])}“ in „${label(n)}“ einfügen`
        const lineLabel =
          kids.length === 0 ? `in „${label(n)}“` : k === kids.length ? `ans Ende von „${label(n)}“` : `vor „${label(kids[k])}“`
        out.push({ kind: 'slot', parentId: n.id, index: k, depth: depth + 1, lineLabel, a11yLabel, key: `s:${n.id}:${k}` })
      }
      if (k < kids.length) walk(kids[k], depth + 1)
    }
  }
  walk(tree.root.value, 0)
  return out
})

const hasSlots = computed(() => rows.value.some((row) => row.kind === 'slot'))
const selectedKey = ref<string | null>(null)
const selected = computed<SlotRow | null>(() => {
  const r = rows.value.find((row) => row.kind === 'slot' && row.key === selectedKey.value)
  return r && r.kind === 'slot' ? r : null
})

function confirm(): void {
  const s = selected.value
  if (!s) return
  let index = s.index
  // Gleicher Eltern-Container: reparent entfernt die Quelle zuerst -> Indizes HINTER ihr rutschen um 1.
  if (movingParent.value && s.parentId === movingParent.value.id && index > movingIndex.value) index -= 1
  tree.reparent(props.nodeId, s.parentId, index)
  emit('close')
}
</script>

<template>
  <div class="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true">
    <div class="modal-box flex max-h-[80vh] flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
      <h3 class="text-base font-semibold">„{{ nodeLabel }}" verschieben nach …</h3>
      <p class="text-xs text-base-content/60">Tippe die Stelle an (＋), an der „{{ nodeLabel }}" landen soll, dann „Einfügen".</p>

      <!-- Bewusst KEINE role=tree: kein Tree-Tastaturmodell noetig; Slots sind klar beschriftete Buttons,
           Knotenzeilen reine Struktur-Anzeige (sourced move-picker-verify). -->
      <ul class="flex-1 overflow-y-auto p-0" aria-label="Zielpositionen im Baum">
        <template v-for="row in rows" :key="row.key">
          <!-- Einfuegestelle: sichtbar duenne Linie + ＋-Chip, aber 44px Trefferflaeche -->
          <li v-if="row.kind === 'slot'">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 pr-2"
              :style="{ paddingLeft: indent(row.depth) }"
              :aria-label="row.a11yLabel"
              :aria-current="selectedKey === row.key ? 'true' : undefined"
              @click="selectedKey = row.key"
            >
              <span
                class="grid size-4 shrink-0 place-items-center rounded-full text-[10px] leading-none"
                :class="selectedKey === row.key ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/50'"
                aria-hidden="true"
              >＋</span>
              <span class="flex-1 rounded-full" :class="selectedKey === row.key ? 'h-0.5 bg-primary' : 'h-px bg-base-content/15'"></span>
              <span v-if="selectedKey === row.key" class="shrink-0 truncate text-xs font-medium text-primary">{{ row.lineLabel }}</span>
            </button>
          </li>

          <!-- Knotenzeile: rein darstellend; bewegter Knoten gedimmt + markiert -->
          <li v-else :style="{ paddingLeft: indent(row.depth) }" :class="row.isMoving ? 'opacity-40' : ''">
            <div class="flex items-center gap-1 py-1.5 text-sm">
              <span class="shrink-0 text-xs" :class="row.node.type === 'field' ? 'text-secondary' : row.node.type === 'function' ? 'text-accent' : 'text-base-content/40'" aria-hidden="true">{{ icon(row.node) }}</span>
              <span class="truncate" :class="row.depth === 0 ? 'font-medium' : ''">{{ row.text }}</span>
              <span v-if="row.isMoving" class="ml-auto shrink-0 text-xs text-base-content/50">(wird verschoben)</span>
            </div>
          </li>
        </template>
      </ul>
      <p v-if="!hasSlots" class="px-2 py-3 text-center text-sm text-base-content/50">Keine andere Position möglich.</p>

      <div class="flex items-center justify-between gap-2">
        <p class="min-w-0 flex-1 truncate text-xs text-base-content/70" aria-live="polite">{{ selected?.a11yLabel ?? 'Position wählen …' }}</p>
        <div class="flex shrink-0 gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="!selected" @click="confirm">Einfügen</button>
        </div>
      </div>
    </div>
    <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="emit('close')"></button>
  </div>
</template>
