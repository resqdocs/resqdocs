<script setup lang="ts">
/** Rekursive Baum-Zeile (Container ODER Feld; self-reference ueber den Dateinamen). Aktionen
 *  rufen die zentrale Tree-API (provide/inject). Container: ＋ mit Typwahl (Container/Feld) +
 *  rekursive Kinder. Feld: Blatt (kein ＋, keine Kinder). :key="child.id" = stabile Wiederverwendung. */
import { nodeLabel } from '../nodeLabel'
import { ref, computed, inject, nextTick, useId } from 'vue'
import type { Node, FunctionKind } from '@resqdocs/protocol-core/model'
import { FUNCTION_KINDS, FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import { useTreeEditor } from '../treeEditor.ts'
import { useTreeFoldApi, countDescendants } from '../treeFold.ts'
import { snippetPickerKey, allowedFunctionKindsKey } from '../injection.ts'
import MoveToPicker from './MoveToPicker.vue'
import BlockPicker from './BlockPicker.vue'
import InfoTip from './InfoTip.vue'
import { INFO } from '../terms.ts'
import type { Container } from '@resqdocs/protocol-core/model'

// Snippet-Auswahl wird vom Host injiziert (App: SnippetPicker über die Bausteine-Sammlung); ohne sie
// entfällt „Textbaustein einfügen" (der Online-Editor kann später eine eigene Quelle bereitstellen).
const SnippetPicker = inject(snippetPickerKey, null)

// Versions-Gating der Funktionen: der Online-Editor stellt die für die gewählte App-Version anbietbaren
// functionKinds bereit; fehlt der Provider (Mobile-App = eigene Version), sind ALLE erlaubt.
const allowedKinds = inject(allowedFunctionKindsKey, null)
const ALL_FUNCTION_KINDS: FunctionKind[] = FUNCTION_KINDS // eine Quelle mit dem Online-Editor
function kindAllowed(k: FunctionKind): boolean {
  return !allowedKinds || allowedKinds.value.includes(k)
}
const anyFunctionAllowed = computed(() => ALL_FUNCTION_KINDS.some(kindAllowed))

import { clozeEditRequest } from '../clozeEditRequest.ts'
const props = defineProps<{ node: Node; depth: number }>()
const tree = useTreeEditor()
// Einklappen im Aufbau (nur Ansicht). Einklappen lässt sich jeder Abschnitt unter der Wurzel, der etwas enthält.
const fold = useTreeFoldApi()
const canFold = computed(() => props.node.type === 'container' && props.depth > 0 && props.node.children.length > 0)
const isFolded = computed(() => canFold.value && fold.isFolded(props.node.id))
const foldedCount = computed(() => (isFolded.value ? countDescendants(props.node) : 0))
const addOpen = ref(false)
const pickerOpen = ref(false)
const snippetPickerOpen = ref(false)
const blockPickerOpen = ref(false)
// Aktionen der Zeile (Verschieben, Duplizieren, Löschen) stehen hinter EINEM Mehr-Knopf in einem Blatt von unten,
// wie das Menü je Vorlage. Löschen fragt nicht nach: Der Host macht es rückgängig (Meldung mit „Rückgängig“).
const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)
const menuTitleId = useId()
// Aufklapprichtung des ＋-Menues: nach OBEN, wenn unter dem Button zu wenig Platz ist (weniger scrollen).
const addUp = ref(false)
// Hoehenbegrenzung des ＋-Menues (px): passt es nicht ganz in den sichtbaren Bereich, scrollt es in sich.
const addMaxH = ref<number | null>(null)
// Seitlicher Versatz: das Menü hängt rechts am ＋. Bei eingerückten Zeilen läge es sonst links aus dem Bild.
const addShift = ref(0)
const addAnchor = ref<HTMLElement | null>(null)
const addMenu = ref<HTMLElement | null>(null)
// Zwei-Stufen-＋-Menü: die vier Funktionen sind unter „Funktion" gebündelt, damit die Liste kurz bleibt.
const addView = ref<'root' | 'functions'>('root')

