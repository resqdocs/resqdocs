// Laeuft mit:  node --test --experimental-strip-types
//
// Strenger Wächter für alte Listen: Viele tausend zufällige Auswahlfelder mit allem, was alte Editor-Stände,
// Importe und KI-Dateien hinterlassen können (Leerraum, Zahlen, Wahrheitswerte, leere Platzhalter, null, Objekte,
// Standard außerhalb der Liste, „allein“ ohne Mehrfachauswahl, Bedingungen anderer Elemente …). Geprüft wird je
// Feld, dass der Optionen-Editor
//   1. eine unberührte Liste nie als Änderung ansieht (dann schreibt das Fenster nichts),
//   2. beim Umbenennen, Entfernen und Sortieren EINER Zeile genau das ändert und sonst nichts.
// Der Zufall ist fest (gleiche Folge bei jedem Lauf), ein Fehler lässt sich also nachstellen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Condition, Container, Field, Node } from './model.ts'
import { findNode } from './creator.ts'
import { applyOptionEdit, draftChanged, draftFromField, moveRow, planOptionEdit, removeRows, setRowText } from './optionDraft.ts'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const POOL: unknown[] = ['A', 'B', 'C', 'Sinusrhythmus, keine ST-Hebungen.', 'a  b', ' c ', 'Ä ö ß', 'x\ny', 0, 5, 10, 2.5, true, false, '', '', null, { value: 'v', label: 'L' }, ['z']]
const isOpt = (o: unknown): boolean => (typeof o === 'string' && o !== '') || typeof o === 'number' || typeof o === 'boolean'
const k = (o: unknown): string => String(o)
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

interface Case {
  root: Container
  field: Field
}
function makeCase(r: () => number): Case {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]
  const n = 1 + Math.floor(r() * 7)
  const options = Array.from({ length: n }, () => pick(POOL))
  const valid = options.filter(isOpt)
  const multiple = r() < 0.5
  const field: Field = { type: 'field', id: 'f', title: 'Liste', options: options as string[] }
  if (multiple) field.multiple = true
  const dr = r()
  if (dr < 0.4 && valid.length) field.default = pick(valid) as string
  else if (dr < 0.5) field.default = 'nicht in der Liste'
  if (r() < 0.5 && valid.length) field.exclusiveOptions = [pick(valid) as string, ...(r() < 0.3 ? ['gibt es nicht'] : [])]
  if (r() < 0.2) field.defaultEmpty = true
  if (r() < 0.2) field.allowCustom = true
  if (r() < 0.15 && valid.length) field.defaultWhen = [{ fieldId: 'q', options: ['ja'], value: pick(valid) as string }]
  const refOpts = (): string[] => {
    const m = Math.floor(r() * 3)
    return Array.from({ length: m }, () => (valid.length && r() < 0.8 ? pick(valid) : 'weg')) as string[]
  }
  const others: Node[] = [
    { type: 'field', id: 'q', title: 'Quelle', options: ['ja', 'nein'] },
    { type: 'field', id: 'd1', title: 'Abhängig 1', dependsOn: { conditions: [{ fieldId: 'f', options: refOpts() }] }, defaultExcluded: true },
    { type: 'field', id: 'd2', title: 'Abhängig 2', dependsOn: { conditions: [{ fieldId: 'f', options: refOpts() }, { fieldId: 'q', options: ['ja'] }], match: 'any' } },
    { type: 'field', id: 'd3', title: 'Standardregel', options: ['x', 'y'], defaultWhen: [{ fieldId: 'f', options: refOpts(), value: 'y' }] },
    { type: 'container', id: 'c', title: 'Abschnitt', children: [{ type: 'field', id: 'u', title: 'Unbeteiligt', default: 'A' }], dependsOn: { conditions: [{ fieldId: 'f', options: refOpts() }] }, excludable: true },
  ]
  const root: Container = { type: 'container', id: 'root', children: [field, ...others] }
  return { root: clone(root), field: clone(root).children[0] as Field }
}

const keyCounter = (): (() => string) => {
  let i = 0
  return () => `k${i++}`
}
const condOf = (root: Container, id: string, i = 0): Condition => (findNode(root, id) as Node).dependsOn!.conditions[i]
const N = 4000

test(`unberührt: ${N} zufällige alte Listen gelten nie als Änderung`, () => {
  const r = rng(20261120)
  for (let i = 0; i < N; i++) {
    const { field } = makeCase(r)
    const d = draftFromField(field, keyCounter())
    assert.equal(draftChanged(field, d), false, `Fall ${i}: ${JSON.stringify(field)}`)
  }
})

