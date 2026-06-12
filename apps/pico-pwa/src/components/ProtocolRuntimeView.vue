<script setup lang="ts">
import { watchEffect } from 'vue'
import VariableInput from '@/components/VariableInput.vue'
import PointInput from '@/components/PointInput.vue'
import OptionalBlockToggle from '@/components/OptionalBlockToggle.vue'
import RenderPreview from '@/components/RenderPreview.vue'
import { TOOL_COMPONENTS } from '@/tools/registry'
import { useProtocolRuntime } from '@/composables/useProtocolRuntime'

/**
 * Laufzeit-/Einsatzansicht (NICHT der Protokoll-Kreator #13).
 *
 * Flow: Protokoll laden → Variablen setzen → Punkte ausfüllen/aktivieren →
 * optionale Blöcke aktivieren → Renderer-Vorschau. Der gesamte Zustand ist
 * flüchtig (caseState) und wird nicht persistiert.
 *
 * Die fertige Klartext-Ausgabe wird über `v-model:output` nach außen gegeben,
 * damit die Pico-Anbindung (Shell) sauber getrennt bleibt.
 */
const output = defineModel<string>('output', { default: '' })

const {
  protocol,
  availableProtocols,
  runtimeProtocolId,
  selectRuntimeProtocol,
  isDefaultProtocol,
  setDefaultProtocol,
  state,
  setVariable,
  setValue,
  toggleBlock,
  blockActive,
  preview,
  reset,
  displayBlocks,
  visiblePointsOf,
  blockVisible,
  resolveText,
} = useProtocolRuntime()

// Vorlagenwechsel (#44): bestehende Einsatz-Eingaben gehen verloren -> bestätigen.
function onSelectProtocol(event: Event): void {
  const el = event.target as HTMLSelectElement
  const id = el.value
  const hasInput = Object.keys(state.values).length > 0 || state.activeBlocks.length > 0
  if (hasInput && !window.confirm('Vorlage wechseln? Die Eingaben dieses Einsatzes werden verworfen.')) {
    el.value = runtimeProtocolId.value ?? ''
    return
  }
  selectRuntimeProtocol(id)
}

// Vorschau nach außen spiegeln (für den Bridge-Send im Shell).
watchEffect(() => {
  output.value = preview.value
})

// Feld-Tools (#54): Tool-Ergebnis an den Inhalt des ZUGEHOERIGEN Felds anhaengen
// (nicht ueberschreiben). Frueher hardcodiert auf 'dauermedikation'.
function applyToolResult(pointId: string, text: string): void {
  const existing = state.values[pointId]
  const prefix = typeof existing === 'string' && existing.trim() ? `${existing.trim()}; ` : ''
  setValue(pointId, `${prefix}${text}`)
}
</script>

<template>
  <!-- Mobile: eine Spalte; ab Tablet zweispaltiges Karten-Raster (#23) -->
  <div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
    <div class="md:col-span-2">
      <h1 class="text-lg font-semibold">{{ resolveText(protocol.title ?? '') }}</h1>
      <p class="text-xs text-base-content/60">
        Einsatzansicht (Entwurf). Eingaben sind flüchtig und werden nicht gespeichert.
      </p>
      <div class="mt-1 text-xs">
        <InlineHint
          id="tristate"
          title="Befund-Schalter"
          text="Tippen wechselt: ✓ bestätigt (Standard) · ✎ abweichender Text · − nicht erhoben (erscheint nicht im Protokoll)."
        />
      </div>
      <!-- Vorlagen-Auswahl (#44): Protokolle aus der Session (Editor/Bibliothek/Import) -->
      <div v-if="availableProtocols.length > 1" class="mt-2">
        <select
          class="select select-bordered select-sm w-full max-w-xs"
          :value="runtimeProtocolId ?? ''"
          aria-label="Protokoll-Vorlage wählen"
          @change="onSelectProtocol"
        >
          <option v-for="p in availableProtocols" :key="p.id" :value="p.id">
            {{ p.title || p.id }}
          </option>
        </select>
      </div>
      <!-- Persönlicher Standard: diese Vorlage beim App-Start automatisch vorauswählen -->
      <label
        v-if="availableProtocols.length > 1"
        class="label mt-1 max-w-xs cursor-pointer justify-start gap-2 py-0"
      >
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          :checked="isDefaultProtocol"
          @change="setDefaultProtocol(!isDefaultProtocol)"
        />
        <span class="label-text text-xs">Als persönlichen Standard beim Start vorauswählen</span>
      </label>
    </div>

    <!-- Variablen -->
    <section v-if="(protocol.variables ?? []).length" class="card bg-base-100 shadow">
      <div class="card-body gap-2 p-4">
        <h2 class="card-title text-base">Variablen</h2>
        <VariableInput
          v-for="v in protocol.variables"
          :key="v.id"
          :variable="v"
          :model-value="state.variableValues[v.id]"
          @update:model-value="setVariable(v.id, $event)"
        />
      </div>
    </section>

    <!-- Alle Blöcke in PROTOKOLLREIHENFOLGE (#49): optionale bleiben an ihrer
         Editor-Position (Toggle inline) statt in einer Sammel-Sektion. -->
    <section v-for="block in displayBlocks" :key="block.id" class="card bg-base-100 shadow">
      <div class="card-body gap-2 p-4">
        <template v-if="!block.optional">
          <h2 class="card-title text-base">{{ resolveText(block.title) }}</h2>
          <template v-for="(point, i) in visiblePointsOf(block)" :key="point.id ?? `${block.id}-${i}`">
            <PointInput
              :point="point"
              :values="state.values"
              :resolve="resolveText"
              @set="setValue($event.id, $event.value)"
            />
            <!-- Feld-Tool (#54): unter dem Feld, Ergebnis fliesst in genau dieses Feld -->
            <component
              :is="TOOL_COMPONENTS[point.tool as string]"
              v-if="point.tool && TOOL_COMPONENTS[point.tool as string]"
              @apply="applyToolResult(point.id as string, $event)"
            />
          </template>
        </template>
        <template v-else>
          <OptionalBlockToggle
            :block="block"
            :active="blockActive(block.id)"
            :resolve="resolveText"
            @update:active="toggleBlock(block.id, $event)"
          />
          <div
            v-if="blockActive(block.id) && blockVisible(block)"
            class="ml-2 flex flex-col gap-2 border-l-2 border-base-300 pl-3"
          >
            <template v-for="(point, i) in visiblePointsOf(block)" :key="point.id ?? `${block.id}-${i}`">
              <PointInput
                :point="point"
                :values="state.values"
                :resolve="resolveText"
                @set="setValue($event.id, $event.value)"
              />
              <component
                :is="TOOL_COMPONENTS[point.tool as string]"
                v-if="point.tool && TOOL_COMPONENTS[point.tool as string]"
                @apply="applyToolResult(point.id as string, $event)"
              />
            </template>
          </div>
        </template>
      </div>
    </section>

    <!-- Vorschau (immer volle Breite) -->
    <section class="card bg-base-100 shadow md:col-span-2">
      <div class="card-body gap-2 p-4">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-base">Vorschau (Entwurf)</h2>
          <button type="button" class="btn btn-ghost btn-xs" @click="reset">Sitzung zurücksetzen</button>
        </div>
        <RenderPreview :text="preview" />
      </div>
    </section>
  </div>
</template>