const label = (n: Node): string => nodeLabel(n)
// Sichtbarer Bereich ohne die feststehenden Leisten des Hosts (App: Kopfzeile sticky, Dock fixed unten).
// Sonst klappt das Menue hinter die Navigationsleiste und die unteren Eintraege sind nicht erreichbar.
// Die App scrollt jeden Tab in einem eigenen Bereich (data-tab-scroll) zwischen Kopfzeile und Tab-Leiste: das
// Menue liegt darin und endet an dessen Rand.
function visibleBand(): { top: number; bottom: number } {
  const vv = window.visualViewport
  let top = vv ? vv.offsetTop : 0
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const area = addAnchor.value?.closest('[data-tab-scroll]')?.getBoundingClientRect()
  if (area) {
    top = Math.max(top, area.top)
    bottom = Math.min(bottom, area.bottom)
  }
  for (const el of document.querySelectorAll<HTMLElement>('header, .dock')) {
    const pos = getComputedStyle(el).position
    if (pos !== 'sticky' && pos !== 'fixed') continue
    const r = el.getBoundingClientRect()
    if (r.height === 0) continue
    if (r.top <= top + 1 && r.bottom > top) top = r.bottom
    else if (r.bottom >= bottom - 1 && r.top < bottom) bottom = r.top
  }
  return { top, bottom }
}
// Richtung und Hoehe aus der GEMESSENEN Menuehoehe (Touch-Buttons sind 44 px hoch, eine Schaetzung
// lag daneben). Nach oben, wenn unten zu wenig Platz ist UND oben mehr; passt es auf keiner Seite,
// wird es auf den Platz begrenzt und scrollt.
async function placeAdd(): Promise<void> {
  await nextTick()
  const anchor = addAnchor.value
  const menu = addMenu.value
  if (!anchor || !menu) return
  const MARGIN = 8
  const rect = anchor.getBoundingClientRect()
  const band = visibleBand()
  const below = band.bottom - rect.bottom - MARGIN
  const above = rect.top - band.top - MARGIN
  const need = menu.scrollHeight
  addUp.value = need > below && above > below
  addMaxH.value = Math.max(120, Math.floor(addUp.value ? above : below))
  // Waagerecht im Bild halten (Abstand 8 px zu beiden Rändern).
  addShift.value = 0
  await nextTick()
  const m = menu.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  if (m.left < MARGIN) addShift.value = MARGIN - m.left
  else if (m.right > vw - MARGIN) addShift.value = vw - MARGIN - m.right
}
function closeAdd(): void {
  addOpen.value = false
  addView.value = 'root' // nächstes Öffnen startet wieder auf der Hauptebene
}
function toggleAdd(): void {
  if (!addOpen.value) {
    addView.value = 'root'
    addUp.value = false
    addMaxH.value = null
    addShift.value = 0
  }
  addOpen.value = !addOpen.value
  if (addOpen.value) void placeAdd()
}
function showAddView(view: 'root' | 'functions'): void {
  addView.value = view
  void placeAdd()
}
function add(kind: 'container' | 'field' | 'function', functionKind?: FunctionKind): void {
  tree.addChild(props.node.id, kind, functionKind)
  closeAdd()
}
/** Lückentext = ein Abschnitt, der einen Text mit Lücken ausgibt. Nach dem Anlegen öffnet sich das Einrichten. */
function addCloze(): void {
  const before = tree.selectedId.value
  tree.addChild(props.node.id, 'container')
  const id = tree.selectedId.value
  if (id && id !== before && id !== props.node.id) {
    tree.update(id, { title: 'Lückentext', cloze: { parts: [] } })
    clozeEditRequest.value = id
  }
  closeAdd()
}
function openSnippetPicker(): void {
  closeAdd()
  snippetPickerOpen.value = true
}
// Snippet als Feld-Vorgabe an diesen Container haengen (default=Text, ohne Titel; editier-/ausschliessbar).
function onInsertSnippet(text: string): void {
  tree.insertSnippet(props.node.id, text)
  snippetPickerOpen.value = false
}
function openBlockPicker(): void {
  closeAdd()
  blockPickerOpen.value = true
}
// Bibliotheks-Block als Kind an diesen Container einfuegen (kollisionsfrei re-IDt; Kopie, keine Referenz).
function onInsertBlock(block: Container): void {
  tree.insertBlock(props.node.id, block)
  blockPickerOpen.value = false
}

