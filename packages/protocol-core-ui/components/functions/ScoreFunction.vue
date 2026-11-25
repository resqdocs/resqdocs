<script setup lang="ts">
/**
 * Einsatz-Shell für SCORE-/Rechner-Funktionen. Gemeinsames Muster für Pack-Years, NEWS2, LAMS,
 * FAST4D, ZOPS, Sgarbossa, EGSYS und BMI: eine kompakte Ergebnis-Zeile (gerendert über DENSELBEN render()/registry wie die
 * Ausgabe) + Antippen öffnet ein Eingabe-Sheet (Modal, bewusste Entscheidung: die Funktion
 * darf im Modal sein, die Einbindung im Editor fühlt sich an wie jedes Feld). Genau EINE Score-Zeile
 * im selben Werte-Store (getRows/setRows) -> Entwurf-Persistenz + DSGVO-Reset gratis.
 *
 * Destruktives Zurücksetzen mit Rückfrage (Lösch-Schutz-Muster: erfasste Werte sind Arbeit).
 */
import { computed, ref } from 'vue'
import type { FunctionNode, FunctionRow, PackYearsRow, NEWS2Row, LAMSRow, FAST4DRow, ZOPSRow, SgarbossaRow, EGSYSRow, BMIRow } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import PackYearsSheet from './PackYearsSheet.vue'
import News2Sheet from './News2Sheet.vue'
import LamsSheet from './LamsSheet.vue'
import Fast4dSheet from './Fast4dSheet.vue'
import ZopsSheet from './ZopsSheet.vue'
import SgarbossaSheet from './SgarbossaSheet.vue'
import EgsysSheet from './EgsysSheet.vue'
import BmiSheet from './BmiSheet.vue'
import ConfirmDialog from '@resqdocs/protocol-core-ui/components/ConfirmDialog.vue'
import RequiredMark from '../RequiredMark.vue'
import FunctionFillToggle from './FunctionFillToggle.vue'
import { isRequiredOpen } from '@resqdocs/protocol-core/required'

const props = defineProps<{ node: FunctionNode }>()
const caseValues = useCaseValues()