test(`eine Zeile umbenennen: genau diese Option und ihre Verweise ändern sich, sonst nichts (${N} Fälle)`, () => {
  const r = rng(7)
  let checked = 0
  for (let i = 0; i < N; i++) {
    const { root, field } = makeCase(r)
    const before = clone(root)
    const d0 = draftFromField(field, keyCounter())
    const keys = d0.rows.map((x) => x.from!)
    if (!d0.rows.length || new Set(keys).size !== keys.length) continue // Doppelte: das Fenster lässt erst nach Bereinigung übernehmen
    const idx = Math.floor(r() * d0.rows.length)
    const row = d0.rows[idx]
    const T = `Neu ${i}`
    const next = applyOptionEdit(root, 'f', planOptionEdit(root, 'f', setRowText(d0, row.key, T)))
    assert.deepEqual(root, before, `Fall ${i}: Ausgangsbaum verändert`)
    const f = findNode(next, 'f') as Field
    const expectOpts = (field.options as unknown[]).filter(isOpt).map((o) => (k(o) === row.from ? T : o))
    assert.deepEqual(f.options, expectOpts, `Fall ${i}: Optionen`)
    // Standard
    if (field.multiple && field.defaultEmpty) assert.equal(f.default, undefined, `Fall ${i}: ohne Vorauswahl`)
    else if (field.default !== undefined && k(field.default) === row.from) assert.equal(f.default, T, `Fall ${i}: Standard folgt`)
    else assert.equal(f.default, field.default, `Fall ${i}: Standard unverändert`)
    // „allein“
    const exp = (field.exclusiveOptions ?? []).filter((o) => (field.options as unknown[]).some((x) => isOpt(x) && k(x) === k(o))).map((o) => (k(o) === row.from ? T : o))
    assert.deepEqual(f.exclusiveOptions ?? [], [...new Set(exp)], `Fall ${i}: allein`)
    // Verweise
    for (const [id, idxC] of [['d1', 0], ['d2', 0], ['c', 0]] as const) {
      const o = condOf(before, id, idxC).options
      assert.deepEqual(condOf(next, id, idxC).options, o.map((x) => (k(x) === row.from ? T : x)), `Fall ${i}: Bedingung ${id}`)
    }
    assert.deepEqual(condOf(next, 'd2', 1), condOf(before, 'd2', 1), `Fall ${i}: fremde Bedingung`)
    const d3 = findNode(next, 'd3') as Field
    assert.deepEqual(d3.defaultWhen![0].options, (findNode(before, 'd3') as Field).defaultWhen![0].options.map((x) => (k(x) === row.from ? T : x)))
    assert.equal(findNode(next, 'q'), findNode(root, 'q'), `Fall ${i}: unbeteiligtes Feld bleibt dasselbe Objekt`)
    assert.deepEqual(findNode(next, 'u'), findNode(before, 'u'))
    checked++
  }
  assert.ok(checked > N / 3, `zu wenige Fälle geprüft (${checked})`)
})

test(`eine Zeile entfernen: Option weg, Bedingungen verlieren sie nur, wenn etwas übrig bleibt (${N} Fälle)`, () => {
  const r = rng(99)
  for (let i = 0; i < N; i++) {
    const { root, field } = makeCase(r)
    const d0 = draftFromField(field, keyCounter())
    const keys = d0.rows.map((x) => x.from!)
    if (d0.rows.length < 2 || new Set(keys).size !== keys.length) continue
    const row = d0.rows[Math.floor(r() * d0.rows.length)]
    const plan = planOptionEdit(root, 'f', removeRows(d0, [row.key]))
    assert.deepEqual(plan.removed, [row.from], `Fall ${i}`)
    const next = applyOptionEdit(root, 'f', plan)
    const f = findNode(next, 'f') as Field
    assert.deepEqual(f.options, (field.options as unknown[]).filter((o) => isOpt(o) && k(o) !== row.from), `Fall ${i}: Optionen`)
    for (const id of ['d1', 'c']) {
      const o = condOf(root, id).options
      const kept = o.filter((x) => k(x) !== row.from)
      assert.deepEqual(condOf(next, id).options, kept.length ? kept : o, `Fall ${i}: Bedingung ${id}`)
    }
    const refs = ['d1', 'd2', 'd3', 'c'].filter((id) => {
      const n = findNode(root, id) as Node
      const lists = [...(n.dependsOn?.conditions ?? []).filter((c) => c.fieldId === 'f').map((c) => c.options), ...(n.type === 'field' ? (n.defaultWhen ?? []).filter((w) => w.fieldId === 'f').map((w) => w.options) : [])]
      return lists.some((l) => l.some((x) => k(x) === row.from))
    })
    const ownRule = (field.defaultWhen ?? []).some((w) => k(w.value) === row.from)
    assert.deepEqual(plan.affected.map((a) => a.id).sort(), [...refs, ...(ownRule ? ['f'] : [])].sort(), `Fall ${i}: gemeldete Regeln`)
  }
})

test(`Reihenfolge ändern: nur die Reihenfolge, Werte und alles andere bleiben (${N} Fälle)`, () => {
  const r = rng(4242)
  for (let i = 0; i < N; i++) {
    const { root, field } = makeCase(r)
    const d0 = draftFromField(field, keyCounter())
    if (d0.rows.length < 2) continue
    const row = d0.rows[0]
    const next = applyOptionEdit(root, 'f', planOptionEdit(root, 'f', moveRow(d0, row.key, d0.rows.length - 1)))
    const f = findNode(next, 'f') as Field
    const valid = (field.options as unknown[]).filter(isOpt)
    assert.deepEqual(f.options, [...valid.slice(1), valid[0]], `Fall ${i}: Optionen`)
    for (const id of ['q', 'd1', 'd2', 'd3', 'c']) assert.equal(findNode(next, id), findNode(root, id), `Fall ${i}: ${id} unberührt`)
  }
})
