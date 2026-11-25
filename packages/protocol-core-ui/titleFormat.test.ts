// „Titel im Protokolltext zeigen“ an einem neuen Feld: Das Ergebnis muss zur Erklärung am Schalter passen
// („Puls: 80“), ohne dass sich der Protokolltext bestehender Vorlagen ändert.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@resqdocs/protocol-core/render'
import { DEFAULT_HEADING, type Container, type Node } from '@resqdocs/protocol-core/model'
import { INFO } from './terms.ts'
import { showTitlePatch, titleOnOwnLine } from './titleFormat.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const root = (...children: unknown[]): Container => ({ type: 'container', id: 'r', children } as unknown as Container)
const mit = (n: object, on = true): Node => ({ ...n, ...showTitlePatch(n as Node, on) } as Node)
const puls = { type: 'field', id: 'a', title: 'Puls', default: '80' }

test('neues Feld: Einschalten ergibt genau das Beispiel der Erklärung', () => {
  const beispiel = INFO.showTitle.examples!.find((e) => e.label === 'Mit Titel')!.output
  assert.equal(render(root(mit(puls))), beispiel)
  assert.equal(beispiel, 'Puls: 80')
  assert.deepEqual(showTitlePatch(puls as Node, true).heading, { ...DEFAULT_HEADING, prefix: '', suffix: ': ' })
})

test('Titel in eigener Zeile (mehrzeiliges Feld, Funktion): nur der Titel, wie in der Erklärung zu Mehrzeilig', () => {
  const verlauf = { type: 'field', id: 'a', title: 'Verlauf', default: 'Erste Zeile\nZweite Zeile', multiline: true }
  assert.equal(render(root(mit(verlauf))), INFO.multiline.examples![0].output)
  const fn = { type: 'function', id: 'f', title: 'Medikation', functionKind: 'medikamentenplan' }
  assert.ok(titleOnOwnLine(fn as Node))
  assert.deepEqual(showTitlePatch(fn as Node, true).heading, { ...DEFAULT_HEADING, prefix: '', suffix: '' })
  assert.deepEqual(showTitlePatch({ ...fn, titleInline: true } as Node, true).heading, { ...DEFAULT_HEADING, prefix: '', suffix: ': ' })
})

test('ein eigenes Format bleibt stehen, Ausschalten und Abschnitte ändern nur den Schalter', () => {
  const eigen = { ...puls, heading: { ...DEFAULT_HEADING, prefix: '- ', suffix: ' = ' } }
  assert.deepEqual(showTitlePatch(eigen as Node, true), { showTitle: true })
  assert.deepEqual(showTitlePatch(mit(puls), false), { showTitle: false })
  assert.equal(render(root(mit(mit(puls), false))), '80')
  // wieder einschalten: das vorbelegte Format ist noch da
  assert.equal(render(root(mit(mit(mit(puls), false)))), 'Puls: 80')
  const abschnitt = { type: 'container', id: 'c', title: 'Anamnese', children: [puls] }
  assert.deepEqual(showTitlePatch(abschnitt as Node, true), { showTitle: true })
  assert.equal(render(root(mit(abschnitt))), '## Anamnese\n80')
})

test('der Standard im Renderer bleibt: eine bestehende Vorlage mit Titel ohne Format gibt dasselbe aus wie bisher', () => {
  assert.equal(render(root({ ...puls, showTitle: true })), '## Puls80')
})

test('der Schalter im Panel nutzt diese Regel', () => {
  const vue = readFileSync(join(HERE, 'components/ContainerProperties.vue'), 'utf8')
  assert.match(vue, /@change="set\(showTitlePatch\(node, \(\$event\.target as HTMLInputElement\)\.checked\)\)"/)
  assert.doesNotMatch(vue, /set\(\{ showTitle:/)
})