const def = computed(() => FUNCTION_REGISTRY[props.node.functionKind])
const label = computed(() => (props.node.title && props.node.title.trim()) || def.value?.label || 'Rechner')
// Funktionen fuehren ihren Status eigenstaendig (state:'function' mit status), nicht ueber den
// Feld-Tri-State. UNO Reverse ist fuer sie deshalb NICHT entschieden - bewusst kein Knoten hier.
const fill = computed(() => caseValues.get(props.node.id))
// Mit den Einstellungen aus der Vorlage (z. B. eigener Text ab der Schwelle) - wie im Protokolltext.
const ergebnis = computed(() => def.value?.renderBody(fill.value, props.node.config) ?? '')
const hasData = computed(() => def.value?.hasData(fill.value) ?? false)
// Pflicht-Rechner „noch offen": noch nicht erhoben (kein Ergebnis) -> reiner visueller Hinweis.
const isOpen = computed(() => isRequiredOpen(props.node, fill.value))
// Tri-State wie bei den Listen-Funktionen: ✓ berechnet / ✎ eigener Freitext / − nicht erhoben. Der Status
// lebt in der Funktions-Fill; render.ts wertet ihn generisch aus (excluded=weg, custom=Freitext, sonst
// Ergebnis ODER Standardtext-Fallback node.default).
const status = computed(() => caseValues.getFunctionStatus(props.node.id, props.node))
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
const lamsRow = computed<LAMSRow | undefined>(() => row.value as LAMSRow | undefined)
const fast4dRow = computed<FAST4DRow | undefined>(() => row.value as FAST4DRow | undefined)
const zopsRow = computed<ZOPSRow | undefined>(() => row.value as ZOPSRow | undefined)
const sgarbossaRow = computed<SgarbossaRow | undefined>(() => row.value as SgarbossaRow | undefined)
const egsysRow = computed<EGSYSRow | undefined>(() => row.value as EGSYSRow | undefined)
const bmiRow = computed<BMIRow | undefined>(() => row.value as BMIRow | undefined)
// Welche Score-Typen haben ein Eingabe-Sheet? Ein Knoten ohne Sheet ODER ohne Registry-Def
// (unbekannter functionKind, z. B. Fremd-Import) darf KEIN aktives Tap-Ziel bekommen
// (sonst stiller toter Button) - stattdessen read-only.
const SHEET_KINDS: readonly string[] = ['packYears', 'news2', 'lams', 'fast4d', 'zops', 'sgarbossa', 'egsys', 'bmi']
const hasSheet = computed(() => SHEET_KINDS.includes(props.node.functionKind))
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


    <!-- − nicht erhoben: Rechner entfaellt in der Ausgabe. -->
    <p v-if="supported && excluded" class="text-right text-xs italic text-base-content/75">nicht erhoben</p>

    <!-- ✎ Freitext: ersetzt im Protokolltext das Ergebnis (vorbelegt mit Standardtext). -->
    <div v-else-if="supported && custom" class="flex flex-col gap-1">
      <textarea
        class="textarea textarea-bordered textarea-sm w-full"
        rows="2"
        :value="customText"
        :aria-label="`${label}: Freitext`"
        :placeholder="node.default || 'z. B. nicht erhebbar'"
        @input="setCustomText(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="text-xs italic text-base-content/75">Freitext — ersetzt im Protokolltext das Ergebnis. Erfasste Werte bleiben erhalten.</p>
    </div>

    <!-- ✓ berechnen: Ergebnis-Zeile; Antippen öffnet die Eingabe (nur bei unterstütztem Rechner). -->
    <template v-else>
      <button
        v-if="supported"
        type="button"
        class="flex min-h-11 w-full items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
        :aria-label="`${label}: ${hasData ? ergebnis : 'noch nicht erhoben'} — eingeben`"
        data-score-open
        @click="sheetOpen = true"
      >
        <!-- Kein truncate: Befund-Scores (LAMS/FAST4D) nennen die Befunde - die Zeile darf umbrechen,
             sonst fehlt im Einsatz genau der Teil, den man gegenlesen will. -->
        <span v-if="hasData" class="min-w-0 flex-1 break-words text-sm"><span v-if="accentClass" :class="accentClass" aria-hidden="true">● </span>{{ ergebnis }}</span>
        <span v-else class="min-w-0 flex-1 truncate text-sm italic text-base-content/75">Noch nicht erhoben — antippen zum Eingeben</span>
        <span class="shrink-0 text-base-content/75" aria-hidden="true">✎</span>
      </button>
      <!-- Unbekannter/nicht unterstützter Rechner (Fremd-Import o. neuere Vorlage): read-only, kein totes Tap-Ziel. -->
      <p v-else class="rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-sm italic text-base-content/75">
        Diese Funktion wird von deiner App-Version nicht unterstützt.
      </p>
    </template>

    <!-- BEWAHREN: getippter Freitext ruht (Status ✓/−) -> antippbar zum verlustfreien Zurueckholen. UNTER der Eingabe (Maintainer), wie beim Feld. -->
    <button v-if="supported && preservedText" type="button" class="flex min-h-11 items-center gap-1.5 pl-9 text-left text-sm text-info hover:underline" :title="preservedText" @click="restorePreserved">
      <span aria-hidden="true">✎</span>
      <span>Getippter Text gemerkt — zurückholen</span>
    </button>

    <!-- Eingabe-Sheet je Score-Typ (teleportet sich selbst) -->
    <PackYearsSheet v-if="sheetOpen && node.functionKind === 'packYears'" :initial="packYearsRow" @apply="apply" @close="sheetOpen = false" />
    <News2Sheet v-if="sheetOpen && node.functionKind === 'news2'" :initial="news2Row" @apply="apply" @close="sheetOpen = false" />
    <LamsSheet v-if="sheetOpen && node.functionKind === 'lams'" :initial="lamsRow" @apply="apply" @close="sheetOpen = false" />
    <Fast4dSheet v-if="sheetOpen && node.functionKind === 'fast4d'" :initial="fast4dRow" @apply="apply" @close="sheetOpen = false" />
    <ZopsSheet v-if="sheetOpen && node.functionKind === 'zops'" :initial="zopsRow" @apply="apply" @close="sheetOpen = false" />
    <SgarbossaSheet v-if="sheetOpen && node.functionKind === 'sgarbossa'" :initial="sgarbossaRow" @apply="apply" @close="sheetOpen = false" />
    <EgsysSheet v-if="sheetOpen && node.functionKind === 'egsys'" :initial="egsysRow" @apply="apply" @close="sheetOpen = false" />
    <BmiSheet v-if="sheetOpen && node.functionKind === 'bmi'" :initial="bmiRow" @apply="apply" @close="sheetOpen = false" />

    <ConfirmDialog
      v-if="confirmReset"
      :title="`„${label}“ zurücksetzen?`"
      message="Die erfassten Werte werden gelöscht. Das lässt sich nicht rückgängig machen."
      confirm-label="Zurücksetzen"
      @confirm="doReset"
      @cancel="confirmReset = false"
    />
  </div>
</template>
