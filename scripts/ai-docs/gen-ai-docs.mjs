#!/usr/bin/env node
// gen-ai-docs.mjs — erzeugt die KI-Doku-Artefakte fuer ai.resqdocs.app aus der QUELLE DER WAHRHEIT.
// KEIN DRIFT: schema.json kommt direkt aus packages/shared/model.ts (ts-json-schema-generator);
// PROTOCOL_VERSION/PROTOCOL_SCHEMA, die Import-Fehlermeldungen und das Worked-Example-Rendering
// kommen aus dem ECHTEN Code (templateIO.ts/render.ts, Node-Type-Stripping ab 22.18). Prompt =
// Template + nur STABILE Werte (kein Commit) -> CI-Gate-stabil. Manifest traegt Commit/Zeit/Kanal
// und wird NICHT committet.
//
// Aufruf:  npm run gen:ai-docs   ·   Gate: npm run gen:ai-docs:check
import { createGenerator } from 'ts-json-schema-generator'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PROTOCOL_SCHEMA, PROTOCOL_VERSION, parseTemplate } from '../../packages/shared/templateIO.ts'
import { render } from '../../packages/shared/render.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'ai-docs', 'generated')
mkdirSync(OUT, { recursive: true })

// 1) Schema aus model.ts (Typ Container) - die exakte Struktur, inkl. der Node-Union.
const containerSchema = createGenerator({
  path: join(ROOT, 'packages/shared/model.ts'),
  type: 'Container',
  skipTypeCheck: true,
}).createSchema('Container')

const protocolVersion = PROTOCOL_VERSION
const protocolSchema = PROTOCOL_SCHEMA

// 2) Veroeffentlichtes Schema = Wrapper {schema, version, tree} + die generierten Definitionen.
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

// 3) manifest.json — Versions-/Kanal-Info fuers Seiten-Badge. Hat Commit/Zeit -> NICHT committen.
const appVersion = JSON.parse(readFileSync(join(ROOT, 'apps/pico-pwa/package.json'), 'utf8')).version
let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
} catch {
  /* CI-Container ohne git-History -> Manifest bleibt nutzbar */
}
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

// 4) Vollstaendige Feld-Referenz AUS dem generierten Schema ableiten (kein Drift; nutzt die JSDoc aus
//    model.ts). DE haengt die Beschreibungen an; EN bekommt englische Typ-Labels/Blocktitel, die
//    JSDoc-Beschreibungen bleiben deutsch (die JSON-Schluessel/Werte sind ohnehin deutsch, §-Hinweis
//    in doc.template.en.md).
function buildReference(defs, lang) {
  const de = lang === 'de'
  const L = de
    ? { always: 'immer', oneOf: 'eines von', list: 'Liste', of: 'von', value: 'Wert', required: ' — Pflicht' }
    : { always: 'always', oneOf: 'one of', list: 'list', of: 'of', value: 'value', required: ' — required' }
  const propLine = (name, p, required) => {
    let t
    if (p.const !== undefined) t = `${L.always} "${p.const}"`
    else if (p.enum) t = `${L.oneOf} ` + p.enum.map((v) => `"${v}"`).join(', ')
    else if (p.type === 'array') t = L.list + (p.items && p.items.type ? ` ${L.of} ${p.items.type}` : '')
    else if (p.$ref) {
      const refName = p.$ref.split('/').pop()
      const refDef = defs[refName]
      t = refDef && refDef.enum ? `${L.oneOf} ` + refDef.enum.map((v) => `"${v}"`).join(', ') : refName
    } else t = p.type || L.value
    const desc = de ? (p.description || '').replace(/\s+/g, ' ').trim() : ''
    return `- \`${name}\` (${t})${required ? L.required : ''}${desc ? ': ' + desc : ''}`
  }
  const block = (defName, label) => {
    const d = defs[defName]
    if (!d) return ''
    const req = new Set(d.required || [])
    const lines = Object.entries(d.properties || {}).map(([k, v]) => propLine(k, v, req.has(k)))
    return `#### ${label}\n${lines.join('\n')}`
  }
  const kinds = (defs.FunctionKind && defs.FunctionKind.enum ? defs.FunctionKind.enum : []).map((v) => `"${v}"`).join(', ')
  const T = de
    ? {
        container: 'Container — Abschnitt mit Kindern (children)',
        field: 'Field — Eingabefeld',
        fn: `FunctionNode — Spezial-Funktion (functionKind: ${kinds})`,
        heading: 'Heading — Titel-/Banner-Format (optional, fuer das Feld "heading"; wenn gesetzt, IMMER mit allen 5 Eigenschaften)',
        config: 'FunctionConfig — Ausgabe-Format einer Funktion (optional, fuer das Feld "config")',
      }
    : {
        container: 'Container — section with children',
        field: 'Field — input field',
        fn: `FunctionNode — special function (functionKind: ${kinds})`,
        heading: 'Heading — title/banner format (optional, for the "heading" property; if set, ALWAYS with all 5 properties)',
        config: 'FunctionConfig — output format of a function (optional, for the "config" property)',
      }
  return [block('Container', T.container), block('Field', T.field), block('FunctionNode', T.fn), block('Heading', T.heading), block('FunctionConfig', T.config)]
    .filter(Boolean)
    .join('\n\n')
}

