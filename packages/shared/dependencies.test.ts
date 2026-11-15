// Tests fuer die Abhaengigkeit zwischen Elementen (dependencies.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Container, Dependency, Field, FieldFill, FunctionNode, Node } from './model.ts'
import { render } from './render.ts'
import { countDeviations } from './deviations.ts'
import { updateNode } from './creator.ts'
import { reId } from './library.ts'
import {
  syncDependencies, hiddenByDependency, dependencyCandidates, resolveDefaults, isAutoFill, hasManualInput, manualValues,
} from './dependencies.ts'

type Values = Record<string, FieldFill>
const field = (id: string, extra: Partial<Field> = {}): Field => ({ type: 'field', id, title: id, ...extra })
const box = (id: string, children: Node[], extra: Partial<Container> = {}): Container => ({ type: 'container', id, children, ...extra })

/** Regel mit EINER Bedingung. */
const when = (fieldId: string, options: string[]): Dependency => ({ conditions: [{ fieldId, options }] })

const rea = field('rea', { options: ['nein', 'ja'], default: 'nein' })
const verlauf = field('verlauf', { default: 'CPR 30:2', defaultExcluded: true, dependsOn: when('rea', ['ja']) })
const root = box('root', [rea, verlauf])
const waehle = (id: string, value: string): FieldFill => ({ state: 'custom', value })

test('ohne Auswahl bleibt das abhängige Feld aus; die Werte bleiben unberührt', () => {
  const values: Values = {}
  assert.equal(syncDependencies(root, values), values, 'gleiche Referenz = nichts zu schreiben')
  assert.equal(render(root, values), 'nein')
  assert.deepEqual([...hiddenByDependency(root, values)], ['verlauf'])
})

test('gewählte Option schaltet das Feld ein, Abwählen wieder aus', () => {
  const an = syncDependencies(root, { rea: waehle('rea', 'ja') })
  assert.ok(isAutoFill(an.verlauf))
  assert.equal(render(root, an), 'ja\nCPR 30:2')
  assert.equal(hiddenByDependency(root, an).size, 0)
  const aus = syncDependencies(root, { ...an, rea: waehle('rea', 'nein') })
  assert.equal(aus.verlauf, undefined, 'der automatische Eintrag ist wieder weg')
  assert.equal(render(root, aus), 'nein')
  assert.equal(syncDependencies(root, aus), aus, 'danach ist Ruhe')
})

test('von Hand geht vor: eigener Zustand wird von der Regel nicht angefasst', () => {
  const vonHandAus: Values = { rea: waehle('rea', 'ja'), verlauf: { state: 'excluded' } }
  assert.equal(syncDependencies(root, vonHandAus), vonHandAus)
  const vonHandAn: Values = { verlauf: { state: 'custom', value: 'eigener Text' } }
  assert.equal(syncDependencies(root, vonHandAn), vonHandAn)
  assert.equal(hiddenByDependency(root, vonHandAn).size, 0, 'von Hand eingeschaltet bleibt sichtbar')
})

test('Mehrfachauswahl als Quelle: eine der Optionen genügt', () => {
  const ekg = field('ekg', { options: ['SR', 'ST-Hebung', 'VHF'], default: 'SR', multiple: true })
  const stemi = field('stemi', { default: 'STEMI gemeldet', defaultExcluded: true, dependsOn: when('ekg', ['ST-Hebung']) })
  const r = box('root', [ekg, stemi])
  assert.equal(syncDependencies(r, {}).stemi, undefined)
  const v = syncDependencies(r, { ekg: { state: 'custom', value: 'ST-Hebung und VHF', values: ['ST-Hebung', 'VHF'] } })
  assert.ok(isAutoFill(v.stemi))
})

test('Standardwert der Quelle erfüllt die Bedingung schon beim Start', () => {
  const r = box('root', [field('rea', { options: ['ja', 'nein'], default: 'ja' }), verlauf])
  const v = syncDependencies(r, {})
  assert.ok(isAutoFill(v.verlauf))
  assert.equal(hasManualInput(v), false, 'das ist keine Eingabe des Anwenders')
  assert.deepEqual(manualValues(v), {})
})

