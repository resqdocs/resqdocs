// Gemeinsamer Verlauf (App und Online-Editor): Rückgängig/Wiederholen und der Schutz gegen Änderungen, die am
// Verlauf vorbei passieren (z. B. Vorlage im Vorlagen-Menü der App gelöscht).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick, ref } from 'vue'
import { useProtocolTree } from './useProtocolTree.ts'
import { useTreeHistory } from './useTreeHistory.ts'

test('Rückgängig und Wiederholen einer Änderung', async () => {
  const tree = useProtocolTree()
  const sel = ref<string | null>(null)
  const h = useTreeHistory(tree, sel)
  const vorher = tree.protocols.value.length
  h.change(null, () => tree.addProtocol('Neu'))
  await nextTick()
  assert.equal(tree.protocols.value.length, vorher + 1)
  assert.equal(h.canUndo.value, true)
  assert.equal(h.undo(), true)
  await nextTick()
  assert.equal(tree.protocols.value.length, vorher)
  assert.equal(h.canRedo.value, true)
  assert.equal(h.redo(), true)
  await nextTick()
  assert.equal(tree.protocols.value.length, vorher + 1)
})

test('Änderung am Verlauf vorbei leert ihn, statt sie später still zurückzuholen', async () => {
  const tree = useProtocolTree()
  const h = useTreeHistory(tree, ref<string | null>(null))
  h.change(null, () => tree.addProtocol('Über den Verlauf'))
  await nextTick()
  assert.equal(h.canUndo.value, true)
  tree.addProtocol('Am Verlauf vorbei')
  await nextTick()
  assert.equal(h.canUndo.value, false, 'sonst nähme Rückgängig die fremde Änderung mit zurück')
  assert.equal(h.undo(), false)
})