// Schließen ohne Aktion: Der Fokus geht zurück an den Knopf, der das Blatt geöffnet hat.
function closeMenu(): void {
  menuOpen.value = false
  void nextTick(() => menuButton.value?.focus())
}
function menuMove(): void {
  menuOpen.value = false
  pickerOpen.value = true
}
function menuDuplicate(): void {
  menuOpen.value = false
  tree.duplicate?.(props.node.id)
}
function menuDelete(): void {
  menuOpen.value = false
  tree.remove(props.node.id)
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-0.5 rounded"
      :class="[tree.isSelected(node.id) ? 'bg-primary/10' : 'hover:bg-base-200', depth === 0 ? 'pl-1' : '']"
    >
      <!-- Pfeil klappt den Abschnitt (bleibt im Aufbau); 44 px Tippfläche, ragt nach links in den Rand. Der Name
           daneben wählt wie bisher aus und springt zu den Eigenschaften. -->
      <button
        v-if="canFold"
        type="button"
        class="-ml-3.5 flex h-11 w-11 shrink-0 items-center justify-center rounded text-base-content"
        :aria-expanded="!isFolded"
        :aria-label="`${isFolded ? 'Ausklappen' : 'Einklappen'}: ${label(node)}`"
        :title="isFolded ? 'Ausklappen' : 'Einklappen'"
        data-tree-fold
        @click="fold.toggle(node.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-[1.2rem] transition-transform motion-reduce:transition-none" :class="isFolded ? '' : 'rotate-90'" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" /></svg>
      </button>
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left text-sm" @click="tree.select(node.id)">
        <span v-if="!canFold || (node.type === 'container' && node.cloze)" class="shrink-0 text-xs" :class="[node.type === 'field' ? 'text-secondary' : node.type === 'function' ? 'text-accent' : 'text-base-content/75', depth > 0 && !canFold ? 'mr-3 w-4 text-center' : '']" aria-hidden="true">{{ node.type === 'function' ? '⊕' : node.type === 'field' ? '◆' : node.cloze ? '¶' : '▸' }}</span><span v-if="node.type === 'container' && node.cloze" class="sr-only">Lückentext:</span>
        <span class="truncate" :class="depth > 0 && node.type === 'container' ? 'font-semibold' : tree.isSelected(node.id) ? 'font-medium' : ''">{{ label(node) }}</span>
        <span v-if="!node.title" class="shrink-0 text-xs text-base-content/75">{{ node.id }}</span>
      </button>
      <span v-if="isFolded" class="shrink-0 rounded-full bg-base-200 px-1.5 text-xs leading-5 tabular-nums text-base-content/80" :title="foldedCount === 1 ? '1 Element' : `${foldedCount} Elemente`" data-tree-folded-count>{{ foldedCount }}<span class="sr-only">{{ foldedCount === 1 ? ' Element' : ' Elemente' }}</span></span>

      <!-- nur Container koennen Kinder bekommen -->
      <div v-if="node.type === 'container'" ref="addAnchor" class="relative">
        <button type="button" class="btn btn-ghost btn-xs min-w-11 px-1.5!" aria-label="Element hinzufügen" title="Element hinzufügen" @click="toggleAdd">＋</button>
        <template v-if="addOpen">
          <button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="Menü schließen" @click="closeAdd"></button>
          <div
            ref="addMenu"
            class="overlay-surface absolute right-0 z-20 flex w-56 flex-col *:shrink-0 overflow-y-auto overscroll-contain rounded-box p-1"
            :class="addUp ? 'bottom-full mb-1' : 'mt-1'"
            :style="{ maxHeight: addMaxH ? addMaxH + 'px' : undefined, transform: addShift ? `translateX(${addShift}px)` : undefined }"
          >
            <!-- Hauptebene: die vier Funktionen sind unter „Funktion" gebündelt, damit die Liste kurz bleibt -->
            <template v-if="addView === 'root'">
              <div class="flex min-h-9 items-center justify-between pl-2 text-xs font-semibold text-base-content/75">Hinzufügen<InfoTip :info="INFO.addMenu" /></div>
              <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('container')">Abschnitt</button>
              <button type="button" class="btn btn-ghost btn-xs justify-start" @click="add('field')">Feld</button>
              <button type="button" class="btn btn-ghost btn-xs justify-start" data-add-cloze @click="addCloze">Lückentext</button>
              <button v-if="anyFunctionAllowed" type="button" class="btn btn-ghost btn-xs justify-between" @click="showAddView('functions')">Funktion<span class="text-base-content/75" aria-hidden="true">›</span></button>
              <button v-if="SnippetPicker" type="button" class="btn btn-ghost btn-xs justify-start" @click="openSnippetPicker">Textbaustein</button>
              <button type="button" class="btn btn-ghost btn-xs justify-start" @click="openBlockPicker">Gespeicherter Abschnitt</button>
            </template>
            <!-- Funktions-Auswahl: kurze Abfrage, welche Funktion eingefügt werden soll -->
            <template v-else>
              <button type="button" class="btn btn-ghost btn-xs justify-start gap-1 text-base-content/75" @click="showAddView('root')"><span aria-hidden="true">‹</span> zurück</button>
              <!-- Beschriftung aus der Registry: derselbe Name, den die neue Funktion als Titel bekommt
                   (createFunction). Vorher stand hier „Ärzte", eingefuegt wurde „Ärzte & Kontaktpersonen". -->
              <template v-for="k in ALL_FUNCTION_KINDS" :key="k">
                <!-- Lange Namen („Sgarbossa (mod. nach Smith)") brechen um: Knöpfe zentrieren Text sonst,
                     darum links ausrichten und die Höhe mitwachsen lassen. -->
                <button v-if="kindAllowed(k)" type="button" class="btn btn-ghost btn-xs h-auto min-h-6 justify-start py-1 text-left leading-tight" @click="add('function', k)">{{ FUNCTION_REGISTRY[k].label }}</button>
              </template>
            </template>
          </div>
        </template>
      </div>

      <!-- Ein Mehr-Knopf statt dreier Symbol-Knöpfe (Maintainer 2026-11-25, Quellen in docs/sources.md): Der Titel
           bekommt 88 px mehr Platz, die Aktionen stehen als Wörter im Blatt, Löschen liegt nicht mehr neben
           Duplizieren. Dasselbe Zeichen und dieselbe Größe wie am Menü je Vorlage; 44-px-Tippfläche. -->
      <button
        v-if="depth > 0"
        ref="menuButton"
        type="button"
        class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5! text-base-content/75"
        :aria-label="`Aktionen für ${label(node)}`"
        title="Aktionen"
        aria-haspopup="dialog"
        :aria-expanded="menuOpen"
        data-tree-more
        @click="menuOpen = true"
      >
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" /></svg>
      </button>
    </div>

    <MoveToPicker v-if="pickerOpen" :node-id="node.id" :node-label="label(node)" @close="pickerOpen = false" />
    <component :is="SnippetPicker" v-if="SnippetPicker && snippetPickerOpen" title="Textbaustein als Feld einfügen" @select="onInsertSnippet" @close="snippetPickerOpen = false" />
    <BlockPicker v-if="blockPickerOpen" title="Gespeicherten Abschnitt einfügen" @select="onInsertBlock" @close="blockPickerOpen = false" />

    <!-- Blatt von unten mit den Aktionen der Zeile (wie das Menü je Vorlage). Löschen steht zuletzt und in Rot. -->
    <Teleport to="body">
      <div v-if="menuOpen" class="modal modal-open modal-bottom" role="dialog" aria-modal="true" :aria-labelledby="menuTitleId" data-tree-menu>
        <div class="modal-box pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <h3 :id="menuTitleId" class="truncate text-sm font-semibold">{{ label(node) }}</h3>
          <ul class="menu w-full px-0">
            <li><button type="button" class="min-h-12" data-tree-menu-move @click="menuMove">Verschieben nach …</button></li>
            <li v-if="tree.duplicate"><button type="button" class="min-h-12" data-tree-menu-duplicate @click="menuDuplicate">Duplizieren</button></li>
            <li><button type="button" class="min-h-12 text-error" data-tree-menu-delete @click="menuDelete">Löschen</button></li>
          </ul>
          <button type="button" class="btn btn-ghost btn-block" @click="closeMenu">Schließen</button>
        </div>
        <button type="button" class="modal-backdrop" aria-label="Schließen" @click="closeMenu"></button>
      </div>
    </Teleport>

    <template v-if="node.type === 'container' && !isFolded">
      <!-- Führungslinie unter dem Pfeil: alles rechts davon gehört zu diesem Abschnitt. Je Ebene 12 px, ab der
           neunten Ebene rückt nichts weiter ein (wie bisher), damit Name und Knöpfe am Handy Platz behalten. -->
      <div data-tree-children :class="depth > 0 && depth <= 8 ? 'ml-[7px] border-l-2 border-base-content/20 pl-[3px]' : ''">
        <ContainerTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
      </div>
    </template>
  </div>
</template>
