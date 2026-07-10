<script setup lang="ts">
/** Live-Vorschau: Text-Ausgabe (geteilter Renderer, zeigt Überschriften-Format + showTitle)
 *  und eine interaktive Einsatz-Vorschau zum Testen von Einklappen + Struktur. */
import { computed, ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { render } from '@resqdocs/protocol-core/render'
import { previewValues } from '@resqdocs/protocol-core/creator'
import ContainerPreviewNode from './ContainerPreviewNode.vue'
import OutputText from './OutputText.vue'

const props = defineProps<{ root: Container }>()
// Editor-Vorschau, umschaltbar:
//  - „Beispiel" (Default): Funktionen mit festen Beispiel-Zeilen (previewValues) -> zeigt eine GEFUELLTE Ausgabe.
//  - „Leer": mit {} rendern -> Funktionen leer (zeigt Standardtexte/Leerzustand), Felder auf ihren Defaults.
// Betrifft nur die Text-Ausgabe; der Einsatz rendert mit den echten Werten (nicht hier).
const showSample = ref(true)
const text = computed(() => render(props.root, showSample.value ? previewValues(props.root) : {}))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-2 p-4">
        <!-- Vorschau-Daten umschaltbar: Beispiel-Zeilen ODER leer (zeigt Standardtexte/Leerzustand). -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-base-content/50">Vorschau-Daten</span>
          <div class="join" role="group" aria-label="Vorschau-Daten">
            <button type="button" class="btn btn-xs join-item" :class="showSample ? 'btn-primary' : 'btn-ghost'" @click="showSample = true">Beispiel</button>
            <button type="button" class="btn btn-xs join-item" :class="!showSample ? 'btn-primary' : 'btn-ghost'" @click="showSample = false">Leer</button>
          </div>
        </div>
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
