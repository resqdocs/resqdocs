<script setup lang="ts">
/** Interaktive Editor-Vorschau (Struktur + Einklappen testen). Container einklappbar als <details>,
 *  sonst normaler Block; Feld = Blatt mit Standardwert-Vorschau. Der Titel dient hier der
 *  Orientierung - unabhaengig von showTitle (das wirkt nur in der Text-Ausgabe). */
import type { Node } from '@resqdocs/protocol-core/model'
defineProps<{ node: Node }>()
function label(n: Node): string {
  return (n.title && n.title.trim()) || n.id
}
</script>

<template>
  <!-- Feld: Blatt mit Standardwert -->
  <div v-if="node.type === 'field'" class="text-sm">
    <span class="text-secondary" aria-hidden="true">◆</span> {{ label(node) }}<span v-if="node.default" class="text-base-content/60">: {{ node.default }}</span>
  </div>

  <!-- Funktion: Blatt -->
  <div v-else-if="node.type === 'function'" class="text-sm">
    <span class="text-accent" aria-hidden="true">⊕</span> {{ label(node) }}
  </div>

  <!-- Container einklappbar -->
  <details v-else-if="node.collapsible" class="rounded border border-base-300" open>
    <summary class="cursor-pointer px-2 py-1 text-sm font-medium">{{ label(node) }}</summary>
    <div class="flex flex-col gap-1 px-2 pb-2 pl-3">
      <ContainerPreviewNode v-for="child in node.children" :key="child.id" :node="child" />
      <p v-if="!node.children.length" class="text-xs italic text-base-content/40">(leer)</p>
    </div>
  </details>

  <!-- Container offen -->
  <div v-else class="flex flex-col gap-1">
    <p class="text-sm font-medium">{{ label(node) }}</p>
    <div v-if="node.children.length" class="flex flex-col gap-1 border-l border-base-300 pl-3">
      <ContainerPreviewNode v-for="child in node.children" :key="child.id" :node="child" />
    </div>
  </div>
</template>
