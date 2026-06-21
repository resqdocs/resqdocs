<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import type { ConditionInput } from '@/composables/useCreatorSession'
import { isSimpleVisibleIf } from '@resqdocs/protocol-core/creator/creator.mjs'

/**
 * Einfacher visibleIf-Editor (#13-D): genau EINE Bedingung an Block oder Punkt.
 * Operatoren eq/filled/truthy/state. Komplexe/`in`-Regeln (z. B. aus Import)
 * werden erkannt und nur als read-only Hinweis gezeigt. Baut Prädikate über die
 * Domainfunktion (createSimpleVisibleIf, via Composable) — keine eigene Logik.
 */
const props = defineProps<{ target: 'block' | 'point' }>()
const s = useCreatorSessionCtx()

const EDITABLE_OPS = ['eq', 'truthy', 'filled', 'state'] as const

const entity = computed(() => (props.target === 'block' ? s.currentBlock.value : s.currentPoint.value))
const visibleIf = computed(() => (entity.value as { visibleIf?: unknown } | null)?.visibleIf ?? null)
const variables = computed(() => s.selected.value?.variables ?? [])

// Adressierbare Punkte (findingGroup → Kinder; aktuellen Punkt ausschließen).
const points = computed(() => {
  const out: { id: string; label: string }[] = []
  for (const b of s.selected.value?.blocks ?? []) {
    for (const p of b.points ?? []) {
      if (p.type === 'findingGroup') {
        for (const f of (p.findings as { id: string; label?: string }[]) ?? []) {
          out.push({ id: f.id, label: `${(p as { key?: string }).key ?? ''}: ${f.label ?? f.id}` })
        }
      } else if (p.id) {
        out.push({ id: p.id, label: (p.label as string) || (p.content as string)?.slice(0, 24) || (p.type as string) })
      }
    }
  }
  return props.target === 'point' ? out.filter((x) => x.id !== s.currentPoint.value?.id) : out
})

function parse(pred: Record<string, unknown> | null): ConditionInput | null {
  if (!pred || typeof pred !== 'object') return null
  if (!isSimpleVisibleIf(pred)) return null
  const source = 'var' in pred ? 'var' : 'point'
  const op = EDITABLE_OPS.find((o) => o in pred)
  if (!op) return null // z. B. `in` → nicht im MVP-Editor
  return { source, id: (pred.var ?? pred.point) as string, op, value: pred[op] }
}

const editable = computed(() => !visibleIf.value || parse(visibleIf.value as Record<string, unknown>) !== null)
const isComplex = computed(() => !!visibleIf.value && !editable.value)

const form = reactive<{ enabled: boolean; source: 'var' | 'point'; id: string; op: string; value: string; bool: boolean; state: string }>(
  { enabled: false, source: 'var', id: '', op: 'eq', value: '', bool: true, state: 'abnormal' },
)

watch(
  () => [props.target, entity.value?.id, editable.value],
  () => {
    const parsed = parse(visibleIf.value as Record<string, unknown>)
    if (parsed) {
      form.enabled = true
      form.source = parsed.source
      form.id = parsed.id
      form.op = parsed.op
      if (parsed.op === 'state') form.state = String(parsed.value ?? 'abnormal')
      else if (parsed.op === 'truthy' || parsed.op === 'filled') form.bool = parsed.value !== false
      else form.value = parsed.value == null ? '' : String(parsed.value)
    } else {
      form.enabled = false
      // Ohne Variablen (z. B. Baustein-Editor) gibt es nur Punkt-Bezüge.
      form.source = variables.value.length ? 'var' : 'point'
      form.id = ''
      form.op = 'eq'
      form.value = ''
      form.bool = true
      form.state = 'abnormal'
    }
  },
  { immediate: true },
)

const ops = computed(() => (form.source === 'var' ? ['eq', 'truthy', 'filled'] : ['eq', 'truthy', 'filled', 'state']))
const OP_LABEL: Record<string, string> = { eq: 'ist gleich', truthy: 'ist wahr/gesetzt', filled: 'ist ausgefüllt', state: 'Zustand ist' }
const selectedVar = computed(() => variables.value.find((v) => v.id === form.id))

