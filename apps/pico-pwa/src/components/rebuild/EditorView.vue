<script setup lang="ts">
/**
 * Vorlagen-Editor - Neuaufbau, Slice 1: der rekursive Container.
 * Schreibt den GETEILTEN Protokoll-Baum (useProtocolTree) - dieselbe Definition, die der
 * Einsatz liest (eine Quelle der Wahrheit). Editor-lokal sind nur Auswahl + Segment-Ansicht.
 * Small-screen-first: drei Segmente (Aufbau / Eigenschaften / Vorschau) einzeln am Handy,
 * ab lg drei Spalten. Zentrale Tree-API per provide/inject an die rekursiven Knoten.
 */
import { ref, computed, provide, toRaw, watch, onMounted, onUnmounted } from 'vue'
import { useTreeHistory } from '@resqdocs/protocol-core-ui/useTreeHistory'
import { duplicateNode } from '@resqdocs/protocol-core/treeOps'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { findNode, collectIds, canMoveUp as canMoveUpOp, canMoveDown as canMoveDownOp, canIndent as canIndentOp, canOutdent as canOutdentOp, moveTargets as moveTargetsOp } from '@resqdocs/protocol-core/creator'
import { TREE_EDITOR, type TreeEditorApi } from '@resqdocs/protocol-core-ui/treeEditor'
import { TREE_FOLD, sectionIds, useTreeFold } from '@resqdocs/protocol-core-ui/treeFold'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import type { Container } from '@resqdocs/protocol-core/model'
import ContainerTreeNode from '@resqdocs/protocol-core-ui/components/ContainerTreeNode.vue'
import ContainerProperties from '@resqdocs/protocol-core-ui/components/ContainerProperties.vue'
import ContainerPreview from '@resqdocs/protocol-core-ui/components/ContainerPreview.vue'
import LibraryBar from './LibraryBar.vue'
import AiToolNotice from './AiToolNotice.vue'
import SnippetPicker from '@resqdocs/protocol-core-ui/components/SnippetPicker.vue'
import { snippetPickerKey } from '@resqdocs/protocol-core-ui/injection'

const tree = useProtocolTree()
const caseValues = useCaseValues()
const blocks = useBlockLibrary()
const root = tree.root
const selectedId = ref<string | null>(root.value.id)
const view = ref<'aufbau' | 'eigenschaften' | 'vorschau'>('aufbau')
// Rückgängig/Wiederholen wie im Online-Editor (gemeinsamer Verlauf). Jede Änderung am Baum läuft über change();
// Tipp-Folgen an derselben Eigenschaft zählen als ein Schritt.
const hist = useTreeHistory(tree, selectedId)
const change = hist.change
// Abschnitte im Aufbau einklappen (nur Ansicht, je Vorlage gemerkt, solange die App offen ist). Was neu eingefügt,
// gewählt oder verschoben wird, klappt seine Abschnitte auf, damit es zu sehen ist.
const fold = useTreeFold(tree.editorActiveId, root)
provide(TREE_FOLD, fold)
watch(selectedId, (id) => id && fold.reveal(id))
const hasSections = computed(() => sectionIds(root.value).length > 0)

// Ab lg alle drei Segmente gleichzeitig; darunter nur das aktive. Reaktiv per matchMedia (lg=1024px),
// damit die teuren Ganzbaum-Segmente (Aufbau/Vorschau) mobil per v-if GAR NICHT gemountet sind, wenn man
// in "Eigenschaften" editiert. Sonst laeuft bei JEDEM Property-Toggle das render()-computed der Vorschau
// (ContainerPreview) + der rekursive Baum-Diff ueber das GANZE Protokoll mit (immutable Root-Swap) -> spuerbarer
// Jank/Reflow bei grossen Protokollen. Eigenschaften bleibt bewusst via hidden-Klasse gemountet (kein State-Reset).
const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null
const isLg = ref(mql?.matches ?? false)
function onLgChange(): void {
  isLg.value = mql?.matches ?? false
}
onMounted(() => mql?.addEventListener('change', onLgChange))
onUnmounted(() => mql?.removeEventListener('change', onLgChange))

