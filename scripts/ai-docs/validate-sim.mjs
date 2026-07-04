#!/usr/bin/env node
// validate-sim.mjs — Schiedsrichter fuer das LLM-Simulations-Gate (#261, nur lokal/Session-Werkzeug):
// prueft KI-erzeugte Vorlagen-JSONs mit dem ECHTEN App-Import (parseTemplate), dem echten Renderer
// und ajv gegen das veroeffentlichte Schema. Aufruf: node scripts/ai-docs/validate-sim.mjs <datei...>
import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseTemplate } from '../../packages/shared/templateIO.ts'
import { render } from '../../packages/shared/render.ts'
import { collectIds } from '../../packages/shared/creator.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const schema = JSON.parse(readFileSync(join(ROOT, 'ai-docs/generated/schema.json'), 'utf8'))
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)

let ok = true
for (const file of process.argv.slice(2)) {
  const problems = []
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (e) {
    console.log(`FAIL ${file}: nicht lesbar (${e.message})`)
    ok = false
    continue
  }
  const r = parseTemplate(raw)
  if (!r.ok) problems.push(`App-Import: ${r.error}`)
  else {
    const out = render(r.tree)
    if (!out.trim()) problems.push('render(): leere Ausgabe')
    const ids = collectIds(r.tree)
    if (new Set(ids).size !== ids.length) problems.push('doppelte ids')
    for (const id of ids) if (!/^[A-Za-z0-9_-]+$/.test(id)) problems.push(`id "${id}" unzulaessig`)
  }
  try {
    if (!validate(JSON.parse(raw))) {
      problems.push('Schema: ' + validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).slice(0, 5).join('; '))
    }
  } catch {
    /* JSON-Fehler schon oben gemeldet */
  }
  console.log(`${problems.length ? 'FAIL' : 'OK  '} ${file}${problems.length ? '\n     - ' + problems.join('\n     - ') : ''}`)
  if (problems.length) ok = false
}
process.exit(ok ? 0 : 1)
