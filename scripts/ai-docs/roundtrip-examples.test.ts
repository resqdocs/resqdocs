// Laeuft mit:  node --test --experimental-strip-types
// Roundtrip-Gate (#261): JEDES Doku-Beispiel (+ Worked Example) muss den ECHTEN App-Import bestehen
// (parseTemplate) und mit dem echten Renderer eine nicht-leere Ausgabe liefern — Schema-Validitaet
// allein (verify-ai-docs.mjs) beweist noch keine Importierbarkeit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseTemplate } from '../../packages/shared/templateIO.ts'
import { render } from '../../packages/shared/render.ts'
import { collectIds } from '../../packages/shared/creator.ts'

const AI_DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ai-docs')
const files = [
  ...readdirSync(join(AI_DOCS, 'examples'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join('examples', f)),
  'worked-example.json', // steht in der Doku als "exakte Ausgabe" -> muss genauso importierbar sein
]

for (const file of files) {
  test(`roundtrip ${file}: App-Import ok, Ausgabe nicht leer, ids eindeutig`, () => {
    const r = parseTemplate(readFileSync(join(AI_DOCS, file), 'utf8'))
    assert.equal(r.ok, true, r.ok ? undefined : `parseTemplate: ${r.error}`)
    if (!r.ok) return
    const out = render(r.tree)
    assert.ok(out.trim().length > 0, 'render() lieferte eine leere Ausgabe')
    // DEFAULT_HEADING-Fallback ("## " + Titel klebt am Wert) darf nicht unbeabsichtigt in die
    // veroeffentlichten Muster rutschen: Ausgabe darf "## " nur enthalten, wenn die Quelle es setzt.
    if (!readFileSync(join(AI_DOCS, file), 'utf8').includes('## ')) {
      assert.ok(!out.includes('## '), 'Ausgabe enthaelt den "## "-Fallback -> heading fehlt an einem Titel-Knoten')
    }
    const ids = collectIds(r.tree)
    assert.equal(new Set(ids).size, ids.length, `doppelte ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`)
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]+$/, `id "${id}" nutzt unzulaessige Zeichen`)
  })
}
