#!/usr/bin/env node
// gen-ai-docs.mjs — erzeugt die KI-Doku-Artefakte fuer ai.resqdocs.app aus der QUELLE DER WAHRHEIT.
// KEIN DRIFT: schema.json kommt direkt aus packages/shared/model.ts (ts-json-schema-generator);
// PROTOCOL_VERSION/PROTOCOL_SCHEMA aus templateIO.ts. Prompt = Template + nur STABILE Werte (kein
// Commit) -> CI-Gate-stabil. Manifest traegt Commit/Zeit/Kanal und wird NICHT committet.
//
// Aufruf:  node scripts/build/gen-ai-docs.mjs
// Pruefen: node scripts/build/gen-ai-docs.mjs && git diff --exit-code ai-docs/generated/schema.json ai-docs/generated/prompt.de.md ai-docs/generated/prompt.en.md
import { createGenerator } from 'ts-json-schema-generator'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'ai-docs', 'generated')
mkdirSync(OUT, { recursive: true })

// 1) Schema aus model.ts (Typ Container) - die exakte Struktur, inkl. der Node-Union.
const containerSchema = createGenerator({
  path: join(ROOT, 'packages/shared/model.ts'),
  type: 'Container',
  skipTypeCheck: true,
}).createSchema('Container')

// 2) Wrapper-Konstanten aus templateIO.ts (Quelle der Wahrheit fuer Kompatibilitaet).
const tio = readFileSync(join(ROOT, 'packages/shared/templateIO.ts'), 'utf8')
const protocolVersion = Number((tio.match(/PROTOCOL_VERSION\s*=\s*(\d+)/) || [])[1] || 1)
const protocolSchema = (tio.match(/PROTOCOL_SCHEMA\s*=\s*'([^']+)'/) || [])[1] || 'resqdocs-protocol'

// 3) Veroeffentlichtes Schema = Wrapper {schema, version, tree} + die generierten Definitionen.
const wrapped = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://ai.resqdocs.app/schema.json',
  title: `ResQDocs Protokoll (Format v${protocolVersion})`,
  description: 'Format fuer KI-erzeugte Protokoll-Vorlagen. GENERIERT aus packages/shared/model.ts - nicht von Hand editieren.',
  type: 'object',
  required: ['schema', 'version', 'tree'],
  additionalProperties: false,
  properties: {
    schema: { const: protocolSchema },
    version: { const: protocolVersion },
    tree: { $ref: '#/definitions/Container' },
  },
  definitions: containerSchema.definitions,
}
const schemaJson = JSON.stringify(wrapped, null, 2)
writeFileSync(join(OUT, 'schema.json'), schemaJson + '\n')

// TOKEN = stabiler Format-Fingerprint (Hash des Schemas). Aendert sich NUR mit dem Format -> CI-stabil;
// das LLM echo't ihn aus der Doku (beweist echtes Lesen, faengt veraltete/halluzinierte Staende ab).
const token = `rd-fmt-v${protocolVersion}-${createHash('sha256').update(schemaJson).digest('hex').slice(0, 8)}`

// 4) manifest.json — Versions-/Kanal-Info fuers Seiten-Badge. Hat Commit/Zeit -> NICHT committen.
const appVersion = JSON.parse(readFileSync(join(ROOT, 'apps/pico-pwa/package.json'), 'utf8')).version
const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
const channel = process.env.AI_DOCS_CHANNEL || 'release'
writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify({ schema: protocolSchema, protocolVersion, token, appVersion, commit, channel, builtAt: new Date().toISOString() }, null, 2) + '\n',
)
// version.json — STABILE, committbare Versions-Info fuer das Seiten-Badge (ohne Commit/Zeit -> CI-stabil).
// Aendert sich bei Format- ODER App-Version -> erzwingt KI-Doku-Update beim Release.
writeFileSync(
  join(OUT, 'version.json'),
  JSON.stringify({ schema: protocolSchema, protocolVersion, token, appVersion }, null, 2) + '\n',
)

