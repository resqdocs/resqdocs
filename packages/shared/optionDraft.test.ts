// Laeuft mit:  node --test --experimental-strip-types
//
// Optionen-Editor: Arbeitsliste, Übernehmen und Verweise im Baum.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Container, Field } from './model.ts'
import { findNode } from './creator.ts'
import {
  addEmptyRow,
  addLines,
  applyOptionEdit,
  draftChanged,
  draftFromField,
  draftProblems,
  effectiveDefaultKey,
  moveRow,
  planOptionEdit,
  removeRows,
  setDefaultEmpty,
  setDefaultRow,
  setExclusive,
  setRowText,
} from './optionDraft.ts'

const keys = (): (() => string) => {
  let n = 0
  return () => `k${n++}`
}
const ekg: Field = {
  type: 'field',
  id: 'ekg',
  title: 'EKG',
  options: ['Sinusrhythmus', 'Vorhofflimmern', 'ST-Hebungen'],
  multiple: true,
  default: 'Sinusrhythmus',
  exclusiveOptions: ['Sinusrhythmus'],
}
const tree = (field: Field = ekg): Container => ({
  type: 'container',
  id: 'root',
  children: [
    field,
    { type: 'field', id: 'stemi', title: 'STEMI-Meldung', dependsOn: { conditions: [{ fieldId: 'ekg', options: ['ST-Hebungen'] }] }, defaultExcluded: true },
    {
      type: 'container',
      id: 'rhythmus',
      title: 'Rhythmus',
      children: [{ type: 'field', id: 'antikoag', title: 'Antikoagulation', defaultWhen: [{ fieldId: 'ekg', options: ['Vorhofflimmern', 'ST-Hebungen'], value: 'prüfen' }] }],
    },
  ],
})
const fieldOf = (root: Container, id: string): Field => findNode(root, id) as Field

test('Arbeitsliste aus dem Feld: Standard und „allein“ hängen an der Zeile, Platzhalter fallen weg', () => {
  const d = draftFromField({ ...ekg, options: ['Sinusrhythmus', '', 'Vorhofflimmern'] }, keys())
  assert.deepEqual(d.rows.map((r) => r.text), ['Sinusrhythmus', 'Vorhofflimmern'])
  assert.equal(d.defaultKey, 'k0')
  assert.deepEqual(d.exclusive, ['k0'])
  assert.equal(d.multiple, true)
})

test('ohne Änderung ändert Übernehmen nichts, auch ohne ausdrücklichen Standard', () => {
  const plain: Field = { type: 'field', id: 'ekg', options: ['A', 'B'] }
  const d = draftFromField(plain, keys())
  assert.equal(draftChanged(plain, d), false)
  assert.equal(effectiveDefaultKey(d), 'k0', 'ohne Standard gilt die oberste Option')
  const root = tree(plain)
  const next = applyOptionEdit(root, 'ekg', planOptionEdit(root, 'ekg', d))
  assert.equal(fieldOf(next, 'ekg').default, undefined, 'kein ausdrücklicher Standard dazuerfunden')
  assert.deepEqual(fieldOf(next, 'ekg').options, ['A', 'B'])
})

test('Umbenennen zieht Standard, „allein“, Bedingungen und abhängige Standardwerte mit', () => {
  const root = tree()
  let d = draftFromField(ekg, keys())
  d = setRowText(d, 'k0', 'Sinusrhythmus, keine ST-Hebungen')
  d = setRowText(d, 'k2', 'ST-Hebungen (STEMI)')
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual([...plan.renamed], [['Sinusrhythmus', 'Sinusrhythmus, keine ST-Hebungen'], ['ST-Hebungen', 'ST-Hebungen (STEMI)']])
  assert.deepEqual(plan.affected, [], 'Umbenennen kostet keine Regel')
  const next = applyOptionEdit(root, 'ekg', plan)
  const f = fieldOf(next, 'ekg')
  assert.equal(f.default, 'Sinusrhythmus, keine ST-Hebungen')
  assert.deepEqual(f.exclusiveOptions, ['Sinusrhythmus, keine ST-Hebungen'])
  assert.deepEqual(fieldOf(next, 'stemi').dependsOn?.conditions[0].options, ['ST-Hebungen (STEMI)'])
  assert.deepEqual(fieldOf(next, 'antikoag').defaultWhen?.[0].options, ['Vorhofflimmern', 'ST-Hebungen (STEMI)'])
  assert.equal(fieldOf(root, 'stemi').dependsOn?.conditions[0].options[0], 'ST-Hebungen', 'Ausgangsbaum unverändert')
})

