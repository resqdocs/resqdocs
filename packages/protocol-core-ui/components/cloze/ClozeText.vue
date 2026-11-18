<script setup lang="ts">
/**
 * Der Text eines Lückentexts mit antippbaren Lücken. Zeigt je Lücke den aktuellen Wert und - ohne Farbe
 * allein - ihren Zustand: offen (gestrichelter Rahmen, Name der Lücke), Standardwert der Vorlage
 * (gepunktet unterstrichen), beantwortet (kräftig), „nicht erhoben" (gestrichelt, ausgeschrieben).
 * Die gewählte Lücke ist dunkel hinterlegt. Die Lücken im Fließtext sind klein; die große Abfrage steht
 * im Ausfüll-Fenster darunter.
 */
import { computed } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { clozeOf, clozeGaps } from '@resqdocs/protocol-core/cloze'
import { gapState, type GapState } from '@resqdocs/protocol-core/clozeFill'
import { gapText } from '@resqdocs/protocol-core/render'
import { useCaseValues } from '../../useCaseValues.ts'
import { useDependencyHidden } from '../../useDependencies.ts'

const props = defineProps<{ node: Container; root: Container | null; selected?: string | null }>()
const emit = defineEmits<{ pick: [id: string] }>()
const caseValues = useCaseValues()
const dependencyHidden = useDependencyHidden()

interface Piece {
  key: string
  text: string
  id?: string
  state?: GapState
  aria?: string
}

const STATE_WORD: Record<GapState, string> = { open: 'offen', default: 'Standardwert', answered: 'beantwortet', excluded: 'nicht erhoben' }

const pieces = computed<Piece[]>(() => {
  const cloze = clozeOf(props.node)
  if (!cloze) return []
  const gaps = new Map(clozeGaps(props.root, props.node).map((g) => [g.id, g]))
  const out: Piece[] = []
  cloze.parts.forEach((part, i) => {
    if (typeof part === 'string') {
      out.push({ key: `t${i}`, text: part })
      return
    }
    const gap = gaps.get(part.gap)
    // Eine Abhängigkeit blendet das Element gerade aus: dann gibt es hier auch nichts auszufüllen.
    if (!gap || dependencyHidden.value.has(gap.id)) return
    const fill = caseValues.values.value[gap.id]
    const state = gapState(gap.node, fill)
    const name = (gap.node.title && gap.node.title.trim()) || 'Lücke'
    const value = gapText(gap.node, fill)
    const text = state === 'open' ? `${name}${gap.node.required ? ' *' : ''}` : state === 'excluded' ? `${name}: nicht erhoben` : value
    out.push({ key: `g${i}`, id: gap.id, state, text, aria: `Lücke ${name}, ${STATE_WORD[state]}${state === 'open' || state === 'excluded' ? '' : `: ${value}`}` })
  })
  return out
})

const STATE_CLASS: Record<GapState, string> = {
  open: 'border border-dashed border-base-content/70 text-base-content/80',
  default: 'bg-base-200/70 underline decoration-dotted decoration-base-content/70 underline-offset-4',
  answered: 'bg-base-200 font-medium',
  excluded: 'border border-dashed border-base-content/50 text-[0.85em] text-base-content/75',
}
function chipClass(p: Piece): string {
  return p.id === props.selected ? 'bg-neutral text-neutral-content' : STATE_CLASS[p.state as GapState]
}
</script>

<template>
  <!-- Eine Zeile, damit zwischen Text und Lücke kein Leerraum aus der Vorlage des Bauteils entsteht. -->
  <p class="whitespace-pre-wrap leading-loose [overflow-wrap:anywhere]" data-cloze-text><template v-for="p in pieces" :key="p.key"><template v-if="p.id === undefined">{{ p.text }}</template><span v-else role="button" tabindex="0" class="cursor-pointer rounded px-[3px] py-0.5 outline-none [-webkit-box-decoration-break:clone] [box-decoration-break:clone] focus-visible:ring-2 focus-visible:ring-neutral" :class="chipClass(p)" :aria-label="p.aria" :aria-current="p.id === selected ? 'true' : undefined" :data-gap="p.id" :data-gap-state="p.state" @click="emit('pick', p.id)" @keydown.enter.prevent="emit('pick', p.id)" @keydown.space.prevent="emit('pick', p.id)">{{ p.text }}</span></template></p>
</template>
