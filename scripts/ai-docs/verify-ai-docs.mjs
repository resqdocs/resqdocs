#!/usr/bin/env node
// verify-ai-docs.mjs — prueft, dass alle Beispiel-Protokolle gegen das GENERIERTE Schema gueltig sind.
// (Damit ist der Round-Trip belegt: was der Prompt erzeugen soll, validiert auch gegen das Schema.)
import Ajv2020 from 'ajv/dist/2020.js'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const schema = JSON.parse(readFileSync(join(ROOT, 'ai-docs/generated/schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

let ok = true
const dir = join(ROOT, 'ai-docs/examples')
const files = [
  ...readdirSync(dir)
    .filter((x) => x.endsWith('.json'))
    .map((f) => join(dir, f)),
  // Worked Example steht als "exakt nachzuahmendes Muster" in §5 der Doku -> genauso schema-gaten.
  join(ROOT, 'ai-docs/worked-example.json'),
]
for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const valid = validate(data)
  console.log(`${valid ? 'OK  ' : 'FAIL'} ${path.slice(path.indexOf('ai-docs'))}`)
  if (!valid) {
    ok = false
    console.log(JSON.stringify(validate.errors, null, 2))
  }
}
process.exit(ok ? 0 : 1)
