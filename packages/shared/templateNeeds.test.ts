// Vermerk im Export und Hinweis beim Import: Eine ältere App soll sagen, was sie an einer Vorlage nicht kennt,
// statt sie still zu beschneiden. Die Formatversion bleibt 1, der Import wird nie verhindert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Container } from './model.ts'
import { exportTemplate, exportTemplates, parseTemplate, PROTOCOL_VERSION } from './templateIO.ts'
import { exportCollection } from './collectionIO.ts'
import { detectAndParse } from './importRouter.ts'
import { FUNCTION_KINDS } from './functions/registry.ts'
import { KNOWN_PROPS, importNotice, mergeNeeds, parseNeeds, templateNeeds, unknownParts, type FeatureVersions } from './templateNeeds.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const fv = JSON.parse(readFileSync(join(HERE, '../../ai-docs/feature-versions.json'), 'utf8')) as FeatureVersions
const since = (prop: string, on: string): string => fv.fields.find((f) => f.prop === prop && f.on.includes(on))!.minVersion
const name = (prop: string, on: string): string => fv.fields.find((f) => f.prop === prop && f.on.includes(on))!.de

const vorlage = (children: unknown[]): Container => ({ type: 'container', id: 'root', title: 'Test', children } as unknown as Container)
const schlicht = vorlage([{ type: 'field', id: 'f1', title: 'Puls', options: ['80'] }])
const mehrfach = vorlage([{ type: 'field', id: 'f1', title: 'EKG', options: ['SR', 'VHF'], multiple: true, exclusiveOptions: ['SR'] }])

test('Vorlage ohne neuere Funktionen: kein Vermerk, Datei wie bisher', () => {
  assert.equal(templateNeeds(fv, [schlicht]), null)
  assert.deepEqual(Object.keys(JSON.parse(exportTemplate(schlicht, fv))), ['schema', 'version', 'tree'])
  assert.equal(exportTemplate(schlicht, fv), exportTemplate(schlicht))
})

test('Vermerk nennt genutzte Funktionen mit Namen und Version, die höchste als nötige App-Version', () => {
  const zops = fv.functions.find((f) => f.kind === 'zops')!
  const n = templateNeeds(fv, [vorlage([...mehrfach.children, { type: 'function', id: 'z', title: 'ZOPS', functionKind: 'zops', defaultExcluded: true }])])!
  assert.deepEqual(n.features.find((f) => f.key === 'multiple'), { key: 'multiple', name: name('multiple', 'field'), since: since('multiple', 'field') })
  assert.deepEqual(n.features.find((f) => f.key === 'function:zops'), { key: 'function:zops', name: zops.de, since: zops.minVersion })
  // dieselbe Eigenschaft gilt an der Funktion ab einer anderen Version als am Feld: es zählt die des Elements
  assert.equal(n.features.find((f) => f.key === 'defaultExcluded')!.since, since('defaultExcluded', 'function'))
  assert.equal(n.app, zops.minVersion)
  assert.deepEqual(n.features.map((f) => f.since), [...n.features.map((f) => f.since)].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })))
})

test('abgeschaltete oder leere Eigenschaften zählen nicht, ein leeres Zeilenende schon', () => {
  assert.equal(templateNeeds(fv, [vorlage([{ type: 'field', id: 'f', title: 'A', multiple: false, exclusiveOptions: [], dependsOn: null }])]), null)
  const n = templateNeeds(fv, [vorlage([{ type: 'function', id: 'm', title: 'Medikation', functionKind: 'medikamentenplan', config: { lineEnd: '' } }])])
  assert.deepEqual(n?.features.map((f) => f.key), ['config.lineEnd'])
})

test('Formatversion bleibt 1; der Vermerk reist mit und kommt beim Lesen wieder an', () => {
  const file = JSON.parse(exportTemplate(mehrfach, fv))
  assert.equal(file.version, 1)
  assert.equal(PROTOCOL_VERSION, 1)
  assert.equal(file.requires.app, since('multiple', 'field'))
  const r = parseTemplate(JSON.stringify(file))
  assert.ok(r.ok)
  assert.deepEqual(r.needs, file.requires)
  assert.deepEqual(r.tree, mehrfach)
  const ohne = parseTemplate(exportTemplate(mehrfach))
  assert.ok(ohne.ok && !('needs' in ohne))
})

test('ein kaputter Vermerk verhindert den Import nie', () => {
  for (const requires of ['x', 7, null, {}, { features: 'x' }, { features: [null, { name: 3 }, { name: 'A', since: 'bald' }] }]) {
    const r = parseTemplate(JSON.stringify({ schema: 'resqdocs-protocol', version: 1, requires, tree: schlicht }))
    assert.ok(r.ok && r.needs === undefined, JSON.stringify(requires))
  }
  assert.deepEqual(parseNeeds({ app: '0.0.1', features: [{ name: ' A ', since: '2.1' }, { name: 'B', since: '1.4.0', key: 'b' }] }),
    { app: '2.1', features: [{ key: 'b', name: 'B', since: '1.4.0' }, { key: '', name: 'A', since: '2.1' }] })
})

