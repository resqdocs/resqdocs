// Abschnitte im Aufbau der App einklappen: Logik und Wächter für die Darstellung im Baum.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextTick, ref } from 'vue'
import type { Container, Node } from '@resqdocs/protocol-core/model'
import { ancestorsOf, countDescendants, forgetTreeFolds, revealed, sectionIds, toggled, useTreeFold } from './treeFold.ts'

const field = (id: string): Node => ({ id, type: 'field', title: id }) as Node
const section = (id: string, children: Node[]): Container => ({ id, type: 'container', title: id, children }) as Container
const ROOT = section('root', [
  section('alarm', [field('stichwort'), field('anfahrt')]),
  section('xabcde', [section('a', [field('atemweg')]), section('b', [field('atmung'), field('spo2')])]),
  field('notiz'),
])

test('sectionIds: alle Abschnitte unter der Wurzel, die Wurzel nicht', () => {
  assert.deepEqual(sectionIds(ROOT), ['alarm', 'xabcde', 'a', 'b'])
})

test('ancestorsOf: Abschnitte auf dem Weg zum Element', () => {
  assert.deepEqual(ancestorsOf(ROOT, 'spo2'), ['xabcde', 'b'])
  assert.deepEqual(ancestorsOf(ROOT, 'notiz'), [])
  assert.deepEqual(ancestorsOf(ROOT, 'fehlt'), [])
})

test('revealed: klappt nur die Abschnitte über dem Element auf; ohne Änderung dieselbe Menge', () => {
  const set = new Set(['alarm', 'xabcde', 'b'])
  assert.deepEqual([...revealed(set, ROOT, 'spo2')], ['alarm'])
  assert.equal(revealed(set, ROOT, 'stichwort') === set, false)
  assert.equal(revealed(set, ROOT, 'notiz'), set)
})

test('toggled und countDescendants (alle Ebenen, wie im Online-Editor)', () => {
  assert.deepEqual([...toggled(new Set(['a']), 'b')], ['a', 'b'])
  assert.deepEqual([...toggled(new Set(['a']), 'a')], [])
  assert.equal(countDescendants(ROOT.children[1]), 5)
  assert.equal(countDescendants(field('x')), 0)
})

test('useTreeFold: startet offen, merkt sich den Zustand je Vorlage, solange die App offen ist', async () => {
  forgetTreeFolds()
  const id = ref('v1')
  const root = ref(ROOT)
  const f = useTreeFold(id, root)
  assert.equal(f.folded.value.size, 0, 'beim Start ist alles offen')
  f.foldAll()
  assert.deepEqual([...f.folded.value], ['alarm', 'xabcde', 'a', 'b'])
  f.reveal('atmung')
  assert.deepEqual([...f.folded.value], ['alarm', 'a'])
  id.value = 'v2'
  await nextTick()
  assert.equal(f.folded.value.size, 0, 'andere Vorlage: eigener Zustand')
  id.value = 'v1'
  await nextTick()
  assert.deepEqual([...f.folded.value], ['alarm', 'a'])
  // Der Aufbau wird am Handy beim Wechsel der Ansicht neu aufgebaut: ein neuer Aufruf findet den Zustand wieder.
  assert.deepEqual([...useTreeFold(ref('v1'), root).folded.value], ['alarm', 'a'])
  f.unfoldAll()
  assert.equal(f.folded.value.size, 0)
})

test('useTreeFold: neue Kennung nimmt den Zustand mit; Vorlagenwechsel wirkt sofort', () => {
  forgetTreeFolds()
  const id = ref('v1')
  const f = useTreeFold(id, ref(ROOT))
  f.toggle('alarm')
  f.rename('alarm', 'alarmierung')
  assert.deepEqual([...f.folded.value], ['alarmierung'])
  f.rename('fehlt', 'egal')
  assert.deepEqual([...f.folded.value], ['alarmierung'])
  id.value = 'v2'
  f.toggle('b') // im selben Schritt nach dem Wechsel: gehört zur neuen Vorlage
  assert.deepEqual([...f.folded.value], ['b'])
  id.value = 'v1'
  assert.deepEqual([...f.folded.value], ['alarmierung'])
})

test('Baum: Pfeil ist Schalter mit 44 px Tippfläche, Name wählt weiter aus, Führungslinie für die Ebenen', () => {
  const src = readFileSync(new URL('./components/ContainerTreeNode.vue', import.meta.url), 'utf8')
  const toggle = src.match(/<button[^>]*data-tree-fold[^>]*>/)?.[0] ?? ''
  assert.match(toggle, /\bh-11\b/)
  assert.match(toggle, /\bw-11\b/)
  assert.match(toggle, /:aria-expanded=/)
  assert.match(toggle, /@click="fold\.toggle\(node\.id\)"/)
  assert.match(src, /canFold = computed\(\(\) => props\.node\.type === 'container' && props\.depth > 0 && props\.node\.children\.length > 0\)/, 'leere Abschnitte haben keinen Pfeil')
  assert.match(src, /@click="tree\.select\(node\.id\)"/, 'Name springt weiter zu den Eigenschaften')
  assert.match(src, /data-tree-children :class="depth > 0 && depth <= 8 \? '[^']*border-l-2[^']*' : ''"/, 'Führungslinie unter dem Pfeil, Einrückung endet nach acht Ebenen')
  assert.equal((src.match(/min-w-11 px-1\.5!/g) ?? []).length, 4, 'Knöpfe der Zeile bleiben 44 px breit, nicht breiter (Platz für den Namen)')
  assert.match(src, /data-tree-folded-count/)
})

test('Aufbau der App: Einklappen und Ausklappen wie im Online-Editor, Einfügen und Verschieben klappen auf', () => {
  const src = readFileSync(new URL('../../apps/pico-pwa/src/components/rebuild/EditorView.vue', import.meta.url), 'utf8')
  assert.match(src, /provide\(TREE_FOLD, fold\)/)
  assert.match(src, />Einklappen</)
  assert.match(src, />Ausklappen</)
  assert.match(src, /watch\(selectedId, \(id\) => id && fold\.reveal\(id\)/, 'neu eingefügte oder gewählte Elemente sind zu sehen')
  for (const op of ['reparent', 'indent', 'outdent', 'moveUp', 'moveDown']) assert.match(src, new RegExp(`${op}\\([^)]*\\) \\{[^}]*fold\\.reveal\\(id\\)`), op)
  assert.match(src, /move\(childId, delta\) \{[^}]*fold\.reveal\(childId\)/)
  assert.match(src, /fold\.rename\(id, newId\)/, 'neue Kennung: eingeklappt bleibt eingeklappt')
})
