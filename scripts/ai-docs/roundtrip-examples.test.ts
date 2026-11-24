// Laeuft mit:  node --test --experimental-strip-types
// Roundtrip-Gate: JEDES Doku-Beispiel (+ Worked Example) muss den ECHTEN App-Import bestehen
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
import { TYPEABLE_NON_ASCII, normalizeForTyping, untypeable } from '../../packages/shared/typeable.ts'

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

  // Die Muster halten sich an die Regel, die die Doku in §5 („Zeichen") vorgibt: Jeder Text darin ist schon
  // in der Form, die die Bridge tippt - nichts muss ersetzt werden, nichts kaeme als [?] an.
  test(`zeichen ${file}: nur Zeichen, die die Bridge tippen kann`, () => {
    const raw = readFileSync(join(AI_DOCS, file), 'utf8')
    const texts: string[] = []
    JSON.parse(raw, (_key, value) => {
      if (typeof value === 'string') texts.push(value)
      return value
    })
    for (const text of texts) {
      assert.equal(normalizeForTyping(text), text, `„${text}" enthaelt Zeichen, die erst ersetzt werden muessten`)
      assert.deepEqual(untypeable(text), [], `„${text}" enthaelt nicht tippbare Zeichen`)
    }
    const r = parseTemplate(raw)
    if (r.ok) assert.deepEqual(untypeable(render(r.tree)), [])
  })
}

for (const lang of ['de', 'en']) {
  test(`doc.${lang}.md nennt die tippbaren Zeichen aus derselben Liste wie App und Firmware-Test`, () => {
    const doc = readFileSync(join(AI_DOCS, 'generated', `doc.${lang}.md`), 'utf8')
    assert.ok(doc.includes(`\`${[...TYPEABLE_NON_ASCII].join(' ')}\``), 'Zeichenliste fehlt oder ist veraltet -> npm run gen:ai-docs')
    assert.ok(!readFileSync(join(AI_DOCS, `doc.template.${lang}.md`), 'utf8').includes([...TYPEABLE_NON_ASCII].join(' ')), 'die Liste steht nur als Platzhalter in der Vorlage, nie von Hand')
  })
}