test('ältere App: Hinweis nennt Funktion, Version und die eigene Version; aktuelle App: kein Hinweis', () => {
  const r = detectAndParse(exportTemplate(mehrfach, fv))
  assert.ok(r.ok && r.kind === 'protocol')
  const alt = importNotice({ appVersion: '1.3.0', needs: r.needs, roots: [r.tree], knownKinds: FUNCTION_KINDS })!
  assert.match(alt, /^Diese Vorlage nutzt Funktionen, die es erst in einer neueren App-Version gibt: /)
  assert.ok(alt.includes(`${name('multiple', 'field')} (ab ${since('multiple', 'field')})`))
  assert.ok(alt.includes('Du hast Version 1.3.0.'))
  assert.match(alt, /Du kannst die Vorlage trotzdem übernehmen\./)
  assert.equal(importNotice({ appVersion: '99.0.0', needs: r.needs, roots: [r.tree], knownKinds: FUNCTION_KINDS }), null)
  assert.equal(importNotice({ appVersion: since('exclusiveOptions', 'field'), needs: r.needs, roots: [r.tree], knownKinds: FUNCTION_KINDS }), null)
  assert.equal(importNotice({ appVersion: '1.0.0', roots: [schlicht], knownKinds: FUNCTION_KINDS }), null)
})

test('ohne Vermerk: unbekannte Eigenschaften und Funktionsarten werden gemeldet', () => {
  const fremd = vorlage([{ type: 'field', id: 'f', title: 'A', zukunft: true }, { type: 'function', id: 'x', title: 'X', functionKind: 'morgen', neu: 1 }])
  assert.deepEqual(unknownParts([fremd], FUNCTION_KINDS), { props: ['neu', 'zukunft'], kinds: ['morgen'] })
  const text = importNotice({ appVersion: '2.2.0', roots: [fremd], knownKinds: FUNCTION_KINDS })!
  assert.match(text, /^Diese App-Version kennt nicht: Funktion „morgen“, „neu“, „zukunft“\. Du kannst die Vorlage trotzdem übernehmen\./)
})

test('was der Vermerk schon benennt, steht nicht noch einmal als unbekannt da', () => {
  const fremd = vorlage([{ type: 'field', id: 'f', title: 'A', zukunft: true, sonst: 1 }, { type: 'function', id: 'x', title: 'X', functionKind: 'morgen' }])
  const needs = parseNeeds({ features: [{ key: 'zukunft', name: 'Zukunftsfeld', since: '9.0.0' }, { key: 'function:morgen', name: 'Morgen-Rechner', since: '9.1.0' }] })
  const text = importNotice({ appVersion: '2.2.0', needs, roots: [fremd, schlicht], knownKinds: FUNCTION_KINDS })!
  assert.match(text, /^Diese Vorlagen nutzen Funktionen, .*: Zukunftsfeld \(ab 9\.0\.0\), Morgen-Rechner \(ab 9\.1\.0\)\. Du hast Version 2\.2\.0\. Außerdem unbekannt: „sonst“\. Du kannst die Vorlagen trotzdem übernehmen\./)
})

test('Sammlung: Vermerke der Vorlagen werden zusammengeführt, mehrere Vorlagen als Liste behalten ihn je Eintrag', () => {
  const liste = JSON.parse(exportTemplates([mehrfach, schlicht], fv))
  assert.ok(liste[0].requires && !liste[1].requires)
  const r = detectAndParse(exportCollection({ templates: [mehrfach, mehrfach], blocks: [schlicht], snippets: [] }, fv))
  assert.ok(r.ok && r.kind === 'bundle')
  assert.deepEqual(r.needs, templateNeeds(fv, [mehrfach]))
  assert.equal(mergeNeeds([undefined, null]), null)
})

test('bekannte Eigenschaften je Elementart stimmen mit dem aus model.ts erzeugten Schema überein', () => {
  const schema = JSON.parse(readFileSync(join(HERE, '../../ai-docs/generated/schema.json'), 'utf8'))
  for (const [type, def] of [['container', 'Container'], ['field', 'Field'], ['function', 'FunctionNode']] as const) {
    assert.deepEqual([...KNOWN_PROPS[type]].sort(), Object.keys(schema.definitions[def].properties).sort(), def)
  }
})

test('die Vorlagen im Repo enthalten nichts, was diese App nicht kennt', () => {
  for (const file of ['../../ai-docs/worked-example.json']) {
    const r = parseTemplate(readFileSync(join(HERE, file), 'utf8'))
    assert.ok(r.ok, file)
    assert.deepEqual(unknownParts([r.tree], FUNCTION_KINDS), { props: [], kinds: [] }, file)
  }
})
