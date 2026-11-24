// Elemente und Vorlagen ohne Titel zeigen nie die interne Kennung (z. B. „n2“ oder „protokoll“), sondern sagen, was sie
// sind. App und Online-Editor nutzen dieselben Platzhalter.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import type { Node } from '@resqdocs/protocol-core/model'
import { UNTITLED_TEMPLATE, nodeLabel, templateLabel } from './nodeLabel.ts'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('Platzhalter je Art, Titel hat Vorrang, Leerzeichen zählen nicht als Titel', () => {
  assert.equal(nodeLabel({ type: 'field', id: 'n2' } as Node), 'Feld ohne Titel')
  assert.equal(nodeLabel({ type: 'field', id: 'n2', title: '   ' } as Node), 'Feld ohne Titel')
  assert.equal(nodeLabel({ type: 'container', id: 'c1', children: [] } as unknown as Node), 'Abschnitt ohne Titel')
  assert.equal(nodeLabel({ type: 'container', id: 'c1', children: [], cloze: { text: '' } } as unknown as Node), 'Lückentext ohne Titel')
  assert.equal(nodeLabel({ type: 'function', id: 'f1', functionKind: 'news2' } as unknown as Node), 'Funktion ohne Titel')
  assert.equal(nodeLabel({ type: 'field', id: 'n2', title: ' Atmung ' } as Node), 'Atmung')
  assert.equal(templateLabel({ title: '' }), UNTITLED_TEMPLATE)
  assert.equal(templateLabel({ title: 'RTW' }), 'RTW')
})

test('Einsatz, Lückentext, Aufbau und Vorschau beschriften über nodeLabel, nicht über die Kennung', () => {
  const files = [
    '../../apps/pico-pwa/src/components/rebuild/EinsatzField.vue',
    '../../apps/pico-pwa/src/components/rebuild/EinsatzSection.vue',
    '../../apps/pico-pwa/src/components/rebuild/ContainerFillToggle.vue',
    'components/functions/FunctionFillToggle.vue',
    'components/cloze/ClozeFillDialog.vue',
    'components/ContainerTreeNode.vue',
    'components/ContainerPreviewNode.vue',
  ]
  for (const f of files) {
    const s = read(f)
    assert.match(s, /nodeLabel\(/, `${f} nutzt nodeLabel`)
    assert.doesNotMatch(s, /\.title\.trim\(\)\) \|\| (props\.node|n)\.id\b/, `${f} fällt auf die Kennung zurück`)
  }
})

test('der Online-Editor nutzt dieselben Platzhalter (Wording App = Editor)', () => {
  const outline = '../../apps/protocol-editor/src/editor/outline.ts'
  if (!existsSync(new URL(outline, import.meta.url))) return
  const s = read(outline)
  assert.match(s, /import \{ nodeLabel \} from '@resqdocs\/protocol-core-ui\/nodeLabel\.ts'/)
  assert.doesNotMatch(s, /ohne Titel'/, 'keine eigene Fassung der Platzhalter')
})