test('Abschnitt und Funktion als abhängiges Element', () => {
  const abschnitt = box('neuro', [field('pupillen', { default: 'isokor' })], { excludable: true, defaultExcluded: true, dependsOn: when('rea', ['ja']) })
  const fn: FunctionNode = { type: 'function', id: 'lams', functionKind: 'lams', defaultExcluded: true, dependsOn: when('rea', ['ja']) }
  const r = box('root', [rea, abschnitt, fn])
  const v = syncDependencies(r, { rea: waehle('rea', 'ja') })
  assert.deepEqual(v.neuro, { state: 'confirmed', auto: true })
  assert.deepEqual(v.lams, { state: 'function', rows: [], auto: true })
  assert.ok(render(r, v).includes('isokor'))
  assert.equal(syncDependencies(r, { ...v, rea: waehle('rea', 'nein') }).neuro, undefined)
})

test('Kette: A schaltet B, B schaltet C; fällt A weg, fallen beide', () => {
  const b = field('b', { options: ['x', 'y'], default: 'y', defaultExcluded: true, dependsOn: when('rea', ['ja']) })
  const c = field('c', { default: 'C', defaultExcluded: true, dependsOn: when('b', ['y']) })
  const r = box('root', [rea, b, c])
  const v = syncDependencies(r, { rea: waehle('rea', 'ja') })
  assert.ok(isAutoFill(v.b) && isAutoFill(v.c))
  const zurueck = syncDependencies(r, { ...v, rea: waehle('rea', 'nein') })
  assert.deepEqual(Object.keys(zurueck), ['rea'], 'ein nicht erhobenes Quellfeld löst nichts aus')
})

test('Quelle in einem nicht erhobenen Abschnitt löst nichts aus', () => {
  const r = box('root', [box('a', [field('rea', { options: ['ja', 'nein'], default: 'ja' })], { excludable: true }), verlauf])
  assert.ok(isAutoFill(syncDependencies(r, {}).verlauf))
  const v: Values = { a: { state: 'excluded' } }
  assert.equal(syncDependencies(r, v), v)
})

test('ungültige Regeln sind wirkungslos', () => {
  const faelle: Node[] = [
    field('x', { defaultExcluded: true, dependsOn: when('gibtsnicht', ['ja']) }),
    field('x', { defaultExcluded: true, dependsOn: when('rea', []) }),
    field('x', { defaultExcluded: true, dependsOn: when('x', ['ja']) }),
    box('x', [], { defaultExcluded: true, dependsOn: when('rea', ['ja']) }), // nicht markierbar
  ]
  for (const n of faelle) {
    const r = box('root', [rea, n])
    const v: Values = { rea: waehle('rea', 'ja') }
    assert.equal(syncDependencies(r, v), v)
    assert.equal(hiddenByDependency(r, v).size, 0)
  }
  const frei = box('root', [field('text', { default: 'ja' }), field('x', { defaultExcluded: true, dependsOn: when('text', ['ja']) })])
  assert.equal(syncDependencies(frei, {}).x, undefined, 'Freitextfeld ist keine Quelle')
})

test('ohne „startet auf nicht erhoben“ blendet die Regel das Element selbst aus', () => {
  const offen = field('offen', { default: 'Text', dependsOn: when('rea', ['ja']) })
  const r = box('root', [rea, offen])
  const v = syncDependencies(r, {})
  assert.deepEqual(v.offen, { state: 'excluded', auto: true })
  assert.equal(render(r, v), 'nein')
  assert.equal(syncDependencies(r, { ...v, rea: waehle('rea', 'ja') }).offen, undefined)
})

test('ein Kreis bleibt nicht hängen', () => {
  const a = field('a', { options: ['1', '2'], default: '1', defaultExcluded: true, dependsOn: when('b', ['1']) })
  const b = field('b', { options: ['1', '2'], default: '1', defaultExcluded: true, dependsOn: when('a', ['1']) })
  assert.ok(syncDependencies(box('root', [a, b]), {}))
})

test('automatisch eingeschaltete Elemente zählen nicht als Abweichung', () => {
  const v = syncDependencies(root, { rea: waehle('rea', 'ja') })
  assert.equal(countDeviations(root, v), 1, 'nur die Auswahl selbst')
  assert.equal(countDeviations(root, { ...v, verlauf: { state: 'custom', value: 'x' } }), 2)
})

