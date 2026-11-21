// Wächter: Einsatz-Vorschau und Vorlagen-Vorschau zeigen den Protokolltext gleich (Maintainer 2026-11-21). Der frühere
// Umbruch-Modus der Einsatz-Vorschau ließ sich am iPhone nicht bis zum Ende scrollen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('Einsatz-Vorschau nutzt dieselbe Anzeige wie die Vorlagen-Vorschau (ohne Umbruch-Modus)', () => {
  const einsatz = read('./rebuild/EinsatzView.vue')
  assert.match(einsatz, /<OutputText :text="text" label="Protokolltext" \/>/)
  assert.doesNotMatch(einsatz, /<OutputText[^>]*\bwrap\b/)
  const output = read('../../../../packages/protocol-core-ui/components/OutputText.vue')
  assert.doesNotMatch(output, /data-output-wrap/)
})