// 5) Beispiele: KURATIERTE Reihenfolge einfach -> komplex, Gold-Beispiel ZULETZT (Recency: Modelle
//    imitieren das zuletzt gesehene Beispiel am staerksten). Beschreibung je Sprache; neue Dateien im
//    Ordner MUESSEN hier eingetragen werden (sonst Abbruch -> kein stilles Weglassen).
const EXAMPLES = [
  {
    file: 'simple.json',
    de: 'Kleinste sinnvolle Vorlage: zwei Abschnitte mit einfachen Feldern. Passt als Startpunkt für kurze Zusatz-Vorlagen.',
    en: 'Smallest useful template: two sections with plain fields. A good starting point for short auxiliary templates.',
  },
  {
    file: 'mit-funktionen.json',
    de: 'Vorlage mit den Spezial-Funktionen Medikamentenplan und Ärzte (FunctionNode). Passt, wenn Scan-Funktionen gebraucht werden.',
    en: 'Template using the special functions medication list and doctors (FunctionNode). Use when scan functions are needed.',
  },
  {
    file: 'granular.json',
    de: 'Zeigt Layout-Feinheiten: einklappbar, als „nicht erhoben" abwählbar, Felder nebeneinander, Auswahl mit eigener Eingabe.',
    en: 'Shows layout details: collapsible, excludable, inline fields, select with custom input.',
  },
  {
    file: 'multiselect.json',
    de: 'Zeigt Mehrfachauswahl (`multiple`): Auskultation/Zyanose mit mehreren gleichzeitig wählbaren Optionen und einer exklusiven „Keine/Normal"-Option (`exclusiveOptions`), die alle anderen ausschließt. Ab App-Version 1.4.0.',
    en: 'Shows multi-select (`multiple`): auscultation/cyanosis with several options selectable at once and an exclusive "none/normal" option (`exclusiveOptions`) that excludes all others. From app version 1.4.0.',
  },
  {
    file: 'standardprotokoll.json',
    de: 'GOLD-BEISPIEL: vollständiges Standardprotokoll (Einsatz, Anamnese, Medikation, xABCDE, Messwerte, Maßnahmen, Übergabe). Dieses Beispiel zeigt das FORMAT und ist der Ausgangspunkt für „Standardprotokoll anpassen" — Struktur und Schreibweise exakt übernehmen, Inhalte (Abschnitte, Felder, Optionen) kommen aus dem Dialog mit dem Nutzer.',
    en: 'GOLD EXAMPLE: complete standard protocol (mission, history, medication, xABCDE, vitals, measures, handover). This example shows the FORMAT and is the starting point for "adapt the standard protocol" — copy structure and notation exactly; contents (sections, fields, options) come from the dialog with the user.',
  },
]
const exampleDir = join(ROOT, 'ai-docs/examples')
const onDisk = readdirSync(exampleDir).filter((f) => f.endsWith('.json')).sort()
const listed = EXAMPLES.map((e) => e.file).sort()
if (JSON.stringify(onDisk) !== JSON.stringify(listed)) {
  throw new Error(`ai-docs/examples/ und EXAMPLES-Liste stimmen nicht ueberein.\n  Ordner: ${onDisk.join(', ')}\n  Liste:  ${listed.join(', ')}`)
}
function buildExamples(lang) {
  return EXAMPLES.map((e) => {
    const raw = readFileSync(join(exampleDir, e.file), 'utf8').trim()
    return `### ${e.file.replace(/\.json$/, '')}\n${e[lang]}\n\`\`\`json\n${raw}\n\`\`\``
  }).join('\n\n')
}