test('Löschen meldet betroffene Regeln und entfernt danach die Verweise', () => {
  const root = tree()
  const d = removeRows(draftFromField(ekg, keys()), ['k2'])
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual(plan.removed, ['ST-Hebungen'])
  assert.deepEqual(plan.affected, [
    { id: 'stemi', label: 'STEMI-Meldung', options: ['ST-Hebungen'] },
    { id: 'antikoag', label: 'Antikoagulation', options: ['ST-Hebungen'] },
  ])
  const next = applyOptionEdit(root, 'ekg', plan)
  // nur die entfernte Option genannt: die Bedingung bleibt wie sie war (trifft nie zu), statt leer übergangen zu werden
  assert.deepEqual(fieldOf(next, 'stemi').dependsOn?.conditions[0].options, ['ST-Hebungen'])
  assert.deepEqual(fieldOf(next, 'antikoag').defaultWhen?.[0].options, ['Vorhofflimmern'])
})

test('eigene abhängige Standardwerte: umbenannt mitziehen, entfallene Option nimmt die Regel mit', () => {
  const own: Field = { ...ekg, defaultWhen: [{ fieldId: 'x', options: ['ja'], value: 'Vorhofflimmern' }, { fieldId: 'x', options: ['nein'], value: 'ST-Hebungen' }] }
  const root = tree(own)
  let d = draftFromField(own, keys())
  d = setRowText(d, 'k1', 'Vorhofflimmern (neu)')
  d = removeRows(d, ['k2'])
  const plan = planOptionEdit(root, 'ekg', d)
  assert.ok(plan.affected.some((a) => a.id === 'ekg' && a.options.includes('ST-Hebungen')))
  const f = fieldOf(applyOptionEdit(root, 'ekg', plan), 'ekg')
  assert.deepEqual(f.defaultWhen, [{ fieldId: 'x', options: ['ja'], value: 'Vorhofflimmern (neu)' }])
})

test('alle Optionen weg: das Feld wird wieder ein Textfeld', () => {
  const root = tree()
  const d = removeRows(draftFromField(ekg, keys()), ['k0', 'k1', 'k2'])
  const f = fieldOf(applyOptionEdit(root, 'ekg', planOptionEdit(root, 'ekg', d)), 'ekg')
  for (const k of ['options', 'multiple', 'exclusiveOptions', 'defaultEmpty', 'allowCustom', 'default'] as const) assert.equal(f[k], undefined, k)
})

test('Liste einfügen: hinter einer Zeile, ohne Doppelte und Leerzeilen', () => {
  const d = draftFromField(ekg, keys())
  const r = addLines(d, 'AV-Block III°\n\n  Vorhofflimmern \nSchrittmacher-EKG', () => 'neu' + Math.random(), 'k0')
  assert.equal(r.duplicates, 1)
  assert.deepEqual(r.draft.rows.map((x) => x.text), ['Sinusrhythmus', 'AV-Block III°', 'Schrittmacher-EKG', 'Vorhofflimmern', 'ST-Hebungen'])
  assert.equal(r.added.length, 2)
})

test('Reihenfolge, leere Zeile und Prüfungen vor dem Übernehmen', () => {
  let d = draftFromField(ekg, keys())
  d = moveRow(d, 'k2', 0)
  assert.deepEqual(d.rows.map((r) => r.key), ['k2', 'k0', 'k1'])
  d = addEmptyRow(d, 'leer', 'k2')
  d = setRowText(d, 'k1', ' Sinusrhythmus ')
  const p = draftProblems(d)
  assert.equal(p.empty, 1)
  assert.deepEqual(p.duplicates, ['Sinusrhythmus'])
  assert.deepEqual(p.duplicateKeys, ['k0', 'k1'])
})

test('Standard wechseln: „Standard weicht“ wandert mit; „ohne Vorauswahl“ räumt den Standard', () => {
  let d = draftFromField(ekg, keys())
  d = setDefaultRow(d, 'k1')
  assert.equal(d.defaultKey, 'k1')
  assert.deepEqual(d.exclusive, ['k1'])
  d = setExclusive(d, 'k2', true)
  d = setDefaultEmpty(d, true)
  assert.equal(effectiveDefaultKey(d), null)
  const root = tree()
  const f = fieldOf(applyOptionEdit(root, 'ekg', planOptionEdit(root, 'ekg', d)), 'ekg')
  assert.equal(f.defaultEmpty, true)
  assert.equal(f.default, undefined)
  assert.deepEqual(f.exclusiveOptions, ['Vorhofflimmern', 'ST-Hebungen'])
})

