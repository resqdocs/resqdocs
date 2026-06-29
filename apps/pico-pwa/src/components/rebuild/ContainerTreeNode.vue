<script setup lang="ts">
/** Rekursive Baum-Zeile (Container ODER Feld; self-reference ueber den Dateinamen). Aktionen
 *  rufen die zentrale Tree-API (provide/inject). Container: ＋ mit Typwahl (Container/Feld) +
 *  rekursive Kinder. Feld: Blatt (kein ＋, keine Kinder). :key="child.id" = stabile Wiederverwendung. */
import { ref, computed } from 'vue'
import type { Node, FunctionKind } from '@resqdocs/protocol-core/model'
import { useTreeEditor } from '@/rebuild/treeEditor'
import MoveToPicker from './MoveToPicker.vue'

const props = defineProps<{ node: Node; depth: number }>()
const tree = useTreeEditor()
const addOpen = ref(false)
const pickerOpen = ref(false)
// Loeschen ist irreversibel (kein Undo) + nimmt bei einem Container ALLE Kinder mit -> bewusste Bestaetigung.
const confirmOpen = ref(false)
// Aufklapprichtung des ＋-Menues: nach OBEN, wenn unter dem Button zu wenig Platz ist (weniger scrollen).
const addUp = ref(false)

function label(n: Node): string {
  return (n.title && n.title.trim()) || n.id
}
// Nach oben oeffnen, wenn unter dem Button weniger Platz ist als das Menue braucht UND oben mehr ist.
function shouldOpenUp(el: HTMLElement, estHeight: number): boolean {
  const rect = el.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom
  return below < estHeight && rect.top > below
}
function toggleAdd(e: MouseEvent): void {
  if (!addOpen.value) addUp.value = shouldOpenUp(e.currentTarget as HTMLElement, 190) // 4 Eintraege
  addOpen.value = !addOpen.value
}
function add(kind: 'container' | 'field' | 'function', functionKind?: FunctionKind): void {
  tree.addChild(props.node.id, kind, functionKind)
  addOpen.value = false
}

// Alle Nachfahren (rekursiv) mit Label + Typ - fuers Loesch-Confirm: zeigt, was MIT entfernt wird.
function collectDescendants(n: Node): { label: string; type: Node['type'] }[] {
  if (n.type !== 'container') return []
  const acc: { label: string; type: Node['type'] }[] = []
  for (const c of n.children) {
    acc.push({ label: label(c), type: c.type })
    acc.push(...collectDescendants(c))
  }
  return acc
}
const descendants = computed(() => collectDescendants(props.node))
// Im Confirm nur die ersten paar zeigen (sonst wird das Modal bei grossen Containern endlos lang).
const DESC_CAP = 3
const descendantsShown = computed(() => descendants.value.slice(0, DESC_CAP))
const descendantsMore = computed(() => Math.max(0, descendants.value.length - DESC_CAP))
function confirmDelete(): void {
  tree.remove(props.node.id)
  confirmOpen.value = false
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-0.5 rounded"
      :class="tree.isSelected(node.id) ? 'bg-primary/10' : 'hover:bg-base-200'"
      :style="{ paddingLeft: Math.min(depth, 8) * 10 + 4 + 'px' }"
    >
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left text-sm" @click="tree.select(node.id)">
        <span class="shrink-0 text-xs" :class="node.type === 'field' ? 'text-secondary' : node.type === 'function' ? 'text-accent' : 'text-base-content/40'" aria-hidden="true">{{ node.type === 'function' ? '⊕' : node.type === 'field' ? '◆' : '▸' }}</span>
        <span class="truncate" :class="tree.isSelected(node.id) ? 'font-medium' : ''">{{ label(node) }}</span>
        <span v-if="!node.title" class="shrink-0 text-xs text-base-content/40">{{ node.id }}</span>
      </button>

      <!-- nur Container koennen Kinder bekommen -->
      <div v-if="node.type === 'container'" class="relative">
        <button type="button" class="btn btn-ghost btn-xs px-1.5" aria-label="Element hinzufügen" title="Element hinzufügen" @click="toggleAdd">＋</button>
        <template v-if="addOpen">
          <button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="Menü schließen" @click="addOpen = false"></button>
          <div class="overlay-surface absolute right-0 z-20 flex w-44 flex-col rounded-box p-1" :class="addUp ? 'bottom-full mb-1' : 'mt-1'">
            <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('container')">Container</button>
            <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('field')">Feld</button>
            <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('function', 'medikamentenplan')">Medikamentenplan</button>
            <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('function', 'aerzte')">Ärzte</button>
          </div>
        </template>
      </div>

      <!-- Direkte Aktionen (Maintainer-Wahl): Verschieben-Icon oeffnet die Sitemap (positionsgenau, ersetzt
           Hoch/Runter), ✕ entfernt. Kein ⋮-Menue mehr. 44px-Ziele. -->
      <template v-if="depth > 0">
        <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :aria-label="`Verschieben: ${label(node)}`" title="Verschieben" @click="pickerOpen = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>
        </button>
        <button type="button" class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5 text-error" :aria-label="`Entfernen: ${label(node)}`" title="Entfernen" @click="confirmOpen = true">✕</button>
      </template>
    </div>

    <MoveToPicker v-if="pickerOpen" :node-id="node.id" :node-label="label(node)" @close="pickerOpen = false" />

    <!-- Loesch-Bestaetigung: irreversibel; bei einem Container werden alle Nachfahren mit-geloescht (Liste). -->
    <Teleport to="body">
      <div v-if="confirmOpen" class="modal modal-open" role="dialog" aria-modal="true">
        <div class="modal-box">
          <h3 class="text-base font-semibold">„{{ label(node) }}" löschen?</h3>
          <template v-if="descendants.length">
            <p class="pt-2 text-sm">
              Damit werden auch <strong>{{ descendants.length }}</strong> enthaltene Element{{ descendants.length === 1 ? '' : 'e' }} gelöscht:
            </p>
            <ul class="my-2 rounded-lg bg-base-200 p-2 text-sm">
              <li v-for="(d, i) in descendantsShown" :key="i" class="flex items-center gap-1.5">
                <span class="shrink-0 text-xs" :class="d.type === 'function' ? 'text-accent' : d.type === 'field' ? 'text-secondary' : 'text-base-content/40'" aria-hidden="true">{{ d.type === 'function' ? '⊕' : d.type === 'field' ? '◆' : '▸' }}</span>
                <span class="truncate">{{ d.label }}</span>
              </li>
              <li v-if="descendantsMore" class="pl-5 text-base-content/50">… und {{ descendantsMore }} weitere</li>
            </ul>
          </template>
          <p class="pt-1 text-sm text-base-content/70">Das lässt sich nicht rückgängig machen.</p>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost btn-sm" @click="confirmOpen = false">Abbrechen</button>
            <button type="button" class="btn btn-error btn-sm" @click="confirmDelete">Endgültig löschen</button>
          </div>
        </div>
        <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="confirmOpen = false"></button>
      </div>
    </Teleport>

    <template v-if="node.type === 'container'">
      <ContainerTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
    </template>
  </div>
</template>