function coerceEq(): unknown {
  if (form.source === 'var') {
    if (selectedVar.value?.type === 'number') return form.value === '' ? '' : Number(form.value)
    if (selectedVar.value?.type === 'boolean') return form.value === 'true'
  }
  return form.value
}

function commit(): void {
  const setter = props.target === 'block' ? s.setCurrentBlockCondition : s.setCurrentPointCondition
  if (!form.enabled) { setter(null); return }
  if (!form.id) return // unvollständig — noch nicht committen
  if (!ops.value.includes(form.op)) form.op = 'eq'
  let value: unknown
  if (form.op === 'state') value = form.state
  else if (form.op === 'truthy' || form.op === 'filled') value = form.bool
  else value = coerceEq()
  setter({ source: form.source, id: form.id, op: form.op as ConditionInput['op'], value })
}

function toggleEnabled(on: boolean): void {
  form.enabled = on
  if (on && form.source === 'var' && !variables.value.length && points.value.length) {
    form.source = 'point' // beim Aktivieren sinnvolle Default-Quelle
  }
  commit()
}
function onSourceChange(): void {
  form.id = ''
  commit()
}
</script>

<template>
  <div class="flex flex-col gap-2 rounded border border-base-300 p-2">
    <span class="text-sm font-medium">Sichtbarkeit</span>

    <p v-if="isComplex" class="text-xs text-warning">
      Komplexe Regel – nur über Import/JSON sichtbar, im MVP nicht editierbar.
    </p>

    <template v-else>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="toggle toggle-sm" :checked="form.enabled" @change="toggleEnabled(($event.target as HTMLInputElement).checked)" />
        <span>{{ form.enabled ? 'Nur sichtbar, wenn …' : 'Immer sichtbar' }}</span>
      </label>

      <div v-if="form.enabled" class="flex flex-col gap-2">
        <p v-if="!variables.length && !points.length" class="text-xs text-base-content/60">
          Lege zuerst Variablen oder Punkte an.
        </p>
        <template v-else>
          <div class="flex flex-wrap gap-2">
            <!-- Quelle nur, wenn Variablen existieren; sonst ausschließlich Punkt-Bezüge
                 (z. B. Baustein-Editor: Bausteine haben keine Variablen). -->
            <select v-if="variables.length" v-model="form.source" class="select select-bordered select-xs" aria-label="Quelle" @change="onSourceChange">
              <option value="var">Variable</option>
              <option value="point">Punkt</option>
            </select>

            <select v-if="form.source === 'var'" v-model="form.id" class="select select-bordered select-xs" aria-label="Variable" @change="commit">
              <option value="" disabled>Variable wählen …</option>
              <option v-for="v in variables" :key="v.id" :value="v.id">{{ v.label ?? v.id }}</option>
            </select>
            <select v-else v-model="form.id" class="select select-bordered select-xs" aria-label="Punkt" @change="commit">
              <option value="" disabled>Punkt wählen …</option>
              <option v-for="p in points" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>

            <select v-model="form.op" class="select select-bordered select-xs" aria-label="Operator" @change="commit">
              <option v-for="o in ops" :key="o" :value="o">{{ OP_LABEL[o] }}</option>
            </select>
          </div>

          <!-- Wert je Operator -->
          <div class="flex gap-2">
            <select
              v-if="form.op === 'eq' && form.source === 'var' && selectedVar?.type === 'select'"
              v-model="form.value"
              class="select select-bordered select-xs"
              aria-label="Wert"
              @change="commit"
            >
              <option v-for="opt in selectedVar?.options ?? []" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-else-if="form.op === 'eq'"
              v-model="form.value"
              class="input input-bordered input-xs flex-1"
              placeholder="Wert"
              aria-label="Wert"
              @input="commit"
            />
            <select v-else-if="form.op === 'state'" v-model="form.state" class="select select-bordered select-xs" aria-label="Zustand" @change="commit">
              <option value="normal">normal</option>
              <option value="abnormal">auffällig</option>
            </select>
            <select v-else v-model="form.bool" class="select select-bordered select-xs" aria-label="Wahrheitswert" @change="commit">
              <option :value="true">ja</option>
              <option :value="false">nein</option>
            </select>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
