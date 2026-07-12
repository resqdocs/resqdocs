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
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import PackYearsSheet from './PackYearsSheet.vue'
import News2Sheet from './News2Sheet.vue'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'
import RequiredMark from '@/components/RequiredMark.vue'
import FunctionFillToggle from './FunctionFillToggle.vue'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()

const def = computed(() => FUNCTION_REGISTRY[props.node.functionKind])
const label = computed(() => (props.node.title && props.node.title.trim()) || def.value?.label || 'Rechner')
const fill = computed(() => caseValues.get(props.node.id))
const ergebnis = computed(() => def.value?.renderBody(fill.value) ?? '')
const hasData = computed(() => def.value?.hasData(fill.value) ?? false)
// Pflicht-Rechner „noch offen": noch nicht erhoben (kein Ergebnis) -> reiner visueller Hinweis.
const isOpen = computed(() => isRequiredOpen(props.node, fill.value))
// Tri-State wie bei den Listen-Funktionen: ✓ berechnet / ✎ eigener Freitext / − nicht erhoben. Der Status
// lebt in der Funktions-Fill; render.ts wertet ihn generisch aus (excluded=weg, custom=Freitext, sonst
// Ergebnis ODER Standardtext-Fallback node.default).
const status = computed(() => caseValues.getFunctionStatus(props.node.id))
const excluded = computed(() => status.value === 'excluded')
const custom = computed(() => status.value === 'custom')
const customText = computed(() => caseValues.getFunctionText(props.node.id))
function setCustomText(t: string): void {
  caseValues.setFunctionText(props.node.id, t)
}
// BEWAHREN: ruhend gemerkter Freitext -> antippbarer „zurueckholen"-Hinweis (nie in der Ausgabe).
const preservedText = computed(() => caseValues.getFunctionPrevText(props.node.id))
function restorePreserved(): void {
  caseValues.setFunctionText(props.node.id, caseValues.getFunctionPrevText(props.node.id) || (props.node.default ?? ''))
}
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
  <div class="flex flex-col gap-2" :data-required-open="node.required && isOpen ? '' : undefined">
    <div class="flex items-center gap-2">
      <!-- Tri-State wie bei den Listen-Funktionen: ✓ berechnet / ✎ Freitext / − nicht erhoben.
           NUR bei unterstuetztem Rechner: unbekannte functionKinds (Fremd-Import/neuere Vorlage) bleiben
           read-only, sonst koennte man Freitext tippen, den der Renderer (kein Registry-Def) verwirft. -->
      <FunctionFillToggle v-if="supported" :node="node" />
      <span class="text-sm font-semibold">{{ label }}<RequiredMark v-if="node.required" :open="isOpen" /></span>
      <span v-if="!excluded && !custom && hasData" class="badge badge-neutral badge-sm">berechnet</span>
      <button v-if="!excluded && !custom && hasData" type="button" class="btn btn-ghost btn-sm ml-auto min-h-11 text-error" @click="confirmReset = true">Zurücksetzen</button>
    </div>

    <p v-if="node.required && isOpen" class="pl-9 text-sm text-warning">Pflichtfeld – noch offen</p>

    <!-- BEWAHREN: getippter Freitext ruht (Status ✓/−) -> antippbar zum verlustfreien Zurueckholen. -->
    <button v-if="supported && preservedText" type="button" class="flex min-h-11 items-center gap-1.5 pl-9 text-left text-sm text-info hover:underline" :title="preservedText" @click="restorePreserved">
      <span aria-hidden="true">✎</span>
      <span>Getippter Text gemerkt — zurückholen</span>
    </button>

    <!-- − nicht erhoben: Rechner entfaellt in der Ausgabe. -->
    <p v-if="supported && excluded" class="text-xs italic text-base-content/50">nicht erhoben — erscheint nicht im Protokoll</p>

    <!-- ✎ Freitext: ersetzt in der Ausgabe das Ergebnis (vorbelegt mit Standardtext). -->
    <div v-else-if="supported && custom" class="flex flex-col gap-1">
      <textarea
        class="textarea textarea-bordered textarea-sm w-full"
        rows="2"
        :value="customText"
        :aria-label="`${label}: Freitext`"
        :placeholder="node.default || 'z. B. nicht erhebbar'"
        @input="setCustomText(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="text-xs italic text-base-content/50">Freitext — ersetzt in der Ausgabe das Ergebnis. Erfasste Werte bleiben erhalten.</p>
    </div>

    <!-- ✓ berechnen: Ergebnis-Zeile; Antippen öffnet die Eingabe (nur bei unterstütztem Rechner). -->
    <template v-else>
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
    </template>

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
