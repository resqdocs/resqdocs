<script setup lang="ts">
/**
 * Einsatz-Shell für SCORE-/Rechner-Funktionen (#55-Rework). Gemeinsames Muster für Pack-Years (und
 * später NEWS2): eine kompakte Ergebnis-Zeile (gerendert über DENSELBEN render()/registry wie die
 * Ausgabe) + Antippen öffnet ein Eingabe-Sheet (Modal, Maintainer-Entscheid 2026-07-03: die Funktion
 * darf im Modal sein, die Einbindung im Editor fühlt sich an wie jedes Feld). Genau EINE Score-Zeile
 * im selben Werte-Store (getRows/setRows) -> Entwurf-Persistenz + DSGVO-Reset gratis.
 *
 * Destruktives Zurücksetzen mit Rückfrage (#260-Muster: erfasste Werte sind Arbeit).
 */
import { computed, ref } from 'vue'
import type { FunctionNode, FunctionRow, PackYearsRow, NEWS2Row } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@/rebuild/useCaseValues'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import PackYearsSheet from './PackYearsSheet.vue'
import News2Sheet from './News2Sheet.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()

const def = computed(() => FUNCTION_REGISTRY[props.node.functionKind])
const label = computed(() => (props.node.title && props.node.title.trim()) || def.value?.label || 'Rechner')
const fill = computed(() => caseValues.get(props.node.id))
const ergebnis = computed(() => def.value?.renderBody(fill.value) ?? '')
const hasData = computed(() => def.value?.hasData(fill.value) ?? false)
// Ampel-Farbakzent (Einsatz-Anzeige, rein visuell - der Export bleibt reiner Text): daisyUI-Textfarbe je
// Registry-accent. Volle Klassen-Literale -> Tailwind purged sie nicht. Ohne accent (z. B. Pack-Years) leer.
const accentClass = computed(() => {
  const t = def.value?.accent?.(fill.value)
  return t === 'error' ? 'text-error' : t === 'warning' ? 'text-warning' : t === 'success' ? 'text-success' : ''
})
// Aktuelle Eingabe-Zeile (für die Sheet-Vorbefüllung); genau eine oder keine.
const row = computed<FunctionRow | undefined>(() => caseValues.getRows(props.node.id)[0])
// Typisierte Sicht je functionKind (das v-if am Sheet garantiert den passenden Typ).
const packYearsRow = computed<PackYearsRow | undefined>(() => row.value as PackYearsRow | undefined)
const news2Row = computed<NEWS2Row | undefined>(() => row.value as NEWS2Row | undefined)
// Welche Score-Typen haben ein Eingabe-Sheet? Ein Knoten ohne Sheet ODER ohne Registry-Def
// (unbekannter functionKind, z. B. Fremd-Import) darf KEIN aktives Tap-Ziel bekommen
// (Verify #55: sonst stiller toter Button) - stattdessen read-only.
const hasSheet = computed(() => props.node.functionKind === 'packYears' || props.node.functionKind === 'news2')
const supported = computed(() => !!def.value && hasSheet.value)

const sheetOpen = ref(false)
const confirmReset = ref(false)
function apply(next: FunctionRow): void {
  caseValues.setRows(props.node.id, [next])
  sheetOpen.value = false
}
function doReset(): void {
  caseValues.setRows(props.node.id, [])
  confirmReset.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold">{{ label }}</span>
      <span v-if="hasData" class="badge badge-neutral badge-sm">berechnet</span>
      <button v-if="hasData" type="button" class="btn btn-ghost btn-sm ml-auto min-h-11 text-error" @click="confirmReset = true">Zurücksetzen</button>
    </div>

    <!-- Ergebnis-Zeile wie ein Feld-Wert; Antippen öffnet die Eingabe (nur bei unterstütztem Rechner). -->
    <button
      v-if="supported"
      type="button"
      class="flex min-h-11 w-full items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
      :aria-label="`${label}: ${hasData ? ergebnis : 'noch nicht erhoben'} — eingeben`"
      @click="sheetOpen = true"
    >
      <span v-if="hasData" class="min-w-0 flex-1 truncate text-sm"><span v-if="accentClass" :class="accentClass" aria-hidden="true">● </span>{{ ergebnis }}</span>
      <span v-else class="min-w-0 flex-1 truncate text-sm italic text-base-content/50">Noch nicht erhoben — antippen zum Eingeben</span>
      <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
    </button>
    <!-- Unbekannter/nicht unterstützter Rechner (Fremd-Import o. neuere Vorlage): read-only, kein totes Tap-Ziel. -->
    <p v-else class="rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-sm italic text-base-content/50">
      Dieser Rechner wird von deiner App-Version nicht unterstützt.
    </p>

    <!-- Eingabe-Sheet je Score-Typ (teleportet sich selbst) -->
    <PackYearsSheet v-if="sheetOpen && node.functionKind === 'packYears'" :initial="packYearsRow" @apply="apply" @close="sheetOpen = false" />
    <News2Sheet v-if="sheetOpen && node.functionKind === 'news2'" :initial="news2Row" @apply="apply" @close="sheetOpen = false" />

    <ConfirmDialog
      v-if="confirmReset"
      :title="`„${label}“ zurücksetzen?`"
      message="Die erfassten Werte werden entfernt. Das lässt sich nicht rückgängig machen."
      confirm-label="Zurücksetzen"
      @confirm="doReset"
      @cancel="confirmReset = false"
    />
  </div>
</template>