// 6) Worked Example: JSON + die EXAKTE Ausgabe des echten Renderers (kein von Hand gepflegter
//    Output, der driften koennte). Import-Fehlermeldungen ebenso aus dem echten parseTemplate.
const workedRaw = readFileSync(join(ROOT, 'ai-docs/worked-example.json'), 'utf8').trim()
const workedParsed = parseTemplate(workedRaw)
if (!workedParsed.ok) throw new Error(`worked-example.json importiert nicht: ${workedParsed.error}`)
const workedOutput = render(workedParsed.tree)

const errOf = (s) => {
  const r = parseTemplate(s)
  if (r.ok) throw new Error('Fehler-Probe wurde unerwartet akzeptiert: ' + s)
  return r.error
}
const validTree = '"tree":{"type":"container","id":"x","children":[]}'
const ERR_JSON = errOf('{nope')
const ERR_SCHEMA = errOf(`{"schema":"anderes-format","version":${protocolVersion},${validTree}}`)
// Versions-Meldung interpoliert die gemeldete Zahl -> als Muster mit X ausweisen (Doku sagt dazu
// "X = die gemeldete Versionsangabe"), damit sie fuer jede Zahl "woertlich" bleibt.
const ERR_VERSION_PATTERN = errOf(`{"schema":"${protocolSchema}","version":${protocolVersion + 1},${validTree}}`).replace(
  String(protocolVersion + 1),
  'X',
)
const ERR_TREE = errOf(`{"schema":"${protocolSchema}","version":${protocolVersion},"tree":{"type":"field","id":"x"}}`)