// 5) Vollstaendige Feld-Referenz AUS dem generierten Schema ableiten (kein Drift; nutzt die JSDoc aus
//    model.ts). withDesc=true (DE) haengt die Erklaerungen an; EN bleibt sprachneutral (Name + Typ).
function buildReference(defs, withDesc) {
  const propLine = (name, p, required) => {
    let t
    if (p.const !== undefined) t = `immer "${p.const}"`
    else if (p.enum) t = 'eines von ' + p.enum.map((v) => `"${v}"`).join(', ')
    else if (p.type === 'array') t = 'Liste' + (p.items && p.items.type ? ` von ${p.items.type}` : '')
    else if (p.$ref) {
      const refName = p.$ref.split('/').pop()
      const refDef = defs[refName]
      t = refDef && refDef.enum ? 'eines von ' + refDef.enum.map((v) => `"${v}"`).join(', ') : refName
    } else t = p.type || 'Wert'
    const desc = withDesc ? (p.description || '').replace(/\s+/g, ' ').trim() : ''
    return `- \`${name}\` (${t})${required ? ' — Pflicht' : ''}${desc ? ': ' + desc : ''}`
  }
  const block = (defName, label) => {
    const d = defs[defName]
    if (!d) return ''
    const req = new Set(d.required || [])
    const lines = Object.entries(d.properties || {}).map(([k, v]) => propLine(k, v, req.has(k)))
    return `#### ${label}\n${lines.join('\n')}`
  }
  const kinds = (defs.FunctionKind && defs.FunctionKind.enum ? defs.FunctionKind.enum : []).map((v) => `"${v}"`).join(', ')
  return [
    block('Container', 'Container — Abschnitt mit Kindern (children)'),
    block('Field', 'Field — Eingabefeld'),
    block('FunctionNode', `FunctionNode — Spezial-Funktion (functionKind: ${kinds})`),
    block('Heading', 'Heading — Titel-/Banner-Format (optional, fuer das Feld "heading")'),
    block('FunctionConfig', 'FunctionConfig — Ausgabe-Format einer Funktion (optional, fuer das Feld "config")'),
  ].filter(Boolean).join('\n\n')
}

// 6) Beispiele (sortiert) als beschriftete JSON-Bloecke fuer die Doku.
const examples = readdirSync(join(ROOT, 'ai-docs/examples'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => `### ${f.replace(/\.json$/, '')}\n\`\`\`json\n${readFileSync(join(ROOT, 'ai-docs/examples', f), 'utf8').trim()}\n\`\`\``)
  .join('\n\n')

// 7) Pro Sprache: KURZER Prompt (verweist auf die Doku-URL) + VOLLSTAENDIGE Doku (Schema + Referenz +
//    Render-Regeln + Beispiele). Beide nur mit STABILEN Werten (kein Commit) -> CI-Gate-stabil.
for (const lang of ['de', 'en']) {
  const docUrl = `https://ai.resqdocs.app/doc.${lang}.md`
  const prompt = readFileSync(join(ROOT, `ai-docs/prompt.template.${lang}.md`), 'utf8')
    .replaceAll('{{PROTOCOL_VERSION}}', String(protocolVersion))
    .replaceAll('{{PROTOCOL_SCHEMA}}', protocolSchema)
    .replaceAll('{{DOC_URL}}', docUrl)
  const doc = readFileSync(join(ROOT, `ai-docs/doc.template.${lang}.md`), 'utf8')
    .replaceAll('{{TOKEN}}', token)
    .replaceAll('{{PROTOCOL_VERSION}}', String(protocolVersion))
    .replaceAll('{{PROTOCOL_SCHEMA}}', protocolSchema)
    .replaceAll('{{SCHEMA_JSON}}', schemaJson)
    .replaceAll('{{FORMAT_REFERENCE}}', buildReference(wrapped.definitions, lang === 'de'))
    .replaceAll('{{EXAMPLES}}', examples)
  for (const [name, out] of [[`prompt.${lang}.md`, prompt], [`doc.${lang}.md`, doc]]) {
    const leftover = out.match(/\{\{[^}]+\}\}/)
    if (leftover) throw new Error(`Unersetzter Platzhalter in ${name}: ${leftover[0]}`)
    writeFileSync(join(OUT, name), out)
  }
}

console.log(`OK  schema.json (v${protocolVersion}, ${token}) · prompt.de/en.md · doc.de/en.md · manifest (app ${appVersion} / ${commit} / ${channel})`)