test('Kandidaten im Editor: nur Auswahlfelder, nie das Element selbst, nichts darunter, kein Kreis', () => {
  const b = field('b', { options: ['x', 'y'], dependsOn: when('rea', ['ja']) })
  const innen = field('innen', { options: ['1', '2'] })
  const abschnitt = box('abschnitt', [innen], { excludable: true, dependsOn: when('b', ['x']) })
  const frei = field('frei')
  const r = box('root', [rea, b, abschnitt, frei])
  const ids = (n: Node): string[] => dependencyCandidates(r, n).map((f) => f.id)
  assert.deepEqual(ids(frei), ['rea', 'b', 'innen'])
  assert.deepEqual(ids(abschnitt), ['rea', 'b'], 'nichts aus dem eigenen Abschnitt')
  assert.deepEqual(ids(rea), [], 'b hängt an rea, innen über den Abschnitt an b')
  assert.deepEqual(ids(b), ['rea'], 'innen hängt über den Abschnitt an b')
})

test('Umbenennen des Quellfeldes zieht die Regel mit', () => {
  const r = updateNode(root, 'rea', { id: 'reanimation' })
  const dep = (r.children[1] as Field).dependsOn
  assert.deepEqual(dep, when('reanimation', ['ja']))
  assert.equal(updateNode(root, 'rea', { title: 'x' }).children[1], root.children[1], 'ohne neue Kennung bleibt der Rest unberührt')
})

test('Kopie mit frischen Kennungen: Regeln innerhalb der Kopie zeigen auf die Kopie', () => {
  let n = 0
  const copy = reId(root, () => `neu${++n}`) as Container
  assert.deepEqual(copy.children.map((c) => c.id), ['neu2', 'neu3'])
  assert.deepEqual((copy.children[1] as Field).dependsOn, when('neu2', ['ja']))
  const nurFeld = reId(verlauf, () => 'solo') as Field
  assert.deepEqual(nurFeld.dependsOn, when('rea', ['ja']), 'Verweis nach außen bleibt stehen')
})

// --- mehrere Bedingungen ---

const ekg = field('ekg', { options: ['SR', 'ST-Hebung'], default: 'SR' })
const schmerz = field('schmerz', { options: ['nein', 'ja'], default: 'nein' })
const beide = (match?: 'any'): Container =>
  box('root', [ekg, schmerz, field('acs', { default: 'V. a. ACS', defaultExcluded: true, dependsOn: { conditions: [{ fieldId: 'ekg', options: ['ST-Hebung'] }, { fieldId: 'schmerz', options: ['ja'] }], ...(match ? { match } : {}) } })])

test('mehrere Bedingungen: ohne match müssen alle zutreffen', () => {
  const r = beide()
  assert.equal(syncDependencies(r, { ekg: waehle('ekg', 'ST-Hebung') }).acs, undefined)
  assert.ok(isAutoFill(syncDependencies(r, { ekg: waehle('ekg', 'ST-Hebung'), schmerz: waehle('schmerz', 'ja') }).acs))
})

test('mehrere Bedingungen: mit match any genügt eine', () => {
  const r = beide('any')
  assert.equal(syncDependencies(r, {}).acs, undefined)
  assert.ok(isAutoFill(syncDependencies(r, { schmerz: waehle('schmerz', 'ja') }).acs))
})

test('eine ungültige Bedingung wird übergangen statt das Element für immer zu verstecken', () => {
  const r = box('root', [ekg, field('acs', { default: 'x', defaultExcluded: true, dependsOn: { conditions: [{ fieldId: 'ekg', options: ['ST-Hebung'] }, { fieldId: 'gelöscht', options: ['ja'] }] } })])
  assert.ok(isAutoFill(syncDependencies(r, { ekg: waehle('ekg', 'ST-Hebung') }).acs))
})

// --- abhängiger Standardwert ---

const transport = field('transport', { options: ['RTW', 'NEF-Begleitung', 'Verbleib'], default: 'RTW' })
const uebergabe = field('uebergabe', { default: 'Übergabe an ZNA', defaultWhen: [{ fieldId: 'transport', options: ['Verbleib'], value: 'Pat. verbleibt vor Ort' }] })
const inhalt = box('root', [transport, uebergabe])

