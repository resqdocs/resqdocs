<script setup lang="ts">
/**
 * Eine Container-Sektion im Einsatz (rekursiv, self-reference ueber den Dateinamen).
 * Regeln (docs/rework/einsatz-display.md):
 *  - Titel IMMER sichtbar (Orientierung) - unabhaengig von showTitle (das wirkt nur im Ausgabetext).
 *  - collapsible -> daisyUI collapse, startet EINGEKLAPPT. Aber NIE collapse-in-collapse (P4):
 *    ist die Sektion bereits in einem Collapse, wird ein klappbares Kind flach (Unter-Kopf) gezeigt.
 *  - Tiefe flach: Ebene 0 = Sektion, Ebene 1 = kleinerer Unter-Kopf + leichte Einrueckung,
 *    Ebene 2+ nicht weiter eindellen (Hierarchie ueber Ueberschrift-Groesse + Weissraum).
 *  - Gruppierung primaer ueber Weissraum, keine flaechigen Kaesten fuer offene Sektionen.
 */
import { nodeLabel } from '@resqdocs/protocol-core-ui/nodeLabel'
import { computed, ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { useDependencyHidden } from '@resqdocs/protocol-core-ui/useDependencies'
import { countDeviations } from '@resqdocs/protocol-core/deviations'
import { countOpenRequired } from '@resqdocs/protocol-core/required'
import EinsatzField from './EinsatzField.vue'
import MedplanFunction from '@resqdocs/protocol-core-ui/components/functions/MedplanFunction.vue'
import AerzteFunction from '@resqdocs/protocol-core-ui/components/functions/AerzteFunction.vue'
import ScoreFunction from '@resqdocs/protocol-core-ui/components/functions/ScoreFunction.vue'
import ContainerFillToggle from './ContainerFillToggle.vue'
import ClozeFill from '@resqdocs/protocol-core-ui/components/cloze/ClozeFill.vue'
import { clozeOf, clozeLeftovers } from '@resqdocs/protocol-core/cloze'

const props = defineProps<{ node: Container; depth: number; insideCollapse: boolean }>()
const caseValues = useCaseValues()
// Elemente, die eine Abhaengigkeit gerade ausblendet, erscheinen nicht im Formular.
const dependencyHidden = useDependencyHidden()
// Lückentext: der Abschnitt zeigt seinen Text mit Lücken; darunter nur die Kinder, die in keiner Lücke stehen.
const cloze = computed(() => clozeOf(props.node))
const visibleChildren = computed(() =>
  (cloze.value ? clozeLeftovers(props.node, cloze.value) : props.node.children).filter((child) => !dependencyHidden.value.has(child.id)),
)

// excludable + „nicht erhoben" -> Kinder weg (entfallen in der Ausgabe); der Abschnitt behält seine Form (siehe Template).
const excluded = computed(() => Boolean(props.node.excludable) && caseValues.get(props.node.id, props.node).state === 'excluded')

// Abweichungen vom Standard im Teilbaum (reaktiv) -> "N abweichend"-Vorschau im Kopf
// ("abweichend" deckt custom UND excluded ab; "geaendert" passt fuer "nicht erhoben" nicht).
const deviations = computed(() => countDeviations(props.node, caseValues.values.value))
// Offene Pflichtfelder im Teilbaum -> Aggregat-Marker am (evtl. zugeklappten) Container-Kopf, damit
// man ein verstecktes Pflichtfeld sieht, ohne die Sektion aufklappen zu muessen.
const openRequired = computed(() => countOpenRequired(props.node, caseValues.values.value))
// „Default zu, Abweichung auf" (B): collapsible Sektion startet EINGEKLAPPT, wenn alles auf Standard
// steht; bei Abweichungen offen. Danach FREI toggelbar - `open` ist nur der Initialwert aus deviations.
const open = ref(deviations.value > 0)

const label = (n: Container): string => nodeLabel(n)
const renderAsCollapse = computed(() => Boolean(props.node.collapsible) && !props.insideCollapse)
const childInside = computed(() => props.insideCollapse || renderAsCollapse.value)
// Heading-RANG folgt der Schachtelungstiefe (a11y: nicht abwaerts ueberspringen). Die
// Protokoll-Ueberschrift im EinsatzView ist h2 -> Sektionen ab h3; bei h6 deckeln.
// (docs/rework/einsatz-nesting.md)
const headingTag = computed(() => `h${Math.min(props.depth + 3, 6)}`)
// Sektionskopf bewusst RUHIG (Eyebrow), damit das FELDLABEL (text-sm font-medium) der kraeftigere
// Block bleibt - sonst ist die Hierarchie invertiert. Ebene 0 = kleiner Abschnittskopf, ab Ebene 1
// Eyebrow-Label (Versalien/Tracking lesen sich als „Label, nicht Inhalt").
// (docs/rework/einsatz-hierarchy.md; NN/g visual-hierarchy + GOV.UK headings)
const headingClass = computed(() => {
  if (props.depth === 0) return 'text-sm font-semibold text-base-content/80'
  return 'text-[11px] font-semibold uppercase tracking-wide text-base-content/75'
})
</script>

<template>
  <!-- nicht erhoben: Der Abschnitt behält seine Form, Kinder entfallen (auch in der Ausgabe). Maintainer 2026-11-25,
       Quellen in docs/sources.md. Als Kasten bleibt er ein Kasten in derselben Größe, nur hohl (ohne Fläche):
       Kästchen, Titel und Status stehen an denselben Stellen wie beim erhobenen Abschnitt, die Liste springt beim
       Umschalten nicht. Abgeschwächt wird nur die Fläche; die Schrift behält ihren vollen Kontrast (der Zustand
       steht ohnehin als − im Kästchen und als Worte da). Gleiche Klassen wie die Kopfzeile des Kastens unten. -->
  <div v-if="excluded && renderAsCollapse" class="collapse rounded-lg border border-base-300" data-section-excluded>
    <div class="collapse-title flex min-h-0 cursor-default items-center justify-between gap-2 py-3 pr-10 text-sm font-medium">
      <span class="inline-flex items-center gap-2">
        <ContainerFillToggle :node="node" />
        {{ label(node) }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        <span class="text-xs italic text-base-content/75">nicht erhoben</span>
      </span>
    </div>
  </div>
  <!-- nicht erhoben, Abschnitt ohne Kasten: an derselben Stelle wie sein Kopf, wenn er erhoben ist (gleiche Abstände
       und Einrückung wie die <section> unten). -->
  <div v-else-if="excluded" class="flex items-center gap-2" :class="[depth >= 1 ? 'mt-5' : '', depth === 1 ? 'border-l border-base-200/70 pl-3' : '']">
    <ContainerFillToggle :node="node" />
    <component :is="headingTag" :class="headingClass">{{ label(node) }}</component>
    <span class="ml-auto shrink-0 text-xs italic text-base-content/75">nicht erhoben</span>
  </div>

  <details v-else-if="renderAsCollapse" class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary class="collapse-title flex min-h-0 items-center justify-between gap-2 py-3 pr-10 text-sm font-medium">
      <span class="inline-flex items-center gap-2">
        <ContainerFillToggle v-if="node.excludable" :node="node" />
        {{ label(node) }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        <!-- Pflichtfeld-Aggregat: zeigt AM ZUGEKLAPPTEN Container, dass darin N Pflichtfelder offen sind
             (der „*"-Sprachcode der Felder; amber = noch offen). -->
        <span v-if="openRequired > 0" class="badge badge-warning badge-sm gap-0.5" :title="`${openRequired} Pflichtfeld${openRequired === 1 ? '' : 'er'} noch offen`"><span aria-hidden="true">*</span>{{ openRequired }}<span class="sr-only"> Pflichtfeld(er) noch offen</span></span>
        <span v-if="deviations > 0" class="badge badge-warning badge-sm">{{ deviations }} abweichend</span>
        <span v-else-if="openRequired === 0" class="text-xs text-base-content/75">Standard</span>
      </span>
    </summary>
    <div class="collapse-content">
      <div class="flex flex-col gap-1.5 pt-1">
        <ClozeFill v-if="cloze" :node="node" />
        <template v-for="child in visibleChildren" :key="child.id">
          <EinsatzSection v-if="child.type === 'container'" :node="child" :depth="depth + 1" :inside-collapse="childInside" />
          <MedplanFunction v-else-if="child.type === 'function' && child.functionKind === 'medikamentenplan'" :node="child" />
          <AerzteFunction v-else-if="child.type === 'function' && child.functionKind === 'aerzte'" :node="child" />
          <ScoreFunction v-else-if="child.type === 'function'" :node="child" />
          <EinsatzField v-else-if="child.type === 'field'" :node="child" />
        </template>
        <p v-if="!node.children.length" class="text-xs italic text-base-content/75">(noch keine Elemente)</p>
      </div>
    </div>
  </details>

  <!-- Proximity: eng innen (gap-1.5) bindet Felder an ihren Kopf; mehr Luft ZWISCHEN
       Geschwister-Sektionen (mt-5 ab Ebene 1). Indent-Cap bleibt: border-l/pl-3 NUR Ebene 1
       (horizontale Geometrie friert ab Ebene 2 ein). -->
  <section v-else class="flex flex-col gap-1.5" :class="[depth >= 1 ? 'mt-5' : '', depth === 1 ? 'border-l border-base-200/70 pl-3' : '']">
    <div class="flex items-center gap-2">
      <ContainerFillToggle v-if="node.excludable" :node="node" />
      <component :is="headingTag" :class="headingClass">{{ label(node) }}</component>
      <span v-if="openRequired > 0" class="badge badge-warning badge-sm gap-0.5 shrink-0" :title="`${openRequired} Pflichtfeld${openRequired === 1 ? '' : 'er'} noch offen`"><span aria-hidden="true">*</span>{{ openRequired }}<span class="sr-only"> Pflichtfeld(er) noch offen</span></span>
    </div>
    <ClozeFill v-if="cloze" :node="node" />
    <template v-if="node.children.length">
      <template v-for="child in visibleChildren" :key="child.id">
        <EinsatzSection v-if="child.type === 'container'" :node="child" :depth="depth + 1" :inside-collapse="childInside" />
        <MedplanFunction v-else-if="child.type === 'function' && child.functionKind === 'medikamentenplan'" :node="child" />
        <AerzteFunction v-else-if="child.type === 'function' && child.functionKind === 'aerzte'" :node="child" />
        <ScoreFunction v-else-if="child.type === 'function'" :node="child" />
        <EinsatzField v-else :node="child" />
      </template>
    </template>
  </section>
</template>