const api: TreeEditorApi = {
  selectedId,
  root,
  isSelected: (id) => selectedId.value === id,
  select(id) {
    selectedId.value = id
    view.value = 'eigenschaften'
  },
  selectProtocol(id) {
    tree.selectEditor(id) // editorActiveId = id
    selectedId.value = tree.root.value.id // neue aktive Wurzel
    view.value = 'aufbau'
  },
  update(id, patch) {
    const newId = patch.id
    change(`u:${id}:${Object.keys(patch).sort().join(',')}`, () => tree.update(id, patch))
    // id ist der Key im Einsatz-Werte-Store -> beim Umbenennen den Wert mit-migrieren.
    if (typeof newId === 'string' && newId.length > 0 && newId !== id) {
      caseValues.rename(id, newId)
      fold.rename(id, newId) // ein eingeklappter Abschnitt bleibt eingeklappt
      if (selectedId.value === id) selectedId.value = newId
    }
  },
  transform(fn) {
    change(null, () => tree.replace(fn(tree.root.value)))
  },
  addChild(parentId, kind, functionKind) {
    let childId = ''
    change(null, () => (childId = tree.addChild(parentId, kind, functionKind).id))
    selectedId.value = childId
    view.value = 'eigenschaften'
  },
  insertSnippet(parentId, text) {
    let childId = ''
    change(null, () => (childId = tree.insertSnippet(parentId, text).id))
    selectedId.value = childId
    view.value = 'eigenschaften'
  },
  insertBlock(parentId, block) {
    let childId = ''
    change(null, () => (childId = tree.insertBlock(parentId, block).id))
    selectedId.value = childId
    view.value = 'eigenschaften'
  },
  async saveContainerAsBaustein(id) {
    const live = findNode(root.value, id)
    if (!live || live.type !== 'container' || id === root.value.id) {
      return { ok: false, error: 'Nur ein Abschnitt lässt sich für andere Vorlagen speichern, nicht die ganze Vorlage.' }
    }
    // toRaw + JSON-Klon: entproxyt den reaktiven Baum (structuredClone wuerfe DataCloneError) und
    // entkoppelt den Baustein von der Vorlage - spaetere Editor-Aenderungen wirken nicht zurueck.
    const copy = JSON.parse(JSON.stringify(toRaw(live))) as Container
    return blocks.addBausteinFromContainer(copy, live.title ?? 'Abschnitt')
  },
  remove(id) {
    if (id === root.value.id) return
    const node = findNode(root.value, id)
    change(null, () => tree.remove(id))
    caseValues.drop(node ? collectIds(node) : [id]) // verwaiste Einsatz-Werte (inkl. Gesundheitsdaten) mit raus
    if (selectedId.value === id) selectedId.value = root.value.id
  },
  move(childId, delta) {
    change(null, () => tree.move(childId, delta))
    fold.reveal(childId)
  },
  moveUp(id) {
    change(null, () => tree.moveUp(id))
    fold.reveal(id)
  },
  moveDown(id) {
    change(null, () => tree.moveDown(id))
    fold.reveal(id)
  },
  indent(id) {
    change(null, () => tree.indent(id))
    fold.reveal(id)
  },
  outdent(id) {
    change(null, () => tree.outdent(id))
    fold.reveal(id)
  },
  reparent(id, targetParentId, index) {
    change(null, () => tree.reparent(id, targetParentId, index))
    fold.reveal(id)
  },
  duplicate(id) {
    if (id === root.value.id) return
    const result = duplicateNode(root.value, id, tree.nextId)
    if (!result) return
    change(null, () => tree.replace(result.root))
    selectedId.value = result.copyId
  },
  canMoveUp(id) {
    return canMoveUpOp(root.value, id)
  },
  canMoveDown(id) {
    return canMoveDownOp(root.value, id)
  },
  canIndent(id) {
    return canIndentOp(root.value, id)
  },
  canOutdent(id) {
    return canOutdentOp(root.value, id)
  },
  moveTargets(id) {
    return moveTargetsOp(root.value, id)
  },
}
provide(TREE_EDITOR, api)
// Snippet-Auswahl für die Baum-Knoten bereitstellen (App-Bausteine-Sammlung); der Online-Editor liefert
// hier später seine eigene Quelle oder nichts (dann entfällt „Snippet einfügen").
provide(snippetPickerKey, SnippetPicker)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Vorlagen-Bibliothek: auswaehlen/anlegen/umbenennen/duplizieren/loeschen + Save-Status -->
    <LibraryBar />

    <!-- KI-Empfehlung fuer die erste Vorlage (einmalig wegklickbar) -->
    <AiToolNotice />

    <p class="text-sm text-base-content/75">
      Abschnitte anlegen, verschachteln und konfigurieren. Die Vorschau zeigt den Protokolltext.
    </p>

    <!-- small-screen-first: ein Bereich nach dem anderen; ab lg alle drei nebeneinander -->
    <!-- Umschalter: oben zentriert + sticky (unter dem App-Header, Safe-Area beachtet).
         Nur < lg (ab lg drei Spalten nebeneinander). Volle Breite (-mx-4), damit ↶/↷ mit 44 px und die drei
         Knöpfe (13 px wie ein iOS-Segment) auch bei 360 px passen und nichts seitlich durchscheint. -->
    <div class="sticky top-[calc(env(safe-area-inset-top,0px)+4rem)] z-[5] -mx-4 flex items-center justify-center gap-0.5 bg-base-200/95 px-1 py-2 backdrop-blur-sm lg:hidden">
      <button class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :disabled="!hist.canUndo.value" aria-label="Rückgängig" title="Rückgängig" data-undo @click="hist.undo()">↶</button>
      <div class="join">
        <button class="btn btn-sm join-item px-2! text-[13px]!" :class="view === 'aufbau' ? 'btn-primary' : ''" @click="view = 'aufbau'">Aufbau</button>
        <button class="btn btn-sm join-item px-2! text-[13px]!" :class="view === 'eigenschaften' ? 'btn-primary' : ''" @click="view = 'eigenschaften'">Eigenschaften</button>
        <button class="btn btn-sm join-item px-2! text-[13px]!" :class="view === 'vorschau' ? 'btn-primary' : ''" @click="view = 'vorschau'">Vorschau</button>
      </div>
      <button class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :disabled="!hist.canRedo.value" aria-label="Wiederholen" title="Wiederholen" data-redo @click="hist.redo()">↷</button>
    </div>

    <div class="lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
      <!-- v-if statt hidden: mobil den Ganzbaum-Aufbau aus dem Render-/Mount-Pfad nehmen (Jank-Ursache) -->
      <section v-if="isLg || view === 'aufbau'" class="lg:block">
        <!-- overflow-visible: das absolute ⋮-Aktionsmenue darf ueber den Kartenrand hinausragen -->
        <div class="card overflow-visible bg-base-100 shadow">
          <div class="card-body gap-2 p-3">
            <!-- flex-wrap: ab lg (schmale Spalte) rutschen Rückgängig/Wiederholen in eine zweite Zeile statt aus der Karte -->
            <div class="flex flex-wrap items-center gap-1">
              <h3 class="text-sm font-semibold text-base-content/75">Aufbau</h3>
              <!-- Alle Abschnitte ein- oder ausklappen, Wörter wie im Online-Editor -->
              <span v-if="hasSections" class="ml-auto flex gap-1">
                <button type="button" class="btn btn-ghost btn-sm min-h-11 px-2!" title="Alle Abschnitte einklappen: nur die Überschriften bleiben" data-fold-all @click="fold.foldAll()">Einklappen</button>
                <button type="button" class="btn btn-ghost btn-sm min-h-11 px-2!" title="Alle Abschnitte ausklappen" data-unfold-all @click="fold.unfoldAll()">Ausklappen</button>
              </span>
              <!-- ab lg (drei Spalten, kein Umschalter) sitzen Rückgängig/Wiederholen hier -->
              <span class="hidden gap-1 lg:flex" :class="hasSections ? '' : 'ml-auto'">
                <button class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :disabled="!hist.canUndo.value" aria-label="Rückgängig" title="Rückgängig" @click="hist.undo()">↶</button>
                <button class="btn btn-ghost btn-sm min-h-11 min-w-11 px-1.5" :disabled="!hist.canRedo.value" aria-label="Wiederholen" title="Wiederholen" @click="hist.redo()">↷</button>
              </span>
            </div>
            <ContainerTreeNode :node="root" :depth="0" />
          </div>
        </div>
      </section>

      <section class="lg:block" :class="{ hidden: view !== 'eigenschaften' }">
        <ContainerProperties :root="root" />
      </section>

      <!-- v-if statt hidden: das teure render()-computed der Vorschau mobil nur mounten, wenn sichtbar -->
      <section v-if="isLg || view === 'vorschau'" class="lg:block">
        <ContainerPreview :root="root" />
      </section>
    </div>
  </div>
</template>
