<script setup lang="ts">
/**
 * Vorlagen-Editor - Neuaufbau, Slice 1: der rekursive Container.
 * Schreibt den GETEILTEN Protokoll-Baum (useProtocolTree) - dieselbe Definition, die der
 * Einsatz liest (eine Quelle der Wahrheit). Editor-lokal sind nur Auswahl + Segment-Ansicht.
 * Small-screen-first: drei Segmente (Aufbau / Eigenschaften / Vorschau) einzeln am Handy,
 * ab lg drei Spalten. Zentrale Tree-API per provide/inject an die rekursiven Knoten.
 */
import { ref, provide, toRaw, onMounted, onUnmounted } from 'vue'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { findNode, collectIds, canMoveUp as canMoveUpOp, canMoveDown as canMoveDownOp, canIndent as canIndentOp, canOutdent as canOutdentOp, moveTargets as moveTargetsOp } from '@resqdocs/protocol-core/creator'
import { TREE_EDITOR, type TreeEditorApi } from '@resqdocs/protocol-core-ui/treeEditor'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import type { Container } from '@resqdocs/protocol-core/model'
import ContainerTreeNode from '@resqdocs/protocol-core-ui/components/ContainerTreeNode.vue'
import ContainerProperties from '@resqdocs/protocol-core-ui/components/ContainerProperties.vue'
import ContainerPreview from '@resqdocs/protocol-core-ui/components/ContainerPreview.vue'
import LibraryBar from './LibraryBar.vue'
import AiToolNotice from './AiToolNotice.vue'
import SnippetPicker from './SnippetPicker.vue'
import { snippetPickerKey } from '@resqdocs/protocol-core-ui/injection'

const tree = useProtocolTree()
const caseValues = useCaseValues()
const blocks = useBlockLibrary()
const root = tree.root
const selectedId = ref<string | null>(root.value.id)
const view = ref<'aufbau' | 'eigenschaften' | 'vorschau'>('aufbau')

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
    tree.update(id, patch)
    // id ist der Key im Einsatz-Werte-Store -> beim Umbenennen den Wert mit-migrieren.
    if (typeof newId === 'string' && newId.length > 0 && newId !== id) {
      caseValues.rename(id, newId)
      if (selectedId.value === id) selectedId.value = newId
    }
  },
  addChild(parentId, kind, functionKind) {
    const child = tree.addChild(parentId, kind, functionKind)
    selectedId.value = child.id
    view.value = 'eigenschaften'
  },
  insertSnippet(parentId, text) {
    const child = tree.insertSnippet(parentId, text)
    selectedId.value = child.id
    view.value = 'eigenschaften'
  },
  insertBlock(parentId, block) {
    const child = tree.insertBlock(parentId, block)
    selectedId.value = child.id
    view.value = 'eigenschaften'
  },
  async saveContainerAsBaustein(id) {
    const live = findNode(root.value, id)
    if (!live || live.type !== 'container' || id === root.value.id) {
      return { ok: false, error: 'Nur ein Container (nicht die Wurzel) kann als Baustein gespeichert werden.' }
    }
    // toRaw + JSON-Klon: entproxyt den reaktiven Baum (structuredClone wuerfe DataCloneError) und
    // entkoppelt den Baustein von der Vorlage - spaetere Editor-Aenderungen wirken nicht zurueck.
    const copy = JSON.parse(JSON.stringify(toRaw(live))) as Container
    return blocks.addBausteinFromContainer(copy, live.title ?? 'Baustein')
  },
  remove(id) {
    if (id === root.value.id) return
    const node = findNode(root.value, id)
    tree.remove(id)
    caseValues.drop(node ? collectIds(node) : [id]) // verwaiste Einsatz-Werte (inkl. Gesundheitsdaten) mit raus
    if (selectedId.value === id) selectedId.value = root.value.id
  },
  move(childId, delta) {
    tree.move(childId, delta)
  },
  moveUp(id) {
    tree.moveUp(id)
  },
  moveDown(id) {
    tree.moveDown(id)
  },
  indent(id) {
    tree.indent(id)
  },
  outdent(id) {
    tree.outdent(id)
  },
  reparent(id, targetParentId, index) {
    tree.reparent(id, targetParentId, index)
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

    <!-- KI-Empfehlung fuer die erste Vorlage (#261, einmalig wegklickbar) -->
    <AiToolNotice />

    <p class="text-sm text-base-content/60">
      Container anlegen, verschachteln und konfigurieren. Die Vorschau zeigt Text-Ausgabe und Einklappen.
    </p>

    <!-- small-screen-first: ein Bereich nach dem anderen; ab lg alle drei nebeneinander -->
    <!-- Umschalter: oben zentriert + sticky (unter dem App-Header, Safe-Area beachtet).
         Nur < lg (ab lg drei Spalten nebeneinander). -->
    <div class="sticky top-[calc(env(safe-area-inset-top,0px)+4rem)] z-[5] flex justify-center bg-base-200/95 py-2 backdrop-blur-sm lg:hidden">
      <div class="join">
        <button class="btn btn-sm join-item" :class="view === 'aufbau' ? 'btn-primary' : ''" @click="view = 'aufbau'">Aufbau</button>
        <button class="btn btn-sm join-item" :class="view === 'eigenschaften' ? 'btn-primary' : ''" @click="view = 'eigenschaften'">Eigenschaften</button>
        <button class="btn btn-sm join-item" :class="view === 'vorschau' ? 'btn-primary' : ''" @click="view = 'vorschau'">Vorschau</button>
      </div>
    </div>

    <div class="lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
      <!-- v-if statt hidden: mobil den Ganzbaum-Aufbau aus dem Render-/Mount-Pfad nehmen (Jank-Ursache) -->
      <section v-if="isLg || view === 'aufbau'" class="lg:block">
        <!-- overflow-visible: das absolute ⋮-Aktionsmenue darf ueber den Kartenrand hinausragen -->
        <div class="card overflow-visible bg-base-100 shadow">
          <div class="card-body gap-2 p-3">
            <h3 class="text-sm font-semibold text-base-content/70">Aufbau</h3>
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
