<script setup lang="ts">
/** Live-Vorschau: Text-Ausgabe (geteilter Renderer, zeigt Überschriften-Format + showTitle)
 *  und eine interaktive Einsatz-Vorschau zum Testen von Einklappen + Struktur. */
import { computed } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { render } from '@resqdocs/protocol-core/render'
import { previewValues } from '@resqdocs/protocol-core/creator'
import ContainerPreviewNode from './ContainerPreviewNode.vue'
import OutputText from './OutputText.vue'

const props = defineProps<{ root: Container }>()
// Editor-Vorschau: Scores mit festen Beispielwerten (previewValues) fuellen, damit die Funktion sichtbar
// wird - im Editor gibt der Nutzer nichts ein. Der Einsatz rendert mit den echten Werten (nicht hier).
const text = computed(() => render(props.root, previewValues(props.root)))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-2 p-4">
        <OutputText :text="text" label="Text-Ausgabe" />
      </div>
    </div>
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-2 p-4">
        <h4 class="text-sm font-semibold text-base-content/70">Vorschau · Einklappen testbar</h4>
        <ContainerPreviewNode :node="root" />
      </div>
    </div>
  </div>
</template>
