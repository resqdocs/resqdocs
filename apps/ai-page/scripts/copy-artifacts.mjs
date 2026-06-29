#!/usr/bin/env node
// Kopiert die generierten KI-Doku-Artefakte aus ai-docs/ nach public/, damit die Seite sie ausliefert:
// - prompt.*.md  -> Anzeige im Editor-Hero
// - doc.*.md     -> die DOC_URL (/doc.de.md), die das LLM des Nutzers abruft, + Paste-Fallback
// - version.json -> Versions-Badge
// - schema.json + examples/ -> optionale Referenz
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const GEN = join(APP, '..', '..', 'ai-docs', 'generated')
const EX = join(APP, '..', '..', 'ai-docs', 'examples')
const PUB = join(APP, 'public')
mkdirSync(join(PUB, 'examples'), { recursive: true })

for (const f of ['prompt.de.md', 'prompt.en.md', 'doc.de.md', 'doc.en.md', 'schema.json', 'version.json']) {
  copyFileSync(join(GEN, f), join(PUB, f))
}
for (const f of readdirSync(EX).filter((x) => x.endsWith('.json'))) {
  copyFileSync(join(EX, f), join(PUB, 'examples', f))
}
console.log('OK  KI-Doku-Artefakte nach public/ kopiert')
