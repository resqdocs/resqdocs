// Der Hinweis „Getippter Text gemerkt — zurückholen“ steht UNTER der Eingabe, nicht darüber (Maintainer) -
// bei Feldern wie bei allen Funktionen gleich.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = [
  new URL('./EinsatzField.vue', import.meta.url),
  new URL('../../../../../packages/protocol-core-ui/components/functions/MedplanFunction.vue', import.meta.url),
  new URL('../../../../../packages/protocol-core-ui/components/functions/AerzteFunction.vue', import.meta.url),
  new URL('../../../../../packages/protocol-core-ui/components/functions/ScoreFunction.vue', import.meta.url),
]

test('„zurückholen“-Hinweis steht unter der Eingabe (Freitext-Feld davor)', () => {
  for (const f of FILES) {
    const tpl = readFileSync(f, 'utf8').split('<template>').slice(1).join('<template>')
    const hinweis = tpl.indexOf('Getippter Text gemerkt')
    const eingabe = tpl.search(/<(textarea|input|select)\b/)
    assert.ok(hinweis > 0 && eingabe > 0, `${f.pathname}: Hinweis oder Eingabe nicht gefunden`)
    assert.ok(hinweis > eingabe, `${f.pathname}: Hinweis steht über der Eingabe`)
  }
})