test('ein Standard, der keine Option ist, bleibt unangetastet und zählt nicht als Änderung', () => {
  const old: Field = { type: 'field', id: 'ekg', options: ['A', 'B'], default: 'unauffällig' }
  const d = draftFromField(old, keys())
  assert.equal(draftChanged(old, d), false)
  const root = tree(old)
  assert.equal(fieldOf(applyOptionEdit(root, 'ekg', planOptionEdit(root, 'ekg', setRowText(d, 'k1', 'C'))), 'ekg').default, 'unauffällig')
})

test('ohne Treffer ändert sich nichts', () => {
  const root = tree()
  const plan = planOptionEdit(root, 'gibtsnicht', draftFromField(ekg, keys()))
  assert.equal(applyOptionEdit(root, 'gibtsnicht', plan), root)
})

test('Tausch und Kette: Verweise folgen der Zeile, nicht dem Text', () => {
  const f: Field = { type: 'field', id: 'ekg', options: ['leicht', 'mittel'] }
  const root: Container = {
    type: 'container',
    id: 'root',
    children: [
      f,
      { type: 'field', id: 'a', dependsOn: { conditions: [{ fieldId: 'ekg', options: ['mittel'] }] } },
      { type: 'field', id: 'b', dependsOn: { conditions: [{ fieldId: 'ekg', options: ['leicht'] }] } },
    ],
  }
  let d = draftFromField(f, keys())
  d = setRowText(d, 'k0', 'mittel')
  d = setRowText(d, 'k1', 'schwer')
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual(plan.removed, [])
  const next = applyOptionEdit(root, 'ekg', plan)
  assert.deepEqual(fieldOf(next, 'a').dependsOn?.conditions[0].options, ['schwer'])
  assert.deepEqual(fieldOf(next, 'b').dependsOn?.conditions[0].options, ['mittel'])
})

test('entfernte Option, deren Text eine andere übernimmt: als Zusammenstoß gemeldet (nicht übernehmbar)', () => {
  const f: Field = { type: 'field', id: 'ekg', options: ['A', 'B'] }
  const root: Container = { type: 'container', id: 'root', children: [f, { type: 'field', id: 'x', title: 'X', dependsOn: { conditions: [{ fieldId: 'ekg', options: ['B'] }] } }] }
  let d = removeRows(draftFromField(f, keys()), ['k1'])
  d = setRowText(d, 'k0', 'B')
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual(plan.removed, ['B'])
  assert.deepEqual(plan.collisions, ['B'])
})

test('doppelte alte Option: Umbenennen der einen lässt Standard und Verweise beim alten Text', () => {
  const f: Field = { type: 'field', id: 'ekg', options: ['A', 'A', 'B'], default: 'A' }
  const root: Container = { type: 'container', id: 'root', children: [f, { type: 'field', id: 'x', dependsOn: { conditions: [{ fieldId: 'ekg', options: ['A'] }] } }] }
  const d = setRowText(draftFromField(f, keys()), 'k0', 'A2')
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual([...plan.renamed], [])
  const next = applyOptionEdit(root, 'ekg', plan)
  assert.deepEqual(JSON.parse(JSON.stringify(fieldOf(next, 'ekg'))), { ...f, options: ['A2', 'A', 'B'], default: 'A' })
  assert.deepEqual(fieldOf(next, 'x').dependsOn?.conditions[0].options, ['A'])
})

test('„ohne Vorauswahl“ an und wieder aus: der gesetzte Standard bleibt', () => {
  const f: Field = { type: 'field', id: 'ekg', options: ['A', 'B', 'C'], multiple: true, default: 'B' }
  const d = setDefaultEmpty(setDefaultEmpty(draftFromField(f, keys()), true), false)
  assert.equal(draftChanged(f, d), false)
  assert.equal(effectiveDefaultKey(d), 'k1')
})

test('Leerraum unveränderter Optionen bleibt exakt, nur geänderte werden geglättet', () => {
  const f: Field = { type: 'field', id: 'ekg', options: ['a  b', 'c'] }
  const root = tree(f)
  const d = setRowText(draftFromField(f, keys()), 'k1', ' c  c ')
  const plan = planOptionEdit(root, 'ekg', d)
  assert.deepEqual([...plan.renamed], [['c', 'c c']])
  assert.deepEqual(fieldOf(applyOptionEdit(root, 'ekg', plan), 'ekg').options, ['a  b', 'c c'])
})
