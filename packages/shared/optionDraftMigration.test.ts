// Laeuft mit:  node --test --experimental-strip-types
//
// Bestehende Vorlagen und der Optionen-Editor: Das Vorlagenformat ändert sich nicht, Vorlagen werden also nicht
// umgeschrieben. Dieser Wächter stellt sicher, dass Öffnen und Übernehmen ohne Änderung jedes Feld exakt so lässt,
// wie es war - für alle mitgelieferten Vorlagen und für Altlasten, die ältere Editor-Stände erzeugen konnten
// (leere Platzhalter, Doppelte, Standard außerhalb der Liste, Leerraum, „allein“ ohne Mehrfachauswahl …).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Container, Field, Node } from './model.ts'
import { applyOptionEdit, draftChanged, draftFromField, planOptionEdit, setRowText } from './optionDraft.ts'
import { findNode } from './creator.ts'

const read = (p: string): Container => {
  const j = JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as { tree?: Container } & Container
  return j.tree ?? j
}
const TEMPLATES: Record<string, Container> = {
  'ai-docs/standardprotokoll': read('../../ai-docs/examples/standardprotokoll.json'),
  'ai-docs/multiselect': read('../../ai-docs/examples/multiselect.json'),
  'ai-docs/simple': read('../../ai-docs/examples/simple.json'),
}

const LEGACY: Field[] = [
  { type: 'field', id: 'l1', options: ['A', '', 'B', ''] },
  { type: 'field', id: 'l2', options: ['A', 'A', 'B'], default: 'A' },
  { type: 'field', id: 'l3', options: ['A', 'B'], default: 'unauffällig' },
  { type: 'field', id: 'l4', options: ['a  b', ' c '], default: ' c ' },
  { type: 'field', id: 'l5', options: ['A', 'B'], exclusiveOptions: ['A'] },
  { type: 'field', id: 'l6', options: ['A', 'B'], multiple: true, exclusiveOptions: ['A', 'gibt es nicht'] },
  { type: 'field', id: 'l7', options: ['A', 'B'], defaultEmpty: true },
  { type: 'field', id: 'l8', options: ['A', 'B'], multiple: true, defaultEmpty: true, default: 'B' },
  { type: 'field', id: 'l9', options: ['stabil', 'gebessert'], multiline: true, allowCustom: true, customMultiline: true },
  { type: 'field', id: 'l10', options: ['', ''] },
  { type: 'field', id: 'l11', options: ['A', 'B'], defaultWhen: [{ fieldId: 'l6', options: ['A'], value: 'B' }, { fieldId: 'l6', options: [], value: 'X' }] },
  { type: 'field', id: 'l12', dependsOn: { conditions: [{ fieldId: 'l2', options: ['A', 'weg'] }] }, options: ['ja'] },
]

function fields(n: Node, out: Field[] = []): Field[] {
  if (n.type === 'field' && Array.isArray(n.options)) out.push(n)
  if (n.type === 'container') n.children.forEach((c) => fields(c, out))
  return out
}

function untouched(root: Container, label: string): number {
  let checked = 0
  for (const f of fields(root)) {
    let k = 0
    const d = draftFromField(f, () => `k${k++}`)
    assert.equal(draftChanged(f, d), false, `${label}/${f.id}: unberührt gilt nicht als Änderung`)
    // „Übernehmen“ ohne Änderung schreibt das Feld trotzdem: es muss gleich bleiben (Altlasten eingeschlossen,
    // soweit sie wirken; leere Platzhalter werden nicht erfunden).
    const next = applyOptionEdit(root, f.id, planOptionEdit(root, f.id, d))
    const after = findNode(next, f.id) as Field
    assert.deepEqual(after.options?.filter((o) => o !== ''), f.options?.filter((o) => o !== '').length ? f.options.filter((o) => o !== '') : undefined, `${label}/${f.id}: Optionen`)
    assert.equal(after.default, f.default === undefined || (f.multiple && f.defaultEmpty) ? (f.multiple && f.defaultEmpty ? undefined : f.default) : f.default, `${label}/${f.id}: Standard`)
    for (const other of fields(root)) if (other.id !== f.id) assert.deepEqual(findNode(next, other.id), other, `${label}/${f.id}: anderes Feld ${other.id} unverändert`)
    checked++
  }
  return checked
}

test('mitgelieferte Vorlagen: Öffnen und Übernehmen ohne Änderung lässt jedes Feld, wie es ist', () => {
  let n = 0
  for (const [label, root] of Object.entries(TEMPLATES)) n += untouched(root, label)
  assert.ok(n >= 10, `zu wenige Auswahlfelder geprüft (${n})`)
})

test('Altlasten älterer Editor-Stände: nichts wird ungefragt umgeschrieben', () => {
  const root: Container = { type: 'container', id: 'root', children: LEGACY }
  for (const f of LEGACY) {
    let k = 0
    const d = draftFromField(f, () => `k${k++}`)
    assert.equal(draftChanged(f, d), false, `${f.id}: unberührt gilt nicht als Änderung`)
  }
  untouched(root, 'legacy')
})

test('Altlasten: eine echte Änderung an einer Zeile lässt die übrigen Zeilen exakt', () => {
  const f = LEGACY[3] // ['a  b', ' c ']
  const root: Container = { type: 'container', id: 'root', children: [f] }
  let k = 0
  const d = setRowText(draftFromField(f, () => `k${k++}`), 'k0', 'a  b neu')
  const after = findNode(applyOptionEdit(root, f.id, planOptionEdit(root, f.id, d)), f.id) as Field
  assert.deepEqual(after.options, ['a b neu', ' c '])
  assert.equal(after.default, ' c ', 'Standard bleibt am unveränderten Text')
})
