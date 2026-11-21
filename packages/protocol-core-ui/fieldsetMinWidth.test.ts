// Wächter: <fieldset> hat im Browser min-inline-size: min-content. Steht darin eine Liste mit langen Namen
// (truncate), wird das Fieldset so breit wie der längste Name und schiebt die Liste über den Kartenrand hinaus
// (iPhone, Teilen mit langem Textbaustein-Titel). Listen-Fieldsets brauchen deshalb min-w-0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = [
  '../../apps/pico-pwa/src/components/rebuild/TemplateIO.vue',
  '../../apps/protocol-editor/src/components/ShareDialog.vue',
  'components/ImportPickList.vue',
]

test('Listen-Fieldsets: min-w-0, damit lange Namen nicht über den Rand schieben', () => {
  for (const f of FILES) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    const tags = [...src.matchAll(/<fieldset\b[^>]*>/g)].map((m) => m[0])
    assert.ok(tags.length > 0, `${f}: kein fieldset gefunden`)
    const ohne = tags.filter((t) => !/class="[^"]*\bmin-w-0\b/.test(t))
    assert.deepEqual(ohne, [], `${f}: fieldset ohne min-w-0`)
  }
})