test('abhängiger Standardwert: gilt, solange die Bedingung zutrifft; die Werte bleiben unberührt', () => {
  assert.equal(resolveDefaults(inhalt, {}), inhalt, 'keine Regel greift: dieselbe Vorlage')
  const v: Values = { transport: waehle('transport', 'Verbleib') }
  const eff = resolveDefaults(inhalt, v)
  assert.equal((eff.children[1] as Field).default, 'Pat. verbleibt vor Ort')
  assert.equal(eff.children[0], transport, 'unbeteiligte Felder behalten ihre Identität')
  assert.equal(render(eff, v), 'Verbleib\nPat. verbleibt vor Ort')
  assert.equal(render(resolveDefaults(inhalt, {}), {}), 'RTW\nÜbergabe an ZNA')
})

test('abhängiger Standardwert: eigener Text des Anwenders geht vor', () => {
  const v: Values = { transport: waehle('transport', 'Verbleib'), uebergabe: { state: 'custom', value: 'eigener Text' } }
  assert.equal(render(resolveDefaults(inhalt, v), v), 'Verbleib\neigener Text')
})

test('abhängiger Standardwert: erste zutreffende Regel gewinnt; bei Auswahlfeldern nur gültige Optionen', () => {
  const ziel = field('ziel', { options: ['A', 'B', 'C'], default: 'A', defaultWhen: [
    { fieldId: 'transport', options: ['Verbleib'], value: 'gibt es nicht' },
    { fieldId: 'transport', options: ['Verbleib', 'RTW'], value: 'B' },
    { fieldId: 'transport', options: ['RTW'], value: 'C' },
  ] })
  const r = box('root', [transport, ziel])
  assert.equal((resolveDefaults(r, {}).children[1] as Field).default, 'B')
  assert.equal((resolveDefaults(r, { transport: waehle('transport', 'NEF-Begleitung') }).children[1] as Field).default, 'A')
})

test('abhängiger Standardwert löst seinerseits eine Erscheinen-Regel aus', () => {
  const ziel = field('ziel', { options: ['Klinik', 'keins'], default: 'Klinik', defaultWhen: [{ fieldId: 'transport', options: ['Verbleib'], value: 'keins' }] })
  const hinweis = field('hinweis', { default: 'Aufklärung erfolgt', defaultExcluded: true, dependsOn: when('ziel', ['keins']) })
  const r = box('root', [transport, ziel, hinweis])
  const v: Values = { transport: waehle('transport', 'Verbleib') }
  const eff = resolveDefaults(r, v)
  const synced = syncDependencies(eff, v)
  assert.ok(isAutoFill(synced.hinweis))
  assert.equal(render(eff, synced), 'Verbleib\nkeins\nAufklärung erfolgt')
})

test('abhängiger Standardwert als Kette und im Kreis bleibt nicht hängen', () => {
  const a = field('a', { options: ['1', '2'], default: '1', defaultWhen: [{ fieldId: 'transport', options: ['Verbleib'], value: '2' }] })
  const b = field('b', { default: 'x', defaultWhen: [{ fieldId: 'a', options: ['2'], value: 'y' }] })
  const r = box('root', [transport, a, b])
  assert.equal((resolveDefaults(r, { transport: waehle('transport', 'Verbleib') }).children[2] as Field).default, 'y')
  const k1 = field('k1', { options: ['1', '2'], default: '1', defaultWhen: [{ fieldId: 'k2', options: ['1'], value: '2' }] })
  const k2 = field('k2', { options: ['1', '2'], default: '1', defaultWhen: [{ fieldId: 'k1', options: ['2'], value: '2' }] })
  assert.ok(resolveDefaults(box('root', [k1, k2]), {}))
})

test('Kandidaten und Umbenennen berücksichtigen auch den abhängigen Standardwert', () => {
  const ids = (n: Node): string[] => dependencyCandidates(inhalt, n).map((f) => f.id)
  assert.deepEqual(ids(transport), [], 'uebergabe hat keine Optionen; nichts anderes da')
  const ziel = field('ziel', { options: ['A', 'B'], defaultWhen: [{ fieldId: 'transport', options: ['Verbleib'], value: 'B' }] })
  const r = box('root', [transport, ziel])
  assert.deepEqual(dependencyCandidates(r, transport).map((f) => f.id), [], 'ziel hängt schon an transport')
  const renamed = updateNode(r, 'transport', { id: 't2' })
  assert.equal((renamed.children[1] as Field).defaultWhen?.[0].fieldId, 't2')
})