// 6b) Feature-Versions-Gating: ab welcher APP-Version (nicht Format-Version) ein functionKind verfuegbar
//     ist - Funktionen kommen per Update dazu. Hand-gepflegt in ai-docs/feature-versions.json; der
//     Generator ERZWINGT, dass JEDER functionKind aus dem Schema dort steht (sonst ginge ein ungegatetes
//     Feature live -> Abbruch), analog zur EXAMPLES-Abdeckung.
const featureVersions = JSON.parse(readFileSync(join(ROOT, 'ai-docs/feature-versions.json'), 'utf8'))
const gatedKinds = featureVersions.functions.map((f) => f.kind).slice().sort()
const schemaKinds = [...(wrapped.definitions.FunctionKind?.enum ?? [])].sort()
if (JSON.stringify(gatedKinds) !== JSON.stringify(schemaKinds)) {
  throw new Error(
    `ai-docs/feature-versions.json deckt die functionKinds NICHT exakt ab.\n  Schema: ${schemaKinds.join(', ') || '(keine)'}\n  Datei:  ${gatedKinds.join(', ') || '(keine)'}\n  -> jeden functionKind mit seiner Mindest-App-Version eintragen (sonst ginge er ungegatet live).`,
  )
}
const appBaseline = featureVersions.baseline
function buildFeatureVersions(lang) {
  const de = lang === 'de'
  const fnHeader = de
    ? ['| Funktion | im JSON (`functionKind`) | ab App-Version |', '|---|---|---|']
    : ['| Function | in JSON (`functionKind`) | since app version |', '|---|---|---|']
  const fnRows = featureVersions.functions.map((f) => `| ${de ? f.de : f.en} | \`${f.kind}\` | ${f.minVersion} |`)
  const parts = [[...fnHeader, ...fnRows].join('\n')]
  // 6c) Field-Gating: einzelne Eigenschaften mit eigener Mindestversion (rein additiv, nicht erzwungen).
  const fields = featureVersions.fields ?? []
  if (fields.length) {
    const intro = de
      ? 'Zusätzlich sind einzelne **Eigenschaften** erst ab einer Mindestversion verfügbar:'
      : 'Additionally, individual **properties** are only available from a minimum version:'
    const fHeader = de
      ? ['| Eigenschaft | im JSON | gilt für | ab App-Version |', '|---|---|---|---|']
      : ['| Property | in JSON | applies to | since app version |', '|---|---|---|---|']
    const scope = (f) => (f.on === 'function' ? (de ? 'Funktionen' : 'functions') : f.on)
    const fRows = fields.map(
      (f) => `| ${de ? f.de : f.en} | \`${f.prop}\` | ${scope(f)} (${de ? f.note_de : f.note_en}) | ${f.minVersion} |`,
    )
    parts.push(intro + '\n\n' + [...fHeader, ...fRows].join('\n'))
  }
  return parts.join('\n\n')
}

// 7) Pro Sprache: KURZER Prompt (verweist auf die Doku-URL) + VOLLSTAENDIGE Doku (Schema + Referenz +
//    Render-Regeln + Worked Example + Fehler + Beispiele + Import). Nur STABILE Werte -> CI-Gate-stabil.
for (const lang of ['de', 'en']) {
  const docUrl = `https://ai.resqdocs.app/doc.${lang}.md`
  const fill = (s) =>
    s
      .replaceAll('{{TOKEN}}', token)
      .replaceAll('{{PROTOCOL_VERSION}}', String(protocolVersion))
      .replaceAll('{{PROTOCOL_SCHEMA}}', protocolSchema)
      .replaceAll('{{DOC_URL}}', docUrl)
      .replaceAll('{{FEATURE_VERSIONS}}', buildFeatureVersions(lang))
      .replaceAll('{{APP_BASELINE}}', appBaseline)
      .replaceAll('{{SCHEMA_JSON}}', schemaJson)
      .replaceAll('{{FORMAT_REFERENCE}}', buildReference(wrapped.definitions, lang))
      .replaceAll('{{EXAMPLES}}', buildExamples(lang))
      .replaceAll('{{WORKED_EXAMPLE_JSON}}', workedRaw)
      .replaceAll('{{WORKED_EXAMPLE_OUTPUT}}', workedOutput)
      .replaceAll('{{ERR_JSON}}', ERR_JSON)
      .replaceAll('{{ERR_SCHEMA}}', ERR_SCHEMA)
      .replaceAll('{{ERR_VERSION_PATTERN}}', ERR_VERSION_PATTERN)
      .replaceAll('{{ERR_TREE}}', ERR_TREE)
  const prompt = fill(readFileSync(join(ROOT, `ai-docs/prompt.template.${lang}.md`), 'utf8'))
  const doc = fill(readFileSync(join(ROOT, `ai-docs/doc.template.${lang}.md`), 'utf8'))
  for (const [name, out] of [[`prompt.${lang}.md`, prompt], [`doc.${lang}.md`, doc]]) {
    const leftover = out.match(/\{\{[^}]+\}\}/)
    if (leftover) throw new Error(`Unersetzter Platzhalter in ${name}: ${leftover[0]}`)
    writeFileSync(join(OUT, name), out)
  }
}

console.log(`OK  schema.json (v${protocolVersion}, ${token}) · prompt.de/en.md · doc.de/en.md · manifest (app ${appVersion} / ${commit} / ${channel})`)
